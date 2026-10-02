import { describe, it, expect } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiry,
  shouldRefresh,
  SESSION_TTL_MS,
} from "./session";

describe("session tokens", () => {
  it("generates unique high-entropy tokens", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(42);
  });

  it("hashes a token deterministically to 64 hex chars (sha256)", () => {
    const token = "example-token";
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not store the raw token as its hash", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it("computes an expiry in the future", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const exp = sessionExpiry(now);
    expect(exp.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
  });

  it("flags sessions past the halfway point for refresh", () => {
    const now = new Date();
    const soon = new Date(now.getTime() + SESSION_TTL_MS / 4);
    const far = new Date(now.getTime() + SESSION_TTL_MS);
    expect(shouldRefresh(soon, now)).toBe(true);
    expect(shouldRefresh(far, now)).toBe(false);
  });
});
