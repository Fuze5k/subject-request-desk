// The data subject request case: its shape, the rules that gate each step, and what the next step is.
// Pure functions over a plain object (JSON in the key-value store). Functions that change a case mutate it and add a
// history entry; the service saves it. Nothing here calls Jira or Confluence.
import { DomainError } from './errors.js';
import { LAWS, DEFAULT_LAW, deadlines, clock, parseDate, isoDate, addDays, addMonths } from './deadline.js';
import { clean } from './text.js';

export const TYPES = Object.freeze({
  access: 'Access (copy of the data)',
  erasure: 'Erasure (right to be forgotten)',
  rectification: 'Rectification (correct the data)',
  portability: 'Portability (machine-readable copy)',
  restriction: 'Restriction of processing',
  objection: 'Objection / opt-out',
});

export const CHANNELS = Object.freeze({ email: 'Email', portal: 'Service portal', letter: 'Letter', other: 'Other' });
export const OUTCOMES = Object.freeze({ fulfilled: 'Fulfilled', partial: 'Partly fulfilled', refused: 'Refused', withdrawn: 'Withdrawn by the requester' });
export const ACTIONS = Object.freeze({ provide: 'Provide', erase: 'Erase', redact: 'Redact', correct: 'Correct', withhold: 'Withhold (exemption)', none: 'No action' });

export const MAX_TERMS = 8;
const TERM_MIN = 3;
const TERM_MAX = 100;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

/** Clean the search terms the officer typed: trimmed, 3-100 characters, no duplicates, at most MAX_TERMS. */
export function normalizeTerms(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[\n;]/);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const t = String(item ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TERM_MAX);
    if (t.length < TERM_MIN || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  if (out.length > MAX_TERMS) throw new DomainError('INVALID', `Use at most ${MAX_TERMS} search terms (names, emails, aliases).`);
  return out;
}

const stamp = (now) => `${now.toISOString().slice(0, 19)}Z`;

export function touch(c, actor, what, now = new Date()) {
  c.history.push({ at: stamp(now), by: actor?.accountId || 'system', what: clean(what, 300) });
  if (c.history.length > 200) c.history.splice(1, c.history.length - 200);
  c.version = (c.version || 1) + 1;
}

/** The effective deadline: the extended one when an extension was granted. */
export const dueOf = (c) => c.extension?.until || deadlines({ law: c.law, receivedOn: c.receivedOn, customDays: c.customDays }).due;

/**
 * @param {{id: string, type?: string, law?: string, customDays?: number, receivedOn?: string, channel?: string, subject?: string, terms?: any, issueKey?: string, notes?: string}} f
 * @param {{accountId: string}} actor
 */
export function createRequest(f, actor, now = new Date()) {
  const type = f.type || 'access';
  if (!TYPES[type]) throw new DomainError('INVALID', `Unknown request type "${type}".`);
  const law = f.law || DEFAULT_LAW;
  if (!LAWS[law]) throw new DomainError('INVALID', `Unknown law "${law}".`);
  const receivedOn = f.receivedOn || isoDate(now);
  const received = parseDate(receivedOn);
  if (!received) throw new DomainError('INVALID', `"${receivedOn}" is not a date. Use YYYY-MM-DD.`);
  if (received.getTime() > addDays(now, 1).getTime()) throw new DomainError('INVALID', 'The request cannot be received in the future.');
  const issueKey = String(f.issueKey || '').trim().toUpperCase();
  if (issueKey && !ISSUE_KEY.test(issueKey)) throw new DomainError('INVALID', `"${issueKey}" is not a work item key (they look like PRIV-12).`);
  const subject = clean(f.subject, 120);
  if (!subject) throw new DomainError('INVALID', 'Say who the request is about: a name or a reference you can recognise.');
  const channel = CHANNELS[f.channel] ? f.channel : 'email';
  const c = {
    id: f.id, version: 1, type, law,
    customDays: law === 'custom' ? Math.max(1, Math.min(365, Math.round(Number(f.customDays) || 30))) : null,
    receivedOn, channel, subject, terms: normalizeTerms(f.terms), notes: clean(f.notes, 600), issueKey: issueKey || null,
    extension: null,
    identity: { status: 'pending', method: '', note: '', at: null, by: null },
    search: null,
    hits: [],
    response: { draft: '', draftedAt: null, sentOn: null },
    closure: null,
    openedBy: actor.accountId, openedAt: stamp(now),
    history: [],
  };
  touch(c, actor, `Request received on ${receivedOn} (${TYPES[type]}, ${LAWS[law].name}).`, now);
  c.version = 1;
  return c;
}

export function setTerms(c, terms, actor, now = new Date()) {
  assertOpen(c);
  c.terms = normalizeTerms(terms);
  touch(c, actor, `Search terms set (${c.terms.length}).`, now);
}

export function setIdentity(c, { status, method, note }, actor, now = new Date()) {
  assertOpen(c);
  if (!['pending', 'verified', 'waived'].includes(status)) throw new DomainError('INVALID', 'Identity status must be pending, verified or waived.');
  const m = clean(method, 160);
  const n = clean(note, 400);
  if (status === 'verified' && !m) throw new DomainError('INVALID', 'Say how the identity was verified (for example "answered from the account email", "ID document seen").');
  if (status === 'waived' && n.length < 10) throw new DomainError('INVALID', 'Waiving the identity check needs a reason (at least a short sentence).');
  c.identity = { status, method: m, note: n, at: stamp(now), by: actor.accountId };
  touch(c, actor, `Identity check: ${status}${m ? ` (${m})` : ''}.`, now);
}

/** Merge a search into the case: new hits start as pending, hits seen before keep the decision made on them. */
export function applySearch(c, { terms, hits, truncated = {}, errors = [] }, actor, now = new Date()) {
  assertOpen(c);
  const known = new Map(c.hits.map((h) => [h.ref, h]));
  let added = 0;
  for (const h of hits) {
    if (known.has(h.ref)) {
      const k = known.get(h.ref);
      k.title = h.title || k.title;
      k.container = h.container || k.container;
      continue;
    }
    c.hits.push({ ref: h.ref, source: h.source, id: h.id, title: clean(h.title, 120), container: clean(h.container, 80), url: h.url || '', decision: 'pending', action: '', note: '', at: null, by: null });
    added += 1;
  }
  c.search = {
    ranAt: stamp(now), by: actor.accountId, terms: [...terms], truncated: { jira: !!truncated.jira, confluence: !!truncated.confluence },
    errors: errors.map((e) => clean(e, 200)),
    jira: hits.filter((h) => h.source === 'jira').length, confluence: hits.filter((h) => h.source === 'confluence').length,
  };
  touch(c, actor, `Search run: ${hits.length} hits (${added} new).`, now);
  return { added };
}

/**
 * Decide on one hit. decision: relevant | not-relevant | pending; for a relevant hit an action says what happens to it.
 * @param {{decision?: string, action?: string, note?: string}} p
 */
export function decideHit(c, ref, p, actor, now = new Date()) {
  assertOpen(c);
  const h = c.hits.find((x) => x.ref === ref);
  if (!h) throw new DomainError('NOT_FOUND', `No hit ${ref} in ${c.id}.`);
  const decision = p.decision ?? h.decision;
  if (!['pending', 'relevant', 'not-relevant'].includes(decision)) throw new DomainError('INVALID', 'Decision must be pending, relevant or not-relevant.');
  const action = decision === 'relevant' ? (p.action ?? h.action) : '';
  if (action && !ACTIONS[action]) throw new DomainError('INVALID', `Unknown action "${action}".`);
  const note = p.note !== undefined ? clean(p.note, 300) : h.note;
  if (action === 'withhold' && note.length < 5) throw new DomainError('INVALID', 'Withholding needs the exemption or reason in the note.');
  h.decision = decision;
  h.action = action;
  h.note = decision === 'pending' ? '' : note;
  h.at = stamp(now);
  h.by = actor.accountId;
  touch(c, actor, `${h.ref}: ${decision}${action ? ` / ${action}` : ''}.`, now);
  return h;
}

/** Ask for more time. Allowed once, before the deadline, only if the law has an extension, and with a reason. */
export function extend(c, reason, actor, now = new Date()) {
  assertOpen(c);
  const rule = LAWS[c.law];
  if (!rule.extension) throw new DomainError('INVALID', `${rule.name} has no extension.`);
  if (c.extension) throw new DomainError('INVALID', 'The deadline was already extended once.');
  const why = clean(reason, 400);
  if (why.length < 10) throw new DomainError('INVALID', 'An extension needs a reason: say why the request is complex or numerous.');
  const base = deadlines({ law: c.law, receivedOn: c.receivedOn, customDays: c.customDays });
  if (isoDate(now) > base.due) throw new DomainError('INVALID', 'The deadline has already passed, so it can no longer be extended.');
  c.extension = { until: base.latest, reason: why, at: stamp(now), by: actor.accountId };
  touch(c, actor, `Deadline extended to ${base.latest}: ${why}`, now);
}

export function setDraft(c, draft, actor, now = new Date()) {
  assertOpen(c);
  c.response.draft = String(draft || '').slice(0, 6000);
  c.response.draftedAt = stamp(now);
  touch(c, actor, 'Response draft saved.', now);
}

/** Where the request is, worked out from what is recorded, so it can never disagree with the data. */
export function stageOf(c) {
  if (c.closure) return 'closed';
  if (c.identity.status === 'pending') return 'identity';
  if (!c.search) return 'search';
  if (c.hits.some((h) => h.decision === 'pending')) return 'review';
  return 'response';
}

export const STAGES = Object.freeze({
  identity: 'Verify identity',
  search: 'Search Jira and Confluence',
  review: 'Review the hits',
  response: 'Answer the requester',
  closed: 'Closed',
});

/**
 * Findings that stop (block) or warn before the request can be closed with an outcome.
 * @returns {{level: 'block'|'warn', code: string, message: string, fix: string}[]}
 */
export function review(c, outcome = 'fulfilled', today = isoDate(new Date())) {
  const out = [];
  const add = (level, code, message, fix) => out.push({ level, code, message, fix });
  const closing = outcome === 'fulfilled' || outcome === 'partial';
  if (closing && c.identity.status === 'pending') add('block', 'identity', 'The requester\'s identity is not verified.', 'Record how it was verified, or waive the check with a reason.');
  if (closing && !c.search) add('block', 'search', 'Jira and Confluence were not searched.', 'Run the search on the Search step.');
  const pending = c.hits.filter((h) => h.decision === 'pending');
  if (closing && pending.length) add('block', 'pending-hits', `${pending.length} hit${pending.length === 1 ? ' is' : 's are'} not reviewed yet.`, 'Mark each hit relevant or not relevant.');
  const noAction = c.hits.filter((h) => h.decision === 'relevant' && !h.action);
  if (closing && noAction.length) add('block', 'no-action', `${noAction.length} relevant hit${noAction.length === 1 ? ' has' : 's have'} no action.`, 'Choose provide, erase, redact, correct or withhold for each.');
  if (c.type === 'erasure' && closing) {
    const notErased = c.hits.filter((h) => h.decision === 'relevant' && !['erase', 'redact', 'withhold', 'none'].includes(h.action));
    if (notErased.length) add('block', 'erasure-actions', 'An erasure request has relevant hits that are neither erased, redacted nor withheld.', 'Set the action to erase, redact or withhold (with the exemption).');
  }
  if (closing && !c.response.draft.trim()) add('warn', 'no-draft', 'There is no response text on file.', 'Draft the response so the audit file shows what was sent.');
  if (outcome === 'partial' || outcome === 'refused') add('warn', 'reason', 'A partial or refused outcome must state the reason and the right to complain.', 'Write the reason; the draft includes the complaint wording.');
  const due = dueOf(c);
  if (!c.closure && today > due) add('warn', 'late', `The deadline (${due}) has passed.`, 'Answer now and record why it was late.');
  return out;
}

/**
 * Close the request. A fulfilled or partial outcome must pass the review gates; a refusal or withdrawal needs a reason.
 * The search terms and hit titles are purged here: the closure record keeps references, counts and decisions only.
 */
export function close(c, { outcome, reason, sentOn }, actor, now = new Date()) {
  assertOpen(c);
  if (!OUTCOMES[outcome]) throw new DomainError('INVALID', 'Pick an outcome: fulfilled, partial, refused or withdrawn.');
  const why = clean(reason, 600);
  if (outcome !== 'fulfilled' && why.length < 10) throw new DomainError('INVALID', 'Say why (partly fulfilled, refused or withdrawn needs a reason).');
  const blocks = review(c, outcome, isoDate(now)).filter((f) => f.level === 'block');
  if (blocks.length) throw new DomainError('BLOCKED', `Cannot close yet: ${blocks.map((b) => b.message).join(' ')}`, { findings: blocks });
  const sent = sentOn || isoDate(now);
  if (!parseDate(sent)) throw new DomainError('INVALID', `"${sent}" is not a date. Use YYYY-MM-DD.`);
  c.response.sentOn = sent;
  c.closure = { outcome, reason: why, closedOn: sent, by: actor.accountId, at: stamp(now) };
  purge(c);
  touch(c, actor, `Closed: ${OUTCOMES[outcome]} on ${sent}.`, now);
}

export const PURGED = '[removed at closure]';

/** Remove what is not needed for the audit trail: search terms, the subject's label, hit titles and the free notes. */
export function purge(c) {
  c.terms = [];
  if (c.search) c.search.terms = [];
  c.subject = PURGED;
  c.notes = '';
  for (const h of c.hits) h.title = '';
  c.response.draft = c.response.draft ? PURGED : '';
}

export function assertOpen(c) {
  if (c.closure) throw new DomainError('CLOSED', `${c.id} is closed.`);
}

/** Today's picture of a case for the UI and the agent. */
export function view(c, { today = isoDate(new Date()), dueSoonDays = 7 } = {}) {
  const due = dueOf(c);
  const clk = clock({ dueOn: due, closedOn: c.closure?.closedOn || null, today, dueSoonDays });
  const base = deadlines({ law: c.law, receivedOn: c.receivedOn, customDays: c.customDays });
  const stage = stageOf(c);
  const decided = c.hits.filter((h) => h.decision !== 'pending').length;
  return {
    id: c.id, type: c.type, typeName: TYPES[c.type], law: c.law, lawName: LAWS[c.law].name, lawNote: LAWS[c.law].note,
    receivedOn: c.receivedOn, channel: c.channel, subject: c.subject, terms: c.terms, notes: c.notes, issueKey: c.issueKey,
    due, baseDue: base.due, latestDue: base.latest, extendable: base.extendable && !c.extension && !c.closure, extension: c.extension,
    clock: clk, stage, stageName: STAGES[stage], identity: c.identity, search: c.search,
    hits: c.hits, hitCounts: { total: c.hits.length, decided, pending: c.hits.length - decided, relevant: c.hits.filter((h) => h.decision === 'relevant').length },
    response: c.response, closure: c.closure, outcomeName: c.closure ? OUTCOMES[c.closure.outcome] : null,
    findings: c.closure ? [] : review(c, 'fulfilled', today), history: c.history.slice(-30), version: c.version,
    openedBy: c.openedBy, openedAt: c.openedAt,
  };
}

// Used by the sample data and tests that need to build dates relative to a case.
export { addMonths };
