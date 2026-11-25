// In-memory key-value adapter with the same contract as the Forge KVS adapter. Used by tests.

export function createMemoryAdapter(initial = {}) {
  const data = new Map(Object.entries(initial));
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    async get(key) {
      return clone(data.get(key));
    },
    async set(key, value) {
      data.set(key, clone(value));
    },
    /** Atomic "set if absent": true when written, false when the key already existed. */
    async create(key, value) {
      if (data.has(key)) return false;
      data.set(key, clone(value));
      return true;
    },
    async delete(key) {
      data.delete(key);
    },
    /** All entries whose key starts with `prefix`, in key order. */
    async list(prefix) {
      return [...data.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => ({ key, value: clone(value) }));
    },
    _data: data,
  };
}
