import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getAdminDb, withTenant } from "@/server/db/client";
import { users, invitations, subscriptions } from "@/server/db/schema";
import {
  canAssignRole,
  ForbiddenError,
  hasPermission,
} from "@/server/auth/rbac";
import type { Role } from "@/server/services/tenant";
import type { SessionUser } from "@/server/auth/auth";
import { hashPassword } from "@/server/auth/password";
import { sendEmail } from "@/server/email/email";
import { assertWithinQuotaTx } from "@/server/services/subscription";
import { limitFor } from "@/server/billing/plans";
import { logAudit } from "@/server/services/audit";
import { getEnv } from "@/lib/env";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export class MemberError extends Error {}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

export async function listMembers(tenantId: string): Promise<Member[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users);
    return rows;
  });
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  expiresAt: Date;
}

export async function listPendingInvites(
  tenantId: string,
): Promise<PendingInvite[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        createdAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(eq(invitations.status, "pending"));
    return rows;
  });
}

/**
 * Invite a user by email. Requires members:invite and that the actor may
 * assign the requested role. Creates a pending invitation and emails a link.
 * Returns the token (also used by tests). Idempotent per email: an existing
 * pending invite for the same email is replaced.
 */
export async function inviteMember(
  actor: SessionUser,
  input: { email: string; role: Role },
): Promise<{ token: string }> {
  if (!hasPermission(actor.role, "members:invite")) {
    throw new ForbiddenError();
  }
  if (!canAssignRole(actor.role, input.role)) {
    throw new ForbiddenError("You cannot assign a role at or above your own");
  }

  const email = input.email.toLowerCase().trim();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await withTenant(actor.tenantId, async (tx) => {
    // Reject if the email already belongs to a member of this tenant.
    const existingUser = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existingUser.length > 0) {
      throw new MemberError("That email already belongs to a member");
    }

    // Replace any prior pending invite for this email so re-inviting the same
    // person doesn't consume an extra quota slot.
    await tx
      .delete(invitations)
      .where(
        and(eq(invitations.email, email), eq(invitations.status, "pending")),
      );

    // Enforce plan quota INSIDE the transaction: active members + pending
    // invites must stay within the limit. Counting after the delete above
    // means re-inviting an already-pending email is correctly idempotent.
    await assertWithinQuotaTx(tx, "members");

    await tx.insert(invitations).values({
      tenantId: actor.tenantId,
      email,
      role: input.role,
      token,
      status: "pending",
      invitedBy: actor.userId,
      expiresAt,
    });
  });

  await logAudit(actor, {
    action: "member.invited",
    entity: "invitation",
    metadata: { email, role: input.role },
  });

  const url = `${getEnv().APP_URL}/invite/${token}`;
  await sendEmail({
    to: email,
    subject: "You've been invited to a CRM workspace",
    html: `<p>You've been invited to join a workspace on CRM.</p><p><a href="${url}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`,
    text: `You've been invited to join a workspace on CRM. Accept here: ${url} (expires in 7 days)`,
  });

  return { token };
}

export interface InviteDetails {
  tenantId: string;
  email: string;
  role: Role;
}

/** Look up a valid pending invitation by token (admin: no tenant context yet). */
export async function getInviteByToken(
  token: string,
): Promise<InviteDetails | null> {
  const db = getAdminDb();
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);

  if (!row) return null;
  if (row.status !== "pending") return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return { tenantId: row.tenantId, email: row.email, role: row.role };
}

/**
 * Accept an invitation: create the user in the tenant and mark the invite
 * accepted. Runs on admin connection because the invitee has no session yet.
 * Returns the new user's id + tenant for session creation by the caller.
 */
export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
}): Promise<{ userId: string; tenantId: string; email: string; role: Role }> {
  const invite = await getInviteByToken(input.token);
  if (!invite) throw new MemberError("This invitation is invalid or expired");

  const db = getAdminDb();
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.email))
      .limit(1);
    if (existing.length > 0) {
      throw new MemberError("An account with this email already exists");
    }

    // Re-enforce the member quota at acceptance time. This runs on the admin
    // connection (no tenant session), so we count scoped to the invite's
    // tenant explicitly. We compare the resulting ACTIVE member count against
    // the plan limit: accepting must not push active members over the cap.
    // (Guards against limits lowered after invites were issued, and against
    // invites created before quota counting was fixed.)
    const [{ count: activeMembers }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.tenantId, invite.tenantId));
    const [sub] = await tx
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, invite.tenantId))
      .limit(1);
    const plan = sub?.plan ?? "free";
    if (activeMembers + 1 > limitFor(plan, "members")) {
      throw new MemberError(
        `This workspace has reached its ${plan} plan member limit. Ask the owner to upgrade.`,
      );
    }

    const [user] = await tx
      .insert(users)
      .values({
        tenantId: invite.tenantId,
        email: invite.email,
        name: input.name,
        passwordHash,
        role: invite.role,
      })
      .returning();

    await tx
      .update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.token, input.token));

    return {
      userId: user.id,
      tenantId: invite.tenantId,
      email: invite.email,
      role: invite.role,
    };
  });
}

export async function revokeInvite(
  actor: SessionUser,
  inviteId: string,
): Promise<void> {
  if (!hasPermission(actor.role, "members:invite")) {
    throw new ForbiddenError();
  }
  await withTenant(actor.tenantId, async (tx) => {
    await tx
      .update(invitations)
      .set({ status: "revoked" })
      .where(eq(invitations.id, inviteId));
  });
}

/** Change a member's role, with escalation + self-protection guards. */
export async function updateMemberRole(
  actor: SessionUser,
  input: { userId: string; role: Role },
): Promise<void> {
  if (!hasPermission(actor.role, "members:update_role")) {
    throw new ForbiddenError();
  }
  if (!canAssignRole(actor.role, input.role)) {
    throw new ForbiddenError("You cannot assign a role at or above your own");
  }
  if (input.userId === actor.userId) {
    throw new MemberError("You cannot change your own role");
  }

  await withTenant(actor.tenantId, async (tx) => {
    const [target] = await tx
      .select()
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!target) throw new MemberError("Member not found");
    if (target.role === "owner") {
      throw new MemberError("The workspace owner's role cannot be changed");
    }
    await tx
      .update(users)
      .set({ role: input.role })
      .where(eq(users.id, input.userId));
  });
  await logAudit(actor, {
    action: "member.role_changed",
    entity: "user",
    entityId: input.userId,
    metadata: { role: input.role },
  });
}

/** Remove a member. Owners cannot be removed; cannot remove yourself. */
export async function removeMember(
  actor: SessionUser,
  userId: string,
): Promise<void> {
  if (!hasPermission(actor.role, "members:remove")) {
    throw new ForbiddenError();
  }
  if (userId === actor.userId) {
    throw new MemberError("You cannot remove yourself");
  }

  await withTenant(actor.tenantId, async (tx) => {
    const [target] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) throw new MemberError("Member not found");
    if (target.role === "owner") {
      throw new MemberError("The workspace owner cannot be removed");
    }
    await tx.delete(users).where(eq(users.id, userId));
  });
  await logAudit(actor, {
    action: "member.removed",
    entity: "user",
    entityId: userId,
  });
}
