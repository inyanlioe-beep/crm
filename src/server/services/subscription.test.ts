import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";

/**
 * Integration tests for subscription + quota enforcement and plan activation.
 * Skipped unless TEST_DATABASE_URL is set. See db/README.md.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("subscription & quota", () => {
  let subSvc: typeof import("./subscription");
  let contactsSvc: typeof import("./contacts");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");
  let user: SessionUser;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    subSvc = await import("./subscription");
    contactsSvc = await import("./contacts");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Billing Co",
      slug: `billing-${stamp}`,
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

  it("new tenants start on the free plan", async () => {
    const sub = await subSvc.getSubscription(user);
    expect(sub.plan).toBe("free");
  });

  it("reports usage against plan limits", async () => {
    const usage = await subSvc.getUsage(user);
    expect(usage.plan).toBe("free");
    expect(usage.contacts.limit).toBe(50);
    expect(usage.members.used).toBeGreaterThanOrEqual(1);
  });

  it("activatePlan upgrades the tenant to pro and lifts limits", async () => {
    await subSvc.activatePlan({
      tenantId: user.tenantId,
      plan: "pro",
      provider: "manual",
    });
    const sub = await subSvc.getSubscription(user);
    expect(sub.plan).toBe("pro");
    const usage = await subSvc.getUsage(user);
    expect(usage.contacts.limit).toBe(Infinity);
  });

  it("enforces the free contact quota after downgrade", async () => {
    await subSvc.cancelPlan(user.tenantId);
    const sub = await subSvc.getSubscription(user);
    expect(sub.plan).toBe("free");

    // Fill up to the limit (50). Count current first.
    const usage = await subSvc.getUsage(user);
    const toAdd = usage.contacts.limit - usage.contacts.used;
    for (let i = 0; i < toAdd; i++) {
      await contactsSvc.createContact(user, { firstName: `C${i}` });
    }
    await expect(
      contactsSvc.createContact(user, { firstName: "OverLimit" }),
    ).rejects.toThrow();
  });
});
