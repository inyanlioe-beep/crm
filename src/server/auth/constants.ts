// Edge-safe auth constants. This module must not import node-only APIs
// (e.g. node:crypto) so it can be imported from middleware (Edge runtime).

export const SESSION_COOKIE = "crm_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
