import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";

/**
 * Integration tests for invitations + member management. Skipped unless
 * TEST_DATABASE_URL points at Postgres reached via the app_user (NOBYPASSRLS)
 * role. See src/server/db/README.md for setup.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("members & invitations", () => {
  let members: typeof import("./members");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");
  let subscription: typeof import("./subscription");
  let email: typeof import("@/server/email/email");
  let owner: SessionUser;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";
    process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";

    members = await import("./members");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");
    subscription = await import("./subscription");
    email = await import("@/server/email/email");

    // Capture emails instead of sending.
    email.setEmailProvider({ send: async () => ({ id: "test" }) });

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Members Co",
      slug: `members-${stamp}`,
      ownerEmail: `owner-${stamp}@test.local`,
      ownerName: "Owner",
      passwordHash: "x",
    });
    owner = {
      userId: created.userId,
      tenantId: created.tenantId,
      email: `owner-${stamp}@test.local`,
      name: "Owner",
      role: "owner",
    };

    // This suite exercises invite/accept/role mechanics with several members;
    // upgrade to pro so the free member cap (2) doesn't interfere. The free
    // cap is covered by member-quota.test.ts.
    await subscription.activatePlan({
      tenantId: owner.tenantId,
      plan: "pro",
      provider: "manual",
    });
  });

  afterAll(async () => {
    await client?.closeDb();
  });

  it("invites a member and lists it as pending", async () => {
    const invitee = `sales-${Date.now()}@test.local`;
    const { token } = await members.inviteMember(owner, {
      email: invitee,
      role: "sales",
    });
    expect(token).toBeTruthy();

    const pending = await members.listPendingInvites(owner.tenantId);
    expect(pending.some((p) => p.email === invitee)).toBe(true);

    const details = await members.getInviteByToken(token);
    expect(details?.email).toBe(invitee);
    expect(details?.role).toBe("sales");
  });

  it("accepts an invite and creates a user in the tenant", async () => {
    const invitee = `join-${Date.now()}@test.local`;
    const { token } = await members.inviteMember(owner, {
      email: invitee,
      role: "viewer",
    });

    const result = await members.acceptInvite({
      token,
      name: "New Joiner",
      password: "password123",
    });
    expect(result.tenantId).toBe(owner.tenantId);
    expect(result.role).toBe("viewer");

    const list = await members.listMembers(owner.tenantId);
    expect(list.some((m) => m.email === invitee && m.role === "viewer")).toBe(
      true,
    );
  });

  it("rejects a non-owner trying to invite", async () => {
    const viewer: SessionUser = { ...owner, role: "viewer" };
    await expect(
      members.inviteMember(viewer, {
        email: "x@test.local",
        role: "sales",
      }),
    ).rejects.toThrow();
  });

  it("prevents assigning a role at or above the actor's own", async () => {
    const admin: SessionUser = { ...owner, role: "admin" };
    await expect(
      members.inviteMember(admin, {
        email: "y@test.local",
        role: "owner",
      }),
    ).rejects.toThrow();
  });
});
