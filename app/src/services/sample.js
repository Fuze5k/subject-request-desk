// Fictional sample data: a person who does not exist, example.com addresses, no real company.
// Used by the admin's "Add sample data" button and by the tests.
import { createRequest, setIdentity, applySearch, decideHit, setDraft, close } from '../domain/request.js';
import { draftResponse } from '../domain/response.js';
import { addDays, isoDate } from '../domain/deadline.js';

/** Work items to create in a project so the search of the open sample request has something to find. */
export const SAMPLE_ISSUES = [
  { summary: 'Invoice 2231 question from Jordan Rivera', description: 'Jordan Rivera (jordan.rivera@example.com) asked why invoice 2231 was billed twice. Refund approved, finance to confirm.' },
  { summary: 'Onboarding call notes: Fabrikam pilot', description: 'Call with Jordan Rivera, pilot owner on the customer side. Wants weekly status mail to jordan.rivera@example.com. Phone: +1 555 0100.' },
  { summary: 'Newsletter list cleanup', description: 'Remove bounced addresses. jordan.rivera@example.com bounced twice in October; keep until the customer confirms a new address.' },
];

/** @returns {Array<(id: string, actor: {accountId: string}) => object>} builders, so the store can assign the numbers */
export function sampleCases(now = new Date()) {
  const actor = (a) => ({ accountId: a });
  return [
    // A closed erasure request, to show what the audit record looks like.
    (id, a) => {
      const who = actor(a.accountId);
      const t0 = addDays(now, -52);
      const t = (n) => addDays(t0, n);
      const c = createRequest({ id, type: 'erasure', law: 'gdpr', receivedOn: isoDate(t0), channel: 'portal', subject: 'Casey Morgan (sample)', terms: ['Casey Morgan', 'casey.morgan@example.com'] }, who, t0);
      c.sample = true;
      setIdentity(c, { status: 'verified', method: 'Replied from the account email address' }, who, t(1));
      applySearch(c, { terms: c.terms, hits: [
        { ref: 'jira:DEMO-14', source: 'jira', id: 'DEMO-14', title: 'Onboarding checklist for Casey Morgan', container: 'Demo project' },
        { ref: 'jira:DEMO-31', source: 'jira', id: 'DEMO-31', title: 'Support chat export', container: 'Demo project' },
        { ref: 'confluence:90001', source: 'confluence', id: '90001', title: 'Customer interview notes', container: 'Research' },
      ] }, who, t(2));
      decideHit(c, 'jira:DEMO-14', { decision: 'relevant', action: 'erase' }, who, t(4));
      decideHit(c, 'jira:DEMO-31', { decision: 'relevant', action: 'redact', note: 'Name and email replaced' }, who, t(4));
      decideHit(c, 'confluence:90001', { decision: 'not-relevant', note: 'Different Casey; no match on email' }, who, t(5));
      setDraft(c, draftResponse(c, { outcome: 'fulfilled' }), who, t(6));
      close(c, { outcome: 'fulfilled', sentOn: isoDate(t(9)) }, who, t(9));
      return c;
    },
    // An open access request that has just been received.
    (id, a) => {
      const who = actor(a.accountId);
      const t0 = addDays(now, -5);
      const c = createRequest({ id, type: 'access', law: 'gdpr', receivedOn: isoDate(t0), channel: 'email', subject: 'Jordan Rivera (sample)', terms: ['Jordan Rivera', 'jordan.rivera@example.com'], notes: 'Sample request. Asks for a copy of everything we hold.' }, who, t0);
      c.sample = true;
      return c;
    },
  ];
}
