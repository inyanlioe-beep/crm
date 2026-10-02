export type Plan = "free" | "pro";

export interface PlanLimits {
  members: number; // max users in the tenant
  contacts: number; // max contacts
  deals: number; // max deals
}

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { members: 2, contacts: 50, deals: 50 },
  pro: { members: UNLIMITED, contacts: UNLIMITED, deals: UNLIMITED },
};

export interface PlanInfo {
  plan: Plan;
  name: string;
  priceMonthlyCents: number;
}

export const PLAN_CATALOG: Record<Plan, PlanInfo> = {
  free: { plan: "free", name: "Free", priceMonthlyCents: 0 },
  pro: { plan: "pro", name: "Pro", priceMonthlyCents: 2900 },
};

export type QuotaResource = keyof PlanLimits;

export function limitFor(plan: Plan, resource: QuotaResource): number {
  return PLAN_LIMITS[plan][resource];
}

/** True when adding `addend` to `current` keeps the tenant within its limit. */
export function withinLimit(
  plan: Plan,
  resource: QuotaResource,
  current: number,
  addend = 1,
): boolean {
  return current + addend <= limitFor(plan, resource);
}
