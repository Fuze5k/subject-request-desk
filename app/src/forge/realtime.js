// Tells open Subject Request Desk panels that a request changed, so a write by the Privacy request assistant shows without a manual refresh.
import { publishGlobal } from '@forge/realtime';
import { REQUEST_CHANGED } from '../live.js';

/** @param {(msg: string, err?: any) => void} log */
export function createAnnouncer(log) {
  // The request is already saved when this runs: a failed event costs only the live refresh, so it is logged, not thrown.
  return async (id) => {
    try {
      const r = await publishGlobal(REQUEST_CHANGED, { id });
      if (r?.errors?.length) log(`live update for ${id} not sent`, r.errors.map((e) => e?.message || String(e)).join('; '));
    } catch (err) {
      log(`live update for ${id} not sent`, err);
    }
  };
}
