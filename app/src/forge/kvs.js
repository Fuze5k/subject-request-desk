// Forge Key-Value Store adapter implementing the store contract: get / set / create / delete / list(prefix).
import { kvs, WhereConditions } from '@forge/kvs';

const PAGE = 100;

export function createForgeKv() {
  return {
    get: (key) => kvs.get(key),
    set: (key, value) => kvs.set(key, value),
    delete: (key) => kvs.delete(key),

    async create(key, value) {
      try {
        await kvs.set(key, value, { keyPolicy: 'FAIL_IF_EXISTS' });
        return true;
      } catch (err) {
        // The write was refused; tell "already exists" apart from a real failure.
        if ((await kvs.get(key)) !== undefined) return false;
        throw err;
      }
    },

    async list(prefix) {
      const out = [];
      let cursor;
      do {
        let q = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(PAGE);
        if (cursor) q = q.cursor(cursor);
        const page = await q.getMany();
        out.push(...page.results);
        cursor = page.nextCursor;
      } while (cursor);
      return out;
    },
  };
}
