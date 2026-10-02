import { createHash, randomBytes } from "node:crypto";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./constants";

export { SESSION_COOKIE, SESSION_TTL_MS };

/**
 * Generate a high-entropy opaque session token (returned to the client) and
 * its SHA-256 hash (stored in the DB). Storing only the hash means a database
 * leak does not expose usable session tokens.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_MS);
}

/** True when the session should be refreshed (within half of its TTL). */
export function shouldRefresh(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() < SESSION_TTL_MS / 2;
}
