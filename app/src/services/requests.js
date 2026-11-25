// The request service: everything the screens, the Rovo actions and the daily job do, independent of Forge so it runs
// in tests with an in-memory store and a fake Atlassian adapter.
import { DomainError } from '../domain/errors.js';
import {
  createRequest, setTerms, setIdentity, applySearch, decideHit, extend, setDraft, close, view, stageOf, review, dueOf, TYPES,
} from '../domain/request.js';
import { LAWS, isoDate, clock } from '../domain/deadline.js';
import { buildJql, buildCql, jiraHit, confluenceHit, dedupe } from '../domain/search.js';
import { draftResponse, closureRecord } from '../domain/response.js';
import { storedAccounts, keepsAny, eraseAccounts } from '../domain/privacy.js';
import { sampleCases, SAMPLE_ISSUES } from './sample.js';

const str = (v) => (v == null ? '' : String(v).trim());
const ID = /^DSR-\d{4,}$/;

/** Plain text to Atlassian Document Format (one paragraph per blank-line block). */
export function adf(text) {
  const paras = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    type: 'doc', version: 1,
    content: paras.map((p) => ({
      type: 'paragraph',
      content: p.split('\n').flatMap((line, i) => (i ? [{ type: 'hardBreak' }, { type: 'text', text: line }] : [{ type: 'text', text: line }])),
    })),
  };
}

/** A request type guessed from the work item's summary, only to preselect the form. */
export function guessType(text) {
  const t = String(text || '').toLowerCase();
  if (/erase|erasure|delete|forgotten|remove my/.test(t)) return 'erasure';
  if (/rectif|correct|wrong|inaccurate/.test(t)) return 'rectification';
  if (/portab|machine-readable|transfer my/.test(t)) return 'portability';
  if (/restrict|stop processing/.test(t)) return 'restriction';
  if (/object|opt.?out|do not sell|unsubscribe/.test(t)) return 'objection';
  return 'access';
}

/**
 * @param {{store: object, atl: object, site?: () => Promise<{siteUrl: string, pageUrl: string}>, now?: () => Date, log?: Function, changed?: (id: string) => Promise<void>}} deps
 *   `changed` runs after every saved change, so open panels can reload the request.
 * @param {(accounts: {accountId: string, updatedAt: string}[]) => Promise<{accountId: string, status: string}[]>} [deps.reportAccounts]
 */
export function createService({
  store, atl, site = async () => ({ siteUrl: '', pageUrl: '' }), now = () => new Date(), log = () => {}, changed = async () => {},
  reportAccounts = async () => { throw new Error('No personal data reporter configured.'); },
}) {
  const today = () => isoDate(now());

  async function load(id) {
    const k = str(id).toUpperCase();
    if (!ID.test(k)) throw new DomainError('INVALID', `Say which request, for example DSR-0001 ("${id || ''}" is not a request number).`);
    const c = await store.getRequest(k);
    if (!c) throw new DomainError('NO_REQUEST', `There is no request ${k}.`);
    return c;
  }

  async function present(c) {
    const s = await store.getSettings();
    return { ...view(c, { today: today(), dueSoonDays: s.dueSoonDays }), siteUrl: (await site()).siteUrl };
  }

  /** Change a request with `fn` and save it, retrying once if someone saved in between. */
  async function change(id, fn) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const c = await load(id);
      const base = c.version || 1;
      const result = await fn(c);
      try {
        await store.saveRequest(c, base);
      } catch (err) {
        if (err instanceof DomainError && err.code === 'STALE' && attempt === 0) continue;
        throw err;
      }
      await changed(c.id);
      return { c, result };
    }
    throw new DomainError('STALE', 'The request was changed by someone else. Reload and try again.');
  }

  const svc = {
    async settings() {
      return store.getSettings();
    },
    async saveSettings(actor, raw) {
      return store.saveSettings(raw);
    },

    lawList: () => Object.values(LAWS).map((l) => ({ id: l.id, name: l.name, note: l.note })),
    typeList: () => Object.entries(TYPES).map(([id, name]) => ({ id, name })),

    async create(actor, fields) {
      const s = await store.getSettings();
      const c = await store.createRequest((id) => createRequest({ law: s.defaultLaw, ...fields, id }, actor, now()));
      await changed(c.id);
      return { created: true, request: await present(c) };
    },

    async get(id) {
      return present(await load(id));
    },

    /** The work item on screen: its request if one is linked, and a suggestion to start one. */
    async forIssue(key) {
      const k = str(key).toUpperCase();
      const issue = k ? await atl.getIssue(k) : null;
      if (!issue) throw new DomainError('NO_ISSUE', `Could not read work item ${k || '(none)'}.`);
      const linked = (await store.allRequests()).find((c) => c.issueKey === k);
      return {
        issue: { key: issue.key, summary: issue.summary },
        request: linked ? await present(linked) : null,
        suggestion: { type: guessType(`${issue.summary} ${issue.description}`), issueKey: issue.key },
      };
    },

    /** Open requests (soonest deadline first) and closed ones (latest first). */
    async board() {
      const s = await store.getSettings();
      const all = (await store.allRequests()).map((c) => view(c, { today: today(), dueSoonDays: s.dueSoonDays }));
      const open = all.filter((v) => !v.closure).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id < b.id ? -1 : 1));
      const closed = all.filter((v) => v.closure).sort((a, b) => (a.closure.closedOn < b.closure.closedOn ? 1 : -1));
      const row = (v) => ({
        id: v.id, type: v.type, typeName: v.typeName, lawName: v.lawName, subject: v.subject, receivedOn: v.receivedOn, due: v.due, clock: v.clock,
        stage: v.stage, stageName: v.stageName, issueKey: v.issueKey, hitCounts: v.hitCounts, outcomeName: v.outcomeName, closedOn: v.closure?.closedOn || null,
      });
      return {
        open: open.map(row), closed: closed.map(row),
        counts: { open: open.length, dueSoon: open.filter((v) => v.clock.state === 'due-soon').length, breached: open.filter((v) => v.clock.state === 'breached').length },
      };
    },

    async identity(actor, id, p) {
      const { c } = await change(id, (r) => setIdentity(r, p, actor, now()));
      return present(c);
    },

    async terms(actor, id, terms) {
      const { c } = await change(id, (r) => setTerms(r, terms, actor, now()));
      return present(c);
    },

    /** Search Jira and Confluence for the request's terms as the signed-in user and add the hits for review. */
    async search(actor, id, termsOverride) {
      if (termsOverride !== undefined) await svc.terms(actor, id, termsOverride);
      const c0 = await load(id);
      if (!c0.terms.length) throw new DomainError('INVALID', 'Add at least one search term (a name, an email, an alias) first.');
      const { siteUrl } = await site();
      const errors = [];
      const hits = [];
      const truncated = {};
      try {
        const r = await atl.searchJira(buildJql(c0.terms));
        hits.push(...r.issues.map((i) => jiraHit(i, siteUrl)));
        truncated.jira = r.truncated;
      } catch (err) {
        log('jira search failed', err);
        errors.push(err.permission ? 'Jira: you are not allowed to search.' : 'Jira search failed. Try again.');
      }
      try {
        const r = await atl.searchConfluence(buildCql(c0.terms));
        hits.push(...r.results.map((x) => confluenceHit(x, `${siteUrl}/wiki`)));
        truncated.confluence = r.truncated;
      } catch (err) {
        log('confluence search failed', err);
        errors.push(err.permission ? 'Confluence: you are not allowed to search.' : 'Confluence search failed (or Confluence is not on this site).');
      }
      if (errors.length === 2) throw new DomainError('SEARCH_FAILED', errors.join(' '));
      const { c, result } = await change(id, (r) => applySearch(r, { terms: c0.terms, hits: dedupe(hits), truncated, errors }, actor, now()));
      return { added: result.added, errors, request: await present(c) };
    },

    /** Decide one hit (`ref`) or several (`refs`) in one save. */
    async decide(actor, id, p) {
      const refs = p.refs?.length ? p.refs : [p.ref];
      const { c } = await change(id, (r) => { for (const ref of refs) decideHit(r, str(ref), p.patch || {}, actor, now()); });
      return present(c);
    },

    async extend(actor, id, reason) {
      const { c } = await change(id, (r) => extend(r, reason, actor, now()));
      return present(c);
    },

    /** Build a response draft from the case and save it. */
    async draft(actor, id, { outcome = 'fulfilled', reason = '' } = {}) {
      const s = await store.getSettings();
      const { c, result } = await change(id, (r) => {
        const text = draftResponse(r, { outcome, reason, company: s.company || undefined, sender: s.sender || undefined });
        setDraft(r, text, actor, now());
        return text;
      });
      return { draft: result, request: await present(c) };
    },

    async saveDraft(actor, id, text) {
      const { c } = await change(id, (r) => setDraft(r, text, actor, now()));
      return present(c);
    },

    /** What stops this request from being closed with `outcome`. */
    async review(id, outcome = 'fulfilled') {
      const c = await load(id);
      return { id: c.id, outcome, stage: stageOf(c), findings: review(c, outcome, today()) };
    },

    async close(actor, id, p) {
      const { c } = await change(id, (r) => close(r, { outcome: p.outcome, reason: p.reason, sentOn: p.sentOn }, actor, now()));
      if (c.issueKey && p.comment !== false) {
        await atl.addComment(c.issueKey, adf(`Subject Request Desk\n${c.id} closed: ${c.closure.outcome} on ${c.closure.closedOn}.`))
          .catch((err) => log(`closing comment failed on ${c.issueKey}`, err));
      }
      return present(c);
    },

    async report(id) {
      const c = await load(id);
      return { id: c.id, markdown: closureRecord(c) };
    },

    /** Daily: comment on the linked work item when a deadline is due soon or passed, once per state. */
    async daily() {
      const s = await store.getSettings();
      const out = { checked: 0, comments: [] };
      for (const c0 of await store.allRequests()) {
        if (c0.closure) continue;
        out.checked += 1;
        const clk = clock({ dueOn: dueOf(c0), today: today(), dueSoonDays: s.dueSoonDays });
        if (!(clk.state === 'due-soon' || clk.state === 'breached') || c0.notified === clk.state) continue;
        if (s.deadlineComments && c0.issueKey) {
          const text = clk.state === 'breached'
            ? `${c0.id}: the deadline (${dueOf(c0)}) has passed. Answer the requester now and record why it was late.`
            : `${c0.id}: the deadline is ${dueOf(c0)} (${clk.daysLeft} day${clk.daysLeft === 1 ? '' : 's'} left). Next step: ${view(c0, { today: today() }).stageName}.`;
          try {
            await atl.addComment(c0.issueKey, adf(`Subject Request Desk deadline\n${text}`));
            out.comments.push(c0.id);
          } catch (err) {
            log(`deadline comment failed on ${c0.issueKey}`, err);
            continue;
          }
        }
        await change(c0.id, (c) => { c.notified = clk.state; }).catch((err) => log('notified flag failed', err));
      }
      await store.setDaily({ at: now().toISOString(), ...out });
      return out;
    },

    dailyState: () => store.getDaily(),

    /**
     * Weekly: report every account ID the requests keep to Atlassian, and replace the IDs of accounts Atlassian says
     * are closed. Only IDs are kept, never a name or an email of an Atlassian user.
     */
    async reportPersonalData() {
      const cases = await store.allRequests();
      const accounts = storedAccounts(cases);
      const updates = await reportAccounts(accounts);
      const closed = new Set(updates.filter((u) => u.status === 'closed').map((u) => u.accountId));
      const erasedIn = [];
      for (const c of cases) {
        if (!keepsAny(c, closed)) continue;
        await change(c.id, (c2) => eraseAccounts(c2, closed));
        erasedIn.push(c.id);
      }
      return { reported: accounts.length, closed: closed.size, erasedIn };
    },

    /** Fictional sample data: three work items (and a closed and an open request about the fictional person). Admin only. */
    async addSample(actor, projectKey) {
      const made = [];
      if (projectKey) for (const i of SAMPLE_ISSUES) made.push((await atl.createSampleIssue({ projectKey, ...i })).key);
      const existing = await store.allRequests();
      if (existing.some((c) => c.sample)) return { requests: [], issues: made, note: 'Sample requests already exist.' };
      const ids = [];
      for (const make of sampleCases(now())) {
        const c = await store.createRequest((id) => make(id, actor));
        ids.push(c.id);
      }
      return { requests: ids, issues: made };
    },
  };
  return svc;
}
