import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";

/**
 * Integration test for audit logging. Skipped unless TEST_DATABASE_URL is set.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("audit log", () => {
  let audit: typeof import("./audit");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");
  let user: SessionUser;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    audit = await import("./audit");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Audit Co",
      slug: `audit-${stamp}`,
      ownerEmail: `owner-${stamp}@test.local`,
      ownerName: "Owner",
      passwordHash: "x",
    });
    user = {
      userId: created.userId,
      tenantId: created.tenantId,
      email: `owner-${stamp}@test.local`,
      name: "Owner",
      role: "owner",
    };
  });

  afterAll(async () => {
    await client?.closeDb();
  });

  it("records and lists an audit entry", async () => {
    await audit.logAudit(user, {
      action: "test.action",
      entity: "thing",
      entityId: "123",
      metadata: { foo: "bar" },
    });
    const logs = await audit.listAuditLogs(user);
    expect(logs.some((l) => l.action === "test.action")).toBe(true);
  });

  it("denies audit viewing to non-privileged roles", async () => {
    const sales: SessionUser = { ...user, role: "sales" };
    await expect(audit.listAuditLogs(sales)).rejects.toThrow();
  });
});
