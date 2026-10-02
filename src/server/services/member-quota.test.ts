import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";

/**
 * Regression tests for BUG-1 + BUG-2: the free-plan member limit (2) must
 * account for pending invitations and be re-enforced at acceptance time.
 * Skipped unless TEST_DATABASE_URL is set.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("member quota enforcement (BUG-1/BUG-2)", () => {
  let members: typeof import("./members");
  let subscription: typeof import("./subscription");
  let email: typeof import("@/server/email/email");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");

  async function freshOwner(): Promise<SessionUser> {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Quota Co",
      slug: `quota-${stamp}`,
      ownerEmail: `owner-${stamp}@test.local`,
      ownerName: "Owner",
      passwordHash: "x",
    });
    return {
      userId: created.userId,
      tenantId: created.tenantId,
      email: `owner-${stamp}@test.local`,
      name: "Owner",
      role: "owner",
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";
    process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";

    members = await import("./members");
    subscription = await import("./subscription");
    email = await import("@/server/email/email");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");

    email.setEmailProvider({ send: async () => ({ id: "test" }) });
  });

  afterAll(async () => {
    email.setEmailProvider(null);
    await client?.closeDb();
  });

  it("counts a pending invite toward the member limit", async () => {
    const owner = await freshOwner(); // 1 member, free limit = 2
    // First invite fills the 2nd slot (1 member + 1 invite = 2).
    await members.inviteMember(owner, {
      email: `a-${Date.now()}@test.local`,
      role: "sales",
    });
    // Second invite would make 3 — must be rejected.
    await expect(
      members.inviteMember(owner, {
        email: `b-${Date.now()}@test.local`,
        role: "sales",
      }),
    ).rejects.toThrow(/limited to 2 members/i);
  });

  it("re-inviting the same pending email does not consume an extra slot", async () => {
    const owner = await freshOwner();
    const invitee = `dup-${Date.now()}@test.local`;
    await members.inviteMember(owner, { email: invitee, role: "sales" });
    // Re-inviting the SAME email replaces the pending invite; still 1 invite.
    await expect(
      members.inviteMember(owner, { email: invitee, role: "sales" }),
    ).resolves.toBeTruthy();
  });

  it("accepting invites cannot push active members over the limit", async () => {
    const owner = await freshOwner(); // 1 member, limit 2
    const { token } = await members.inviteMember(owner, {
      email: `acc-${Date.now()}@test.local`,
      role: "sales",
    });
    // Accepting the single allowed invite -> 2 members (OK).
    await members.acceptInvite({
      token,
      name: "Second",
      password: "password123",
    });
    const usage = await subscription.getUsage(owner);
    expect(usage.members.used).toBe(2);

    // Now at the limit, a further invite must be rejected.
    await expect(
      members.inviteMember(owner, {
        email: `over-${Date.now()}@test.local`,
        role: "sales",
      }),
    ).rejects.toThrow(/limited to 2 members/i);
  });

  it("upgrading to pro lifts the member limit", async () => {
    const owner = await freshOwner();
    await subscription.activatePlan({
      tenantId: owner.tenantId,
      plan: "pro",
      provider: "manual",
    });
    // Many invites now succeed.
    for (let i = 0; i < 5; i++) {
      await expect(
        members.inviteMember(owner, {
          email: `pro-${Date.now()}-${i}@test.local`,
          role: "sales",
        }),
      ).resolves.toBeTruthy();
    }
  });
});
