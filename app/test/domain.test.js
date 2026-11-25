import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlines, clock, addMonths, parseDate } from '../src/domain/deadline.js';
import { normalizeTerms, createRequest, setIdentity, applySearch, decideHit, extend, close, review, stageOf, view, PURGED } from '../src/domain/request.js';
import { buildJql, buildCql, quote, jiraHit, confluenceHit } from '../src/domain/search.js';
import { draftResponse, closureRecord } from '../src/domain/response.js';
import { storedAccounts, eraseAccounts, CLOSED_ACCOUNT } from '../src/domain/privacy.js';

const me = { accountId: 'acc-1' };
const at = (s) => new Date(`${s}T10:00:00Z`);
const make = (over = {}, day = '2026-11-02') => createRequest({ id: 'DSR-0001', subject: 'Jordan R.', terms: ['Jordan Rivera'], receivedOn: day, ...over }, me, at(day));
const hit = (n, source = 'jira') => ({ ref: `${source}:${n}`, source, id: String(n), title: `Item ${n}`, container: 'P' });

test('GDPR deadline is one calendar month and clamps to the last day of a short month', () => {
  assert.deepEqual(deadlines({ law: 'gdpr', receivedOn: '2026-01-31' }), { due: '2026-02-28', latest: '2026-04-28', extendable: true });
  assert.equal(deadlines({ law: 'gdpr', receivedOn: '2026-11-02' }).due, '2026-12-02');
  assert.equal(addMonths(parseDate('2026-12-31'), 2).toISOString().slice(0, 10), '2027-02-28');
});

test('CCPA counts 45 days, LGPD 15 with no extension, custom uses the given days', () => {
  assert.equal(deadlines({ law: 'ccpa', receivedOn: '2026-11-02' }).due, '2026-12-17');
  assert.deepEqual(deadlines({ law: 'lgpd', receivedOn: '2026-11-02' }), { due: '2026-11-17', latest: '2026-11-17', extendable: false });
  assert.equal(deadlines({ law: 'custom', receivedOn: '2026-11-02', customDays: 10 }).due, '2026-11-12');
  assert.throws(() => deadlines({ law: 'gdpr', receivedOn: '2026-02-30' }), RangeError);
});

test('clock states: running, due soon, breached, met, met late', () => {
  const base = { dueOn: '2026-12-02', dueSoonDays: 7 };
  assert.deepEqual(clock({ ...base, today: '2026-11-10' }), { state: 'running', daysLeft: 22 });
  assert.deepEqual(clock({ ...base, today: '2026-11-25' }), { state: 'due-soon', daysLeft: 7 });
  assert.deepEqual(clock({ ...base, today: '2026-12-03' }), { state: 'breached', daysLeft: -1 });
  assert.equal(clock({ ...base, today: '2026-12-10', closedOn: '2026-12-02' }).state, 'met');
  assert.equal(clock({ ...base, today: '2026-12-10', closedOn: '2026-12-04' }).state, 'met-late');
});

test('search terms: trimmed, deduplicated, short ones dropped, too many refused', () => {
  assert.deepEqual(normalizeTerms('Jordan Rivera; jordan@example.com;\n  jordan rivera ; ab'), ['Jordan Rivera', 'jordan@example.com']);
  assert.throws(() => normalizeTerms(Array.from({ length: 9 }, (_, i) => `term ${i}`)), /at most 8/);
});

test('terms are escaped in JQL and CQL, so a typed quote cannot change the query', () => {
  assert.equal(quote('say "hi" \\ now'), '"say \\"hi\\" \\\\ now"');
  const jql = buildJql(['O"Brien', 'a@b.co']);
  assert.equal(jql, 'text ~ "O\\"Brien" OR text ~ "a@b.co" ORDER BY updated DESC');
  assert.equal(buildCql(['x" OR type = "space']), '(text ~ "x\\" OR type = \\"space") AND type in (page, blogpost)');
  assert.throws(() => buildJql([]));
});

test('hits from Jira and Confluence get stable refs and links', () => {
  assert.deepEqual(jiraHit({ key: 'PRIV-1', fields: { summary: 'S', project: { name: 'Privacy', key: 'PRIV' } } }, 'https://x.atlassian.net'),
    { ref: 'jira:PRIV-1', source: 'jira', id: 'PRIV-1', title: 'S', container: 'Privacy', url: 'https://x.atlassian.net/browse/PRIV-1' });
  const h = confluenceHit({ content: { id: '42', title: 'Page', _links: { webui: '/spaces/A/pages/42' } }, resultGlobalContainer: { title: 'Space A' } }, 'https://x.atlassian.net/wiki');
  assert.equal(h.ref, 'confluence:42');
  assert.equal(h.url, 'https://x.atlassian.net/wiki/spaces/A/pages/42');
});

test('the stage follows the data: identity, search, review hits, answer, closed', () => {
  const c = make();
  assert.equal(stageOf(c), 'identity');
  setIdentity(c, { status: 'verified', method: 'Replied from the account email' }, me, at('2026-11-03'));
  assert.equal(stageOf(c), 'search');
  applySearch(c, { terms: c.terms, hits: [hit(1), hit(2)] }, me, at('2026-11-03'));
  assert.equal(stageOf(c), 'review');
  decideHit(c, 'jira:1', { decision: 'relevant', action: 'provide' }, me, at('2026-11-04'));
  decideHit(c, 'jira:2', { decision: 'not-relevant' }, me, at('2026-11-04'));
  assert.equal(stageOf(c), 'response');
});

test('identity: verified needs a method, waived needs a reason', () => {
  const c = make();
  assert.throws(() => setIdentity(c, { status: 'verified', method: '' }, me), /how the identity/);
  assert.throws(() => setIdentity(c, { status: 'waived', note: 'ok' }, me), /reason/);
  setIdentity(c, { status: 'waived', note: 'Known customer, request came from the account owner address' }, me);
  assert.equal(c.identity.status, 'waived');
});

test('a new search keeps decisions made on hits seen before and adds only the new ones as pending', () => {
  const c = make();
  applySearch(c, { terms: c.terms, hits: [hit(1)] }, me, at('2026-11-03'));
  decideHit(c, 'jira:1', { decision: 'not-relevant', note: 'other person' }, me, at('2026-11-03'));
  const r = applySearch(c, { terms: c.terms, hits: [hit(1), hit(2)] }, me, at('2026-11-04'));
  assert.equal(r.added, 1);
  assert.equal(c.hits.find((h) => h.ref === 'jira:1').decision, 'not-relevant');
  assert.equal(c.hits.find((h) => h.ref === 'jira:2').decision, 'pending');
});

test('withholding a hit needs the exemption in the note', () => {
  const c = make();
  applySearch(c, { terms: c.terms, hits: [hit(1)] }, me);
  assert.throws(() => decideHit(c, 'jira:1', { decision: 'relevant', action: 'withhold' }, me), /exemption/);
  decideHit(c, 'jira:1', { decision: 'relevant', action: 'withhold', note: 'Legal privilege (Art. 15(4))' }, me);
});

test('extension: once, with a reason, before the deadline, only where the law allows', () => {
  const c = make();
  assert.throws(() => extend(c, 'short', me, at('2026-11-10')), /reason/);
  extend(c, 'Complex request touching many systems', me, at('2026-11-10'));
  assert.equal(c.extension.until, '2027-02-02');
  assert.throws(() => extend(c, 'Complex request touching many systems', me, at('2026-11-11')), /already/);
  assert.throws(() => extend(make({ law: 'lgpd' }), 'Complex request touching many systems', me, at('2026-11-10')), /no extension/);
  assert.throws(() => extend(make(), 'Complex request touching many systems', me, at('2026-12-03')), /already passed/);
});

test('closing as fulfilled is blocked until identity, search, every hit and every action are done', () => {
  const c = make();
  assert.throws(() => close(c, { outcome: 'fulfilled' }, me, at('2026-11-20')), (e) => e.code === 'BLOCKED' && /identity/.test(e.message) && /not searched/.test(e.message));
  setIdentity(c, { status: 'verified', method: 'ID seen' }, me);
  applySearch(c, { terms: c.terms, hits: [hit(1), hit(2)] }, me);
  assert.match(review(c).map((f) => f.message).join(' '), /2 hits are not reviewed/);
  decideHit(c, 'jira:1', { decision: 'relevant' }, me);
  decideHit(c, 'jira:2', { decision: 'not-relevant' }, me);
  assert.match(review(c).map((f) => f.message).join(' '), /1 relevant hit has no action/);
  decideHit(c, 'jira:1', { action: 'provide' }, me);
  assert.deepEqual(review(c).filter((f) => f.level === 'block'), []);
});

test('an erasure request cannot close with a relevant hit that is only provided', () => {
  const c = make({ type: 'erasure' });
  setIdentity(c, { status: 'verified', method: 'ID seen' }, me);
  applySearch(c, { terms: c.terms, hits: [hit(1)] }, me);
  decideHit(c, 'jira:1', { decision: 'relevant', action: 'provide' }, me);
  assert.throws(() => close(c, { outcome: 'fulfilled' }, me, at('2026-11-20')), /neither erased/);
  decideHit(c, 'jira:1', { action: 'erase' }, me);
  close(c, { outcome: 'fulfilled', sentOn: '2026-11-20' }, me, at('2026-11-20'));
});

test('a refusal needs a reason; closing purges the terms, subject, titles and draft but keeps refs and decisions', () => {
  const c = make();
  assert.throws(() => close(c, { outcome: 'refused' }, me), /Say why/);
  setIdentity(c, { status: 'verified', method: 'ID seen' }, me);
  applySearch(c, { terms: c.terms, hits: [hit(1)] }, me);
  decideHit(c, 'jira:1', { decision: 'relevant', action: 'provide' }, me);
  c.response.draft = draftResponse(c, {});
  close(c, { outcome: 'fulfilled', sentOn: '2026-11-20' }, me, at('2026-11-20'));
  assert.equal(c.subject, PURGED);
  assert.deepEqual(c.terms, []);
  assert.deepEqual(c.search.terms, []);
  assert.equal(c.hits[0].title, '');
  assert.equal(c.hits[0].ref, 'jira:1');
  assert.equal(c.hits[0].action, 'provide');
  assert.equal(c.response.draft, PURGED);
  assert.throws(() => decideHit(c, 'jira:1', { decision: 'pending' }, me), /closed/);
  assert.equal(view(c, { today: '2026-12-20' }).clock.state, 'met');
});

test('the draft and the closure record never repeat hit titles or search terms', () => {
  const c = make({ subject: 'Jordan Rivera', terms: ['Jordan Rivera', 'jr@example.com'] });
  setIdentity(c, { status: 'verified', method: 'ID seen' }, me);
  applySearch(c, { terms: c.terms, hits: [hit(1)] }, me);
  decideHit(c, 'jira:1', { decision: 'relevant', action: 'provide' }, me);
  const text = draftResponse(c, {}) + closureRecord(c);
  assert.ok(!/Item 1|jr@example.com|Jordan Rivera/.test(text));
  assert.match(text, /1 item that concern you/);
  assert.match(draftResponse(c, { outcome: 'refused', reason: 'Manifestly unfounded' }), /Reason: Manifestly unfounded/);
});

test('account ids are collected with their oldest time and replaced when Atlassian says the account is closed', () => {
  const c = make();
  setIdentity(c, { status: 'verified', method: 'ID seen' }, { accountId: 'acc-2' }, at('2026-11-03'));
  const accounts = storedAccounts([c]);
  assert.deepEqual(accounts.map((a) => a.accountId).sort(), ['acc-1', 'acc-2']);
  assert.equal(accounts.find((a) => a.accountId === 'acc-1').updatedAt, '2026-11-02T10:00:00Z');
  eraseAccounts(c, new Set(['acc-2']));
  assert.equal(c.identity.by, CLOSED_ACCOUNT);
  assert.ok(c.history.some((h) => h.by === CLOSED_ACCOUNT));
  assert.equal(c.openedBy, 'acc-1');
});
