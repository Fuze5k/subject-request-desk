// Forge entry points: the UI resolver, the Rovo actions, the daily deadline check and the weekly personal data report.
import Resolver from '@forge/resolver';
import { privacy } from '@forge/api';
import { createForgeKv } from './forge/kvs.js';
import { siteInfo, rememberSite } from './forge/site.js';
import { createAtlassian } from './forge/atlassian.js';
import { createStore } from './store/store.js';
import { createService } from './services/requests.js';
import { createResolverHandlers } from './resolvers.js';
import { createActions } from './actions.js';
import { createAnnouncer } from './forge/realtime.js';

const log = (msg, err) => console.warn(`[subject-request-desk] ${msg}`, err?.message || err || '');
const store = createStore(createForgeKv());
const atl = createAtlassian();
const service = createService({
  store, atl, site: siteInfo, log, changed: createAnnouncer(log), reportAccounts: (accounts) => privacy.reportPersonalData(accounts),
});

// ---------------------------------------------------------------- UI resolver

const resolver = new Resolver();
const handlers = createResolverHandlers({
  service,
  isAdmin: () => atl.isAdmin(),
  listProjects: () => atl.listProjects(),
  onSeen: (context) => rememberSite(context?.siteUrl),
});
for (const [name, fn] of Object.entries(handlers)) resolver.define(name, fn);
export const handler = resolver.getDefinitions();

// ---------------------------------------------------------------- Rovo actions

const actions = createActions({ service, log });
export const getRequest = (payload, context) => actions.getRequest(payload, context);
export const listRequests = (payload, context) => actions.listRequests(payload, context);
export const createRequest = (payload, context) => actions.createRequest(payload, context);
export const findSubjectData = (payload, context) => actions.findSubjectData(payload, context);
export const listHits = (payload, context) => actions.listHits(payload, context);
export const recordDecision = (payload, context) => actions.recordDecision(payload, context);
export const extendDeadline = (payload, context) => actions.extendDeadline(payload, context);
export const draftResponse = (payload, context) => actions.draftResponse(payload, context);
export const checkClosure = (payload, context) => actions.checkClosure(payload, context);

// ---------------------------------------------------------------- daily deadline check

/** Scheduled trigger: comment on the linked work item of requests whose deadline is due soon or has passed. */
export async function daily() {
  try {
    const r = await service.daily();
    log(`deadlines: ${r.checked} open requests, ${r.comments.length} comments`);
  } catch (err) {
    log('deadline check failed', err);
  }
  return { statusCode: 200 };
}

// ---------------------------------------------------------------- weekly personal data report

/** Scheduled trigger: Atlassian's personal data reporting (the default cycle is 7 days). */
export async function personalData() {
  try {
    const r = await service.reportPersonalData();
    log(`personal data: ${r.reported} accounts reported, ${r.closed} closed, erased in ${r.erasedIn.length} requests ${r.erasedIn.join(', ')}`);
  } catch (err) {
    // privacy.reportPersonalData rejects with the HTTP response (for example 429 or 403) when the API refuses.
    log('personal data report failed, next try next week', err?.status ? `HTTP ${err.status} ${err.statusText || ''}` : err);
  }
  return { statusCode: 200 };
}
