// Requests and settings on top of a tiny key-value contract: get / set / create / delete / list(prefix).
// One key per request, so two officers working on different requests never overwrite each other.
import { DomainError } from '../domain/errors.js';
import { LAWS, DEFAULT_LAW } from '../domain/deadline.js';

const REQ_PREFIX = 'req:';
const SETTINGS_KEY = 'meta:settings';
const DAILY_KEY = 'meta:daily';

export const DEFAULT_SETTINGS = Object.freeze({
  // law preselected for new requests
  defaultLaw: DEFAULT_LAW,
  // warn when a deadline is this many days away
  dueSoonDays: 7,
  // comment on the linked work item when a deadline is due soon or passed
  deadlineComments: true,
  // company and sender used in response drafts
  company: '',
  sender: '',
});

export function normalizeSettings(raw = {}) {
  const days = Math.round(Number(raw.dueSoonDays));
  return {
    defaultLaw: LAWS[raw.defaultLaw] ? raw.defaultLaw : DEFAULT_LAW,
    dueSoonDays: Number.isFinite(days) && days >= 1 && days <= 30 ? days : 7,
    deadlineComments: raw.deadlineComments !== false,
    company: String(raw.company || '').trim().slice(0, 80),
    sender: String(raw.sender || '').trim().slice(0, 80),
  };
}

const keyOf = (id) => `${REQ_PREFIX}${String(id).toUpperCase()}`;
export const idOf = (n) => `DSR-${String(n).padStart(4, '0')}`;

export function createStore(kv) {
  return {
    async getRequest(id) {
      return (await kv.get(keyOf(id))) ?? null;
    },

    /** Store a new request under the next free number. `make(id)` builds the case. Returns the stored case. */
    async createRequest(make) {
      let n = (await kv.list(REQ_PREFIX)).length + 1;
      for (let tries = 0; tries < 50; tries += 1, n += 1) {
        const c = make(idOf(n));
        if (await kv.create(keyOf(c.id), c)) return c;
      }
      throw new DomainError('BUSY', 'Could not allocate a request number. Try again.');
    },

    /** Save a changed request; refuses the write if someone else saved since `baseVersion`. */
    async saveRequest(c, baseVersion) {
      const current = await kv.get(keyOf(c.id));
      if (current === undefined) throw new DomainError('NOT_FOUND', `No request ${c.id}.`);
      if ((current.version || 1) !== baseVersion) throw new DomainError('STALE', `${c.id} was changed by someone else. Reload and try again.`);
      await kv.set(keyOf(c.id), c);
      return c;
    },

    removeRequest: (id) => kv.delete(keyOf(id)),

    async allRequests() {
      return (await kv.list(REQ_PREFIX)).map((r) => r.value).filter(Boolean);
    },

    async getSettings() {
      return normalizeSettings({ ...DEFAULT_SETTINGS, ...((await kv.get(SETTINGS_KEY)) || {}) });
    },
    async saveSettings(raw) {
      const s = normalizeSettings(raw);
      await kv.set(SETTINGS_KEY, s);
      return s;
    },

    getDaily: async () => (await kv.get(DAILY_KEY)) ?? null,
    setDaily: (s) => kv.set(DAILY_KEY, s),
  };
}
