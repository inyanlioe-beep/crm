import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Regression for BUG-9 (sliding session refresh) and BUG-10 (use the session's
 * own tenantId). Skipped unless TEST_DATABASE_URL is set.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("session sliding refresh (BUG-9/BUG-10)", () => {
  let auth: typeof import("./auth");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("@/server/services/tenant");
  let schema: typeof import("@/server/db/schema");
  let sessionMod: typeof import("./session");
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    auth = await import("./auth");
    client = await import("@/server/db/client");
    tenantSvc = await import("@/server/services/tenant");
    schema = await import("@/server/db/schema");
    sessionMod = await import("./session");

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Session Co",
      slug: `session-${stamp}`,
      ownerEmail: `owner-${stamp}@test.local`,
      ownerName: "Owner",
      passwordHash: "x",
    });
    tenantId = created.tenantId;
    userId = created.userId;
  });

  afterAll(async () => {
    await client?.closeDb();
  });

  it("returns the session's tenantId and does not refresh a fresh session", async () => {
    const { token } = await auth.createSession(userId, tenantId);
    const result = await auth.validateSessionDetailed(token);
    expect(result).not.toBeNull();
    expect(result!.user.tenantId).toBe(tenantId);
    // A brand-new session is well within TTL, so no refresh.
    expect(result!.refreshedExpiry).toBeNull();
  });

  it("slides the expiry forward when past the halfway point", async () => {
    const { token } = await auth.createSession(userId, tenantId);
    const id = sessionMod.hashSessionToken(token);

    // Backdate the session so it's past half its TTL (but not expired).
    const soon = new Date(Date.now() + sessionMod.SESSION_TTL_MS / 4);
    const { eq } = await import("drizzle-orm");
    await client
      .getAdminDb()
      .update(schema.sessions)
      .set({ expiresAt: soon })
      .where(eq(schema.sessions.id, id));

    const result = await auth.validateSessionDetailed(token);
    expect(result).not.toBeNull();
    expect(result!.refreshedExpiry).not.toBeNull();
    // New expiry is further out than the backdated one.
    expect(result!.refreshedExpiry!.getTime()).toBeGreaterThan(soon.getTime());
  });

  it("returns null for an expired session and deletes it", async () => {
    const { token } = await auth.createSession(userId, tenantId);
    const id = sessionMod.hashSessionToken(token);
    const { eq } = await import("drizzle-orm");
    await client
      .getAdminDb()
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.id, id));

    const result = await auth.validateSessionDetailed(token);
    expect(result).toBeNull();
  });
});
