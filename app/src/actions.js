// Rovo actions. Each returns { ok: true, ...facts } or { ok: false, error } and never throws, so the agent can
// explain a problem instead of failing. The agent can open a request, search, record decisions on hits, extend a
// deadline and draft the answer. It never verifies identity and never closes a request: those stay with a person.
import { DomainError } from './domain/errors.js';

const str = (v) => (v == null ? '' : String(v).trim());
const REQ_ID = /^DSR-\d{4,}$/;

function fail(err, log) {
  if (err instanceof DomainError) return { ok: false, error: { code: err.code, message: err.message } };
  log('action failed', err);
  return { ok: false, error: { code: 'INTERNAL', message: 'Subject Request Desk could not complete the request. Try again.' } };
}

/** The work item on screen, when Rovo is opened from a Jira work item. */
export function contextIssueKey(payload) {
  const jira = payload?.context?.jira;
  const key = str(jira?.issueKey).toUpperCase();
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) return key;
  if (jira?.projectKey && /^\d+$/.test(key)) return `${String(jira.projectKey).toUpperCase()}-${key}`;
  const m = str(jira?.url).match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
  return m ? m[1] : '';
}

function idFrom(p) {
  const id = str(p.requestId).toUpperCase();
  if (!REQ_ID.test(id)) throw new DomainError('INVALID', `Say which request (they look like DSR-0001). "${str(p.requestId)}" is not one.`);
  return id;
}

/** What the agent needs about a request: counts and references, never more of the requester's data than the officer typed. */
export function agentView(v) {
  return {
    id: v.id, type: v.typeName, law: v.lawName, receivedOn: v.receivedOn, deadline: v.due, extended: !!v.extension,
    clock: { state: v.clock.state, daysLeft: v.clock.daysLeft }, stage: v.stageName,
    subject: v.subject, searchTerms: v.terms, linkedWorkItem: v.issueKey,
    identity: v.identity.status + (v.identity.method ? ` (${v.identity.method})` : ''),
    search: v.search ? { ranAt: v.search.ranAt, jira: v.search.jira, confluence: v.search.confluence, capped: v.search.truncated, errors: v.search.errors } : null,
    hits: v.hitCounts, blockingFindings: v.findings.filter((f) => f.level === 'block').map((f) => `${f.message} Fix: ${f.fix}`),
    closed: v.closure ? { outcome: v.outcomeName, on: v.closure.closedOn } : null,
    people: 'Only a person verifies the requester\'s identity and closes a request, in the Subject Request Desk panel or page.',
  };
}

/** @param {{service: object, log?: Function}} deps */
export function createActions({ service, log = () => {} }) {
  const wrap = (fn) => async (payload = {}, context = {}) => {
    try {
      const accountId = context?.principal?.accountId || context?.accountId;
      if (!accountId) return { ok: false, error: { code: 'NO_USER', message: 'Subject Request Desk needs a signed-in Atlassian user.' } };
      return { ok: true, ...(await fn(payload || {}, { accountId, via: 'agent' }, context)) };
    } catch (err) {
      return fail(err, log);
    }
  };

  return {
    getRequest: wrap(async (p) => ({ request: agentView(await service.get(idFrom(p))) })),

    listRequests: wrap(async () => {
      const b = await service.board();
      return {
        counts: b.counts,
        open: b.open.map((r) => ({ id: r.id, type: r.typeName, subject: r.subject, deadline: r.due, clock: r.clock.state, daysLeft: r.clock.daysLeft, stage: r.stageName })),
        recentlyClosed: b.closed.slice(0, 5).map((r) => ({ id: r.id, type: r.typeName, outcome: r.outcomeName, closedOn: r.closedOn })),
      };
    }),

    createRequest: wrap(async (p, actor) => {
      const issueKey = str(p.issueKey).toUpperCase() || contextIssueKey(p);
      const r = await service.create(actor, {
        type: str(p.type) || undefined, law: str(p.law) || undefined, receivedOn: str(p.receivedOn) || undefined, channel: str(p.channel) || undefined,
        subject: p.subject, terms: p.terms, issueKey, notes: p.notes,
      });
      return { created: true, request: agentView(r.request) };
    }),

    findSubjectData: wrap(async (p, actor) => {
      const r = await service.search(actor, idFrom(p), p.terms !== undefined && str(p.terms) ? p.terms : undefined);
      const hits = r.request.hits.map((h) => ({ ref: h.ref, source: h.source, title: h.title, where: h.container, decision: h.decision }));
      return { added: r.added, errors: r.errors, totalHits: hits.length, hits: hits.slice(0, 60), note: hits.length > 60 ? 'Only the first 60 are listed; the rest are in the desk.' : undefined, request: agentView(r.request) };
    }),

    listHits: wrap(async (p) => {
      const v = await service.get(idFrom(p));
      const only = str(p.only);
      const hits = v.hits.filter((h) => !only || h.decision === only).map((h) => ({ ref: h.ref, source: h.source, title: h.title, where: h.container, decision: h.decision, action: h.action, note: h.note }));
      return { total: hits.length, hits: hits.slice(0, 80), request: agentView(v) };
    }),

    recordDecision: wrap(async (p, actor) => {
      const refs = str(p.refs).split(/[,\s]+/).filter(Boolean);
      if (!refs.length) throw new DomainError('INVALID', 'Give the hit references to decide on (for example jira:PRIV-12, confluence:12345).');
      const v = await service.decide(actor, idFrom(p), { refs, patch: { decision: str(p.decision), action: str(p.action) || undefined, note: p.note } });
      return { saved: true, request: agentView(v) };
    }),

    extendDeadline: wrap(async (p, actor) => ({ request: agentView(await service.extend(actor, idFrom(p), p.reason)) })),

    draftResponse: wrap(async (p, actor) => {
      const r = await service.draft(actor, idFrom(p), { outcome: str(p.outcome) || 'fulfilled', reason: p.reason });
      return { draft: r.draft, request: agentView(r.request), note: 'This is a draft saved on the request. A person edits and sends it.' };
    }),

    checkClosure: wrap(async (p) => service.review(idFrom(p), str(p.outcome) || 'fulfilled')),
  };
}
