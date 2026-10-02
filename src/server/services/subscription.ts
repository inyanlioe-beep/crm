import { eq, sql } from "drizzle-orm";
import { getAdminDb, withTenant, type TenantDb } from "@/server/db/client";
import {
  subscriptions,
  tenants,
  users,
  contacts,
  deals,
  invitations,
} from "@/server/db/schema";
import { requirePermission } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/auth";
import {
  type Plan,
  type QuotaResource,
  limitFor,
  withinLimit,
} from "@/server/billing/plans";

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

export interface SubscriptionInfo {
  plan: Plan;
  status: string;
  currentPeriodEnd: Date | null;
}

export async function getSubscription(
  user: SessionUser,
): Promise<SubscriptionInfo> {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const [row] = await tx
      .select({
        plan: subscriptions.plan,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .limit(1);
    return (
      row ?? { plan: "free" as Plan, status: "active", currentPeriodEnd: null }
    );
  });
}

/**
 * Count current usage of a resource WITHIN a provided transaction so the count
 * and a subsequent insert can be made atomic (prevents the check-then-act race).
 *
 * For "members" we count active users PLUS pending invitations, because an
 * accepted invitation becomes a member — otherwise a tenant could exceed its
 * plan by issuing many invites that are each individually "within limit".
 */
async function countResourceTx(
  tx: TenantDb,
  resource: QuotaResource,
): Promise<number> {
  if (resource === "members") {
    const [{ count: memberCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const [{ count: inviteCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(invitations)
      .where(eq(invitations.status, "pending"));
    return memberCount + inviteCount;
  }
  const table = resource === "contacts" ? contacts : deals;
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(table);
  return count;
}

async function currentCount(
  user: SessionUser,
  resource: QuotaResource,
): Promise<number> {
  return withTenant(user.tenantId, (tx) => countResourceTx(tx, resource));
}

export interface UsageSummary {
  plan: Plan;
  members: { used: number; limit: number };
  contacts: { used: number; limit: number };
  deals: { used: number; limit: number };
}

export async function getUsage(user: SessionUser): Promise<UsageSummary> {
  requirePermission(user.role, "crm:view");
  const sub = await getSubscription(user);
  const [members, contactCount, dealCount] = await Promise.all([
    currentCount(user, "members"),
    currentCount(user, "contacts"),
    currentCount(user, "deals"),
  ]);
  return {
    plan: sub.plan,
    members: { used: members, limit: limitFor(sub.plan, "members") },
    contacts: { used: contactCount, limit: limitFor(sub.plan, "contacts") },
    deals: { used: dealCount, limit: limitFor(sub.plan, "deals") },
  };
}

/** Resolve the tenant's plan within a transaction (defaults to free). */
async function planForTx(tx: TenantDb): Promise<Plan> {
  const [row] = await tx
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .limit(1);
  return row?.plan ?? "free";
}

/**
 * Assert, inside the given transaction, that adding `count` of `resource`
 * stays within the tenant's plan limit. Because the count and the caller's
 * subsequent insert share one transaction, this closes the check-then-act
 * race (TOCTOU).
 */
export async function assertWithinQuotaTx(
  tx: TenantDb,
  resource: QuotaResource,
  count = 1,
): Promise<void> {
  const plan = await planForTx(tx);
  const used = await countResourceTx(tx, resource);
  if (!withinLimit(plan, resource, used, count)) {
    throw new QuotaError(
      `Your ${plan} plan is limited to ${limitFor(plan, resource)} ${resource}. Upgrade to add more.`,
    );
  }
}

/**
 * Run `fn` inside a tenant transaction after asserting the resource quota in
 * that same transaction. Preferred wrapper for create flows.
 */
export async function withQuota<T>(
  user: SessionUser,
  resource: QuotaResource,
  fn: (tx: TenantDb) => Promise<T>,
  count = 1,
): Promise<T> {
  return withTenant(user.tenantId, async (tx) => {
    await assertWithinQuotaTx(tx, resource, count);
    return fn(tx);
  });
}

/**
 * Throw QuotaError if adding one more `resource` would exceed the tenant's
 * plan limit. Standalone (own transaction) — prefer withQuota for create flows
 * that also insert, to avoid the check-then-act race.
 */
export async function assertWithinQuota(
  user: SessionUser,
  resource: QuotaResource,
): Promise<void> {
  return assertBatchWithinQuota(user, resource, 1);
}

/** Like assertWithinQuota but for adding `count` items at once (e.g. CSV import). */
export async function assertBatchWithinQuota(
  user: SessionUser,
  resource: QuotaResource,
  count: number,
): Promise<void> {
  const sub = await getSubscription(user);
  const used = await currentCount(user, resource);
  if (!withinLimit(sub.plan, resource, used, count)) {
    throw new QuotaError(
      `Your ${sub.plan} plan is limited to ${limitFor(sub.plan, resource)} ${resource}. Upgrade to add more.`,
    );
  }
}



/**
 * Apply a plan change from a verified webhook (admin connection — no session).
 * Updates both the subscription row and the tenant's plan column.
 */
export async function activatePlan(input: {
  tenantId: string;
  plan: Plan;
  provider: string;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
}): Promise<void> {
  const db = getAdminDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({
        plan: input.plan,
        status: "active",
        provider: input.provider,
        externalCustomerId: input.externalCustomerId ?? null,
        externalSubscriptionId: input.externalSubscriptionId ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.tenantId, input.tenantId));
    await tx
      .update(tenants)
      .set({ plan: input.plan })
      .where(eq(tenants.id, input.tenantId));
  });
}

export async function cancelPlan(tenantId: string): Promise<void> {
  const db = getAdminDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ plan: "free", status: "canceled", updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, tenantId));
    await tx
      .update(tenants)
      .set({ plan: "free" })
      .where(eq(tenants.id, tenantId));
  });
}
