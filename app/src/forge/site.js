// Where this app lives: the site URL and the board page URL (used in links the app writes).
import api, { route, getAppContext } from '@forge/api';
import { kvs } from '@forge/kvs';

const KEY = 'meta:site';

/** Remember the site URL seen by the UI, so background functions (connector, scheduler) can build links. */
export async function rememberSite(siteUrl) {
  if (!siteUrl) return;
  const clean = String(siteUrl).replace(/\/$/, '');
  const known = await kvs.get(KEY);
  if (known?.siteUrl !== clean) await kvs.set(KEY, { siteUrl: clean });
}

async function siteUrl() {
  const known = await kvs.get(KEY);
  if (known?.siteUrl) return known.siteUrl;
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/serverInfo`, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const base = String((await res.json()).baseUrl || '').replace(/\/$/, '');
      if (base) await kvs.set(KEY, { siteUrl: base });
      return base;
    }
  } catch (err) {
    console.warn('[subject-request-desk] serverInfo failed', err?.message || err);
  }
  return '';
}

/** @returns {Promise<{siteUrl: string, pageUrl: string}>} */
export async function siteInfo() {
  const base = await siteUrl();
  let pageUrl = base ? `${base}/jira/apps` : '';
  try {
    const ctx = getAppContext();
    const appId = ctx.appAri?.appId;
    const envId = ctx.environmentAri?.environmentId;
    if (base && appId && envId) pageUrl = `${base}/jira/apps/${appId}/${envId}`;
  } catch {
    /* outside the Forge runtime */
  }
  return { siteUrl: base, pageUrl };
}
