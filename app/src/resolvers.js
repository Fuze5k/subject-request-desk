// UI resolver functions, independent of @forge/resolver so they can be exercised in tests.
import { DomainError } from './domain/errors.js';

/**
 * @param {{service: object, isAdmin?: () => Promise<boolean>, listProjects?: () => Promise<object[]>, onSeen?: (context: object) => Promise<void>}} deps
 * @returns {Record<string, (req: {payload?: object, context?: object}) => Promise<{ok: boolean, data?: any, error?: object}>>}
 */
export function createResolverHandlers({ service, isAdmin = async () => false, listProjects = async () => [], onSeen = async () => {} }) {
  const handlers = {};

  /** Every UI call returns { ok, data } or { ok: false, error }: the UI never has to parse exceptions. */
  const define = (name, fn, { admin = false } = {}) => {
    handlers[name] = async (req = {}) => {
      const accountId = req.context?.accountId;
      if (!accountId) return { ok: false, error: { code: 'NO_USER', message: 'Sign in to use Subject Request Desk.' } };
      const actor = { accountId, via: 'ui' };
      try {
        await onSeen(req.context);
        if (admin && !(await isAdmin())) throw new DomainError('FORBIDDEN', 'Only Jira admins can do this.');
        return { ok: true, data: await fn({ payload: req.payload || {}, context: req.context, actor }) };
      } catch (err) {
        if (err instanceof DomainError) return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
        console.error('[subject-request-desk] resolver failed', name, err);
        return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } };
      }
    };
  };

  const issueKeyOf = (context, payload) => payload.issueKey || context?.extension?.issue?.key;

  define('forIssue', ({ payload, context }) => service.forIssue(issueKeyOf(context, payload)));
  define('create', ({ payload, actor }) => service.create(actor, payload.fields || {}));
  define('get', ({ payload }) => service.get(payload.id));
  define('board', () => service.board());
  define('identity', ({ payload, actor }) => service.identity(actor, payload.id, payload.fields || {}));
  define('terms', ({ payload, actor }) => service.terms(actor, payload.id, payload.terms));
  define('search', ({ payload, actor }) => service.search(actor, payload.id, payload.terms));
  define('decide', ({ payload, actor }) => service.decide(actor, payload.id, { ref: payload.ref, refs: payload.refs, patch: payload.patch || {} }));
  define('extend', ({ payload, actor }) => service.extend(actor, payload.id, payload.reason));
  define('draft', ({ payload, actor }) => service.draft(actor, payload.id, { outcome: payload.outcome, reason: payload.reason }));
  define('saveDraft', ({ payload, actor }) => service.saveDraft(actor, payload.id, payload.text));
  define('review', ({ payload }) => service.review(payload.id, payload.outcome));
  define('close', ({ payload, actor }) => service.close(actor, payload.id, payload.fields || {}));
  define('report', ({ payload }) => service.report(payload.id));

  define('settings', async () => ({ settings: await service.settings(), laws: service.lawList(), types: service.typeList(), isAdmin: await isAdmin(), lastDaily: await service.dailyState() }));
  define('options', async () => ({ settings: await service.settings(), laws: service.lawList(), types: service.typeList() }));
  define('saveSettings', ({ payload, actor }) => service.saveSettings(actor, payload.settings || {}), { admin: true });
  define('projects', () => listProjects());
  define('addSample', ({ payload, actor }) => service.addSample(actor, payload.projectKey), { admin: true });
  define('runDaily', () => service.daily(), { admin: true });

  return handlers;
}
