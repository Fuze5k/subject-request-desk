// Atlassian account IDs kept in request cases, for Atlassian's Personal Data Reporting API.
// A case keeps an account ID in these places: who opened it, who did each history step, who decided each hit, who
// checked the identity, who extended the deadline and who closed it. Nothing else about a person comes from Atlassian.

/** Put in place of the account ID of a closed Atlassian account: the case and its history stay readable. */
export const CLOSED_ACCOUNT = 'closed-account';

function* accountRefs(c) {
  if (c.openedBy) yield { id: c.openedBy, at: c.openedAt };
  for (const h of c.history || []) if (h.by) yield { id: h.by, at: h.at };
  for (const h of c.hits || []) if (h.by) yield { id: h.by, at: h.at };
  if (c.identity?.by) yield { id: c.identity.by, at: c.identity.at };
  if (c.extension?.by) yield { id: c.extension.by, at: c.extension.at };
  if (c.search?.by) yield { id: c.search.by, at: c.search.ranAt };
  if (c.closure?.by) yield { id: c.closure.by, at: c.closure.at };
}

/** Every account ID stored in the cases with the oldest time it was stored, as the API wants it. */
export function storedAccounts(cases) {
  const oldest = new Map();
  for (const c of cases) {
    for (const { id, at } of accountRefs(c)) {
      if (id === CLOSED_ACCOUNT || id === 'system') continue;
      if (!at) throw new Error(`request ${c.id} keeps account ${id} without a time`);
      if (!oldest.has(id) || at < oldest.get(id)) oldest.set(id, at);
    }
  }
  return [...oldest].map(([accountId, updatedAt]) => ({ accountId, updatedAt }));
}

export const keepsAny = (c, ids) => [...accountRefs(c)].some((r) => ids.has(r.id));

/** Replace the given (closed) account IDs in a case with CLOSED_ACCOUNT. Changes `c` in place. */
export function eraseAccounts(c, ids) {
  const fix = (o, k) => { if (o && ids.has(o[k])) o[k] = CLOSED_ACCOUNT; };
  fix(c, 'openedBy');
  for (const h of c.history || []) fix(h, 'by');
  for (const h of c.hits || []) fix(h, 'by');
  fix(c.identity, 'by');
  fix(c.extension, 'by');
  fix(c.search, 'by');
  fix(c.closure, 'by');
  c.version = (c.version || 1) + 1;
}
