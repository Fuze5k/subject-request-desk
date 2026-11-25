// Jira and Confluence REST adapter. Searches and reads run as the signed-in user, so Atlassian's own permissions
// decide what the officer sees: the desk never searches with more rights than the person asking has.
import api, { route } from '@forge/api';
import { adfToText } from '../domain/text.js';

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };
const SEARCH_CAP = 100;

async function parse(res, what) {
  if (res.status === 404 || res.status === 401) return null;
  if (res.status === 403) throw Object.assign(new Error(`${what}: not allowed for this user (HTTP 403).`), { permission: true });
  if (!res.ok) throw new Error(`${what} failed: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function createAtlassian() {
  const user = () => api.asUser();
  const app = () => api.asApp();

  return {
    /** Work items matching a JQL, as the current user: {hits: [{key, summary, project}], truncated}. */
    async searchJira(jql) {
      const res = await user().requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ jql, maxResults: SEARCH_CAP, fields: ['summary', 'project'] }),
      });
      const data = await parse(res, 'Jira search');
      const issues = data?.issues || [];
      return { issues, truncated: data ? data.isLast === false || !!data.nextPageToken : false };
    },

    /** Confluence content matching a CQL, as the current user. Returns {results, base, truncated}. */
    async searchConfluence(cql) {
      const res = await user().requestConfluence(route`/wiki/rest/api/search?cql=${cql}&limit=${SEARCH_CAP}`, { headers: { Accept: 'application/json' } });
      const data = await parse(res, 'Confluence search');
      return { results: data?.results || [], base: data?._links?.base || '', truncated: !!data?._links?.next };
    },

    /** A work item as the current user sees it. */
    async getIssue(key) {
      const res = await user().requestJira(route`/rest/api/3/issue/${key}?fields=summary,description,project,status,reporter`, { headers: { Accept: 'application/json' } });
      const data = await parse(res, 'read work item');
      if (!data) return null;
      const f = data.fields || {};
      return { key: data.key, summary: f.summary || '', description: adfToText(f.description), project: f.project?.key, status: f.status?.name };
    },

    async addComment(key, adf) {
      const res = await app().requestJira(route`/rest/api/3/issue/${key}/comment`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ body: adf }) });
      await parse(res, 'add comment');
    },

    async listProjects() {
      const out = [];
      for (let startAt = 0; startAt < 500; startAt += 50) {
        const res = await user().requestJira(route`/rest/api/3/project/search?startAt=${startAt}&maxResults=50&orderBy=name`, { headers: { Accept: 'application/json' } });
        const data = await parse(res, 'list projects');
        for (const p of data?.values || []) out.push({ key: p.key, name: p.name });
        if (!data || data.isLast !== false) break;
      }
      return out;
    },

    createSampleIssue,

    async isAdmin() {
      const res = await user().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, { headers: { Accept: 'application/json' } });
      const data = await parse(res, 'my permissions');
      return data?.permissions?.ADMINISTER?.havePermission === true;
    },
  };
}

/** Create a work item as the app (sample data only). Returns {id, key}. */
export async function createSampleIssue({ projectKey, summary, description }) {
  const issueTypes = await api.asApp().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes?maxResults=50`, { headers: { Accept: 'application/json' } });
  const meta = await parse(issueTypes, 'issue types');
  const types = (meta?.issueTypes || meta?.values || []).filter((t) => !t.subtask);
  const type = types.find((t) => t.name === 'Task') || types[0];
  if (!type) throw new Error(`Project ${projectKey} has no usable work item type.`);
  const res = await api.asApp().requestJira(route`/rest/api/3/issue`, {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ fields: { project: { key: projectKey }, issuetype: { id: type.id }, summary, description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] } } }),
  });
  const data = await parse(res, 'create work item');
  if (!data?.key) throw new Error('create work item failed: no key returned');
  return { id: data.id, key: data.key };
}
