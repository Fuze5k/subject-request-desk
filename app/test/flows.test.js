import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/services/requests.js';
import { createStore } from '../src/store/store.js';
import { createMemoryAdapter } from '../src/store/memoryAdapter.js';
import { createResolverHandlers } from '../src/resolvers.js';
import { createActions } from '../src/actions.js';

const NOW = new Date('2026-11-10T09:00:00Z');

function setup({ jira, conf, now = NOW } = {}) {
  const comments = [];
  const queries = [];
  const atl = {
    async getIssue(key) { return { key, summary: 'Please delete my data', description: 'I want my account erased.', project: 'PRIV', status: 'Open' }; },
    async searchJira(jql) {
      queries.push(jql);
      if (jira instanceof Error) throw jira;
      return { issues: jira ?? [{ key: 'PRIV-5', fields: { summary: 'Invoice question', project: { name: 'Privacy' } } }], truncated: false };
    },
    async searchConfluence(cql) {
      queries.push(cql);
      if (conf instanceof Error) throw conf;
      return { results: conf ?? [{ content: { id: '77', title: 'Meeting notes', _links: { webui: '/spaces/X/pages/77' } }, resultGlobalContainer: { title: 'Space X' } }], truncated: false };
    },
    async addComment(key, body) { comments.push({ key, text: JSON.stringify(body) }); },
    async createSampleIssue({ projectKey, summary }) { return { key: `${projectKey}-${comments.length + 1}`, summary }; },
  };
  const changed = [];
  const store = createStore(createMemoryAdapter());
  let clockNow = now;
  const svc = createService({
    store, atl, now: () => clockNow, changed: async (id) => { changed.push(id); },
    site: async () => ({ siteUrl: 'https://x.atlassian.net', pageUrl: '' }),
    reportAccounts: async (accounts) => accounts.filter((a) => a.accountId === 'gone').map((a) => ({ ...a, status: 'closed' })),
  });
  return { svc, store, atl, comments, queries, changed, setNow: (d) => { clockNow = d; } };
}
const officer = { accountId: 'officer-1' };

test('a request goes from intake to a closed audit record through the real service', async () => {
  const { svc, queries, comments } = setup();
  const { request } = await svc.create(officer, { type: 'erasure', subject: 'Jordan Rivera', terms: 'Jordan Rivera; jordan@example.com', issueKey: 'PRIV-9' });
  assert.equal(request.id, 'DSR-0001');
  assert.equal(request.due, '2026-12-10');
  assert.equal(request.stage, 'identity');

  await assert.rejects(svc.close(officer, 'DSR-0001', { outcome: 'fulfilled' }), (e) => e.code === 'BLOCKED');

  await svc.identity(officer, 'DSR-0001', { status: 'verified', method: 'Replied from the account email' });
  const found = await svc.search(officer, 'DSR-0001');
  assert.equal(found.added, 2);
  assert.match(queries[0], /text ~ "Jordan Rivera" OR text ~ "jordan@example.com"/);
  assert.equal(found.request.stage, 'review');

  await svc.decide(officer, 'DSR-0001', { refs: ['jira:PRIV-5', 'confluence:77'], patch: { decision: 'relevant', action: 'erase' } });
  const drafted = await svc.draft(officer, 'DSR-0001', {});
  assert.match(drafted.draft, /acted on your request: 2 items: erase/);
  const closed = await svc.close(officer, 'DSR-0001', { outcome: 'fulfilled' });
  assert.equal(closed.stage, 'closed');
  assert.equal(closed.clock.state, 'met');
  assert.equal(closed.subject, '[removed at closure]');
  assert.equal(comments.at(-1).key, 'PRIV-9');
  const report = await svc.report('DSR-0001');
  assert.match(report.markdown, /jira:PRIV-5: relevant \/ Erase/);
  assert.ok(!/Jordan/.test(report.markdown));
});

test('one source failing does not lose the other; both failing is an error', async () => {
  const a = setup({ conf: Object.assign(new Error('nope'), { permission: true }) });
  await a.svc.create(officer, { subject: 'Jordan', terms: 'Jordan Rivera' });
  const r = await a.svc.search(officer, 'DSR-0001');
  assert.equal(r.request.hits.length, 1);
  assert.match(r.errors[0], /Confluence: you are not allowed/);
  const b = setup({ jira: new Error('down'), conf: new Error('down') });
  await b.svc.create(officer, { subject: 'Jordan', terms: 'Jordan Rivera' });
  await assert.rejects(b.svc.search(officer, 'DSR-0001'), (e) => e.code === 'SEARCH_FAILED');
});

test('searching with no terms is refused', async () => {
  const { svc } = setup();
  await svc.create(officer, { subject: 'Jordan' });
  await assert.rejects(svc.search(officer, 'DSR-0001'), /at least one search term/);
});

test('request numbers do not collide and two writers cannot overwrite each other silently', async () => {
  const { svc, store } = setup();
  await Promise.all([svc.create(officer, { subject: 'A one' }), svc.create(officer, { subject: 'B two' })]);
  assert.deepEqual((await store.allRequests()).map((c) => c.id).sort(), ['DSR-0001', 'DSR-0002']);
  const c = await store.getRequest('DSR-0001');
  await store.saveRequest({ ...c, version: 2 }, 1);
  await assert.rejects(store.saveRequest({ ...c, version: 2 }, 1), (e) => e.code === 'STALE');
});

test('the daily check comments once per state on the linked work item and not at all without one', async () => {
  const t = setup({ now: new Date('2026-11-05T09:00:00Z') });
  await t.svc.create(officer, { subject: 'Linked one', receivedOn: '2026-11-05', issueKey: 'PRIV-1' });
  await t.svc.create(officer, { subject: 'Not linked', receivedOn: '2026-11-05' });
  assert.equal((await t.svc.daily()).comments.length, 0);
  t.setNow(new Date('2026-12-05T09:00:00Z'));
  const first = await t.svc.daily();
  assert.deepEqual(first.comments, ['DSR-0001']);
  assert.equal((await t.svc.daily()).comments.length, 0);
  t.setNow(new Date('2026-12-12T09:00:00Z'));
  assert.deepEqual((await t.svc.daily()).comments, ['DSR-0001']);
  assert.match(t.comments.at(-1).text, /has passed/);
});

test('the weekly report sends every account id and erases closed accounts from the cases', async () => {
  const { svc, store } = setup();
  await svc.create({ accountId: 'gone' }, { subject: 'Jordan' });
  await svc.create(officer, { subject: 'Casey' });
  const r = await svc.reportPersonalData();
  assert.equal(r.reported, 2);
  assert.deepEqual(r.erasedIn, ['DSR-0001']);
  assert.equal((await store.getRequest('DSR-0001')).openedBy, 'closed-account');
  assert.equal((await store.getRequest('DSR-0002')).openedBy, 'officer-1');
});

test('sample data adds a closed and an open request once', async () => {
  const { svc } = setup();
  const a = await svc.addSample(officer, 'PRIV');
  assert.equal(a.requests.length, 2);
  assert.equal(a.issues.length, 3);
  assert.equal((await svc.addSample(officer, '')).requests.length, 0);
  const b = await svc.board();
  assert.equal(b.open.length, 1);
  assert.equal(b.closed.length, 1);
  assert.equal(b.closed[0].outcomeName, 'Fulfilled');
});

test('the work item panel finds the linked request or suggests a type', async () => {
  const { svc } = setup();
  const empty = await svc.forIssue('PRIV-9');
  assert.equal(empty.request, null);
  assert.equal(empty.suggestion.type, 'erasure');
  await svc.create(officer, { subject: 'Jordan', issueKey: 'PRIV-9' });
  assert.equal((await svc.forIssue('PRIV-9')).request.id, 'DSR-0001');
});

test('UI resolvers need a signed-in user and turn domain errors into messages; admin-only ones check admin', async () => {
  const { svc } = setup();
  const h = createResolverHandlers({ service: svc, isAdmin: async () => false });
  assert.equal((await h.board({})).error.code, 'NO_USER');
  const ctx = { accountId: 'officer-1' };
  const bad = await h.create({ context: ctx, payload: { fields: { subject: '' } } });
  assert.equal(bad.ok, false);
  assert.match(bad.error.message, /who the request is about/);
  assert.equal((await h.saveSettings({ context: ctx, payload: { settings: {} } })).error.code, 'FORBIDDEN');
  assert.equal((await h.create({ context: ctx, payload: { fields: { subject: 'Jordan R.' } } })).ok, true);
});

test('Rovo actions never throw, refuse a bad id, and cannot verify identity or close a request', async () => {
  const { svc } = setup();
  const a = createActions({ service: svc, log: () => {} });
  const ctx = { principal: { accountId: 'officer-1' } };
  assert.equal((await a.getRequest({ requestId: 'nonsense' }, ctx)).error.code, 'INVALID');
  assert.equal((await a.getRequest({ requestId: 'DSR-0001' }, {})).error.code, 'NO_USER');
  const created = await a.createRequest({ subject: 'Jordan Rivera', terms: 'Jordan Rivera', type: 'access', context: { jira: { issueKey: 'PRIV-3' } } }, ctx);
  assert.equal(created.ok, true);
  assert.equal(created.request.linkedWorkItem, 'PRIV-3');
  const found = await a.findSubjectData({ requestId: 'DSR-0001' }, ctx);
  assert.equal(found.totalHits, 2);
  const dec = await a.recordDecision({ requestId: 'DSR-0001', refs: 'jira:PRIV-5, confluence:77', decision: 'relevant', action: 'provide' }, ctx);
  assert.equal(dec.request.hits.relevant, 2);
  const check = await a.checkClosure({ requestId: 'DSR-0001' }, ctx);
  assert.match(check.findings[0].message, /identity/);
  assert.equal(Object.keys(a).some((k) => /close|verify|identity/i.test(k)), false);
});
