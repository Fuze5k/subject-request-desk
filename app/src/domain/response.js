// The text of the answer to the requester and the closure record. Deterministic templates: the officer (or the Rovo
// agent, which only improves wording) edits them; nothing here is sent anywhere. The letter never repeats personal data
// found in Jira or Confluence: it states what was searched and what was done, by counts.
import { TYPES, OUTCOMES, ACTIONS, dueOf } from './request.js';
import { LAWS } from './deadline.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const COMPLAINT = {
  gdpr: 'You have the right to lodge a complaint with your national data protection supervisory authority, and to seek a judicial remedy.',
  'uk-gdpr': 'You have the right to complain to the Information Commissioner\'s Office (ico.org.uk), and to seek a judicial remedy.',
  ccpa: 'You may appeal this decision, and you may contact the California Attorney General or the California Privacy Protection Agency.',
  lgpd: 'You may lodge a complaint with the Brazilian data protection authority (ANPD).',
  custom: 'You may raise a complaint with the competent data protection authority.',
};

function actionCounts(c) {
  const counts = {};
  for (const h of c.hits) if (h.decision === 'relevant') counts[h.action || 'none'] = (counts[h.action || 'none'] || 0) + 1;
  return counts;
}

function what(c) {
  const rel = c.hits.filter((h) => h.decision === 'relevant');
  const counts = actionCounts(c);
  const parts = Object.entries(counts).map(([a, n]) => `${plural(n, 'item')}: ${(ACTIONS[a] || a).toLowerCase()}`);
  return { relevant: rel.length, parts };
}

/** A draft reply to the requester. `outcome` defaults to fulfilled. */
export function draftResponse(c, { outcome = 'fulfilled', reason = '', company = '[Company name]', sender = '[Name, role]' } = {}) {
  const rule = LAWS[c.law];
  const { relevant, parts } = what(c);
  const searched = c.search ? `We searched our work tracking (Jira) and documentation (Confluence) systems${c.search.ranAt ? ` on ${c.search.ranAt.slice(0, 10)}` : ''} and found ${plural(relevant, 'item')} that concern you.` : 'We searched our systems for information about you.';
  const lines = [`Subject: Your request of ${c.receivedOn} (${c.id})`, '', 'Hello,', '', `Thank you for your ${TYPES[c.type].split(' (')[0].toLowerCase()} request, received on ${c.receivedOn}.`];
  if (c.extension) lines.push(`We told you that we needed more time because: ${c.extension.reason}`);
  if (outcome === 'withdrawn') {
    lines.push('', 'We understand that you withdrew your request, so we have closed it. Nothing further will be done unless you contact us again.');
  } else if (outcome === 'refused') {
    lines.push('', searched, '', `We are not able to act on your request. Reason: ${reason || '[state the reason and the legal basis]'}`);
  } else {
    lines.push('', searched);
    if (c.type === 'access' || c.type === 'portability') lines.push('', c.type === 'portability' ? 'The data you provided to us is attached in a structured, commonly used, machine-readable format (CSV / JSON).' : 'A copy of your personal data, and the information required by the law (purposes, recipients, retention, source), is attached.');
    if (c.type === 'erasure') lines.push('', parts.length ? `We have acted on your request: ${parts.join('; ')}.` : 'We found no personal data that we are required to keep, and have erased what we hold.');
    if (c.type === 'rectification') lines.push('', 'We have corrected the data you identified as inaccurate.');
    if (c.type === 'restriction' || c.type === 'objection') lines.push('', 'We have stopped the processing you asked us to stop, except where we are required or permitted to continue (described below).');
    if (outcome === 'partial') lines.push('', `We could not fully act on your request. Reason: ${reason || '[state what was withheld, the exemption and its legal basis]'}`);
  }
  lines.push('', COMPLAINT[c.law] || COMPLAINT.custom, '', 'Kind regards,', sender, company);
  return lines.join('\n');
}

/** The closure record for the audit file: counts, decisions and references, no personal data from the hits. */
export function closureRecord(c) {
  const rule = LAWS[c.law];
  const { relevant, parts } = what(c);
  const lines = [
    `# Data subject request ${c.id}`, '',
    `| | |`, `|---|---|`,
    `| **Type** | ${TYPES[c.type]} |`, `| **Law** | ${rule.name} |`, `| **Received** | ${c.receivedOn} (${c.channel}) |`,
    `| **Deadline** | ${dueOf(c)}${c.extension ? ` (extended: ${c.extension.reason})` : ''} |`,
    `| **Identity** | ${c.identity.status}${c.identity.method ? ` - ${c.identity.method}` : ''}${c.identity.at ? ` (${c.identity.at.slice(0, 10)})` : ''} |`,
  ];
  if (c.closure) lines.push(`| **Outcome** | ${OUTCOMES[c.closure.outcome]} on ${c.closure.closedOn}${c.closure.reason ? ` - ${c.closure.reason}` : ''} |`);
  lines.push('', '## Search', '');
  if (c.search) lines.push(`Run ${c.search.ranAt.slice(0, 10)}: ${plural(c.search.jira, 'Jira work item')}, ${plural(c.search.confluence, 'Confluence page')}${c.search.truncated.jira || c.search.truncated.confluence ? ' (results were capped: search again with narrower terms)' : ''}.`);
  else lines.push('No search was run.');
  lines.push('', '## Decisions', '', `${plural(c.hits.length, 'hit')} reviewed, ${relevant} relevant${parts.length ? ` (${parts.join('; ')})` : ''}.`, '');
  for (const h of c.hits) lines.push(`- ${h.ref}: ${h.decision}${h.action ? ` / ${ACTIONS[h.action] || h.action}` : ''}${h.note ? ` - ${h.note}` : ''}`);
  lines.push('', '## History', '');
  for (const e of c.history) lines.push(`- ${e.at.slice(0, 16).replace('T', ' ')} UTC: ${e.what}`);
  return lines.join('\n');
}
