// Turning the officer's search terms into JQL and CQL, and Jira / Confluence search results into hits.
// Quoting matters: a term is user-typed text that goes into a query language, so it is escaped, never concatenated raw.

/** Escape a term for use inside a double-quoted JQL or CQL string. */
export function quote(term) {
  const t = String(term).replace(/[\u0000-\u001f]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${t}"`;
}

/** JQL for work items whose text (summary, description, comments, text fields) mentions any term. */
export function buildJql(terms) {
  if (!terms.length) throw new RangeError('No search terms.');
  return `${terms.map((t) => `text ~ ${quote(t)}`).join(' OR ')} ORDER BY updated DESC`;
}

/** CQL for Confluence pages and blog posts that mention any term. */
export function buildCql(terms) {
  if (!terms.length) throw new RangeError('No search terms.');
  return `(${terms.map((t) => `text ~ ${quote(t)}`).join(' OR ')}) AND type in (page, blogpost)`;
}

/** A Jira issue from the search API -> a hit. */
export function jiraHit(issue, siteUrl = '') {
  return {
    ref: `jira:${issue.key}`, source: 'jira', id: issue.key, title: issue.fields?.summary || '',
    container: issue.fields?.project?.name || issue.fields?.project?.key || '', url: siteUrl ? `${siteUrl}/browse/${issue.key}` : `/browse/${issue.key}`,
  };
}

/** A Confluence search result -> a hit. `base` is the wiki base such as https://site.atlassian.net/wiki. */
export function confluenceHit(result, base = '') {
  const c = result.content || result;
  const webui = c._links?.webui || result.url || '';
  return {
    ref: `confluence:${c.id}`, source: 'confluence', id: String(c.id), title: c.title || result.title || '',
    container: result.resultGlobalContainer?.title || c.space?.name || '', url: webui ? `${base}${webui.startsWith('/') ? '' : '/'}${webui}` : '',
  };
}

/** Merge hits from several searches, one per ref. */
export function dedupe(hits) {
  const seen = new Map();
  for (const h of hits) if (!seen.has(h.ref)) seen.set(h.ref, h);
  return [...seen.values()];
}
