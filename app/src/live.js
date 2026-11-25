// Forge Realtime channel shared by the backend (publish) and the open panels (subscribe).
// Global, because the writers (Rovo actions, the daily job) run without a UI context. The event carries only the
// request id; the panel then re-reads the request through its resolver as the signed-in user.
export const REQUEST_CHANGED = 'srd-request-changed';
