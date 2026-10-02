"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { requirePermission, ForbiddenError } from "@/server/auth/rbac";
import { getBillingProvider } from "@/server/billing/billing";
import { activatePlan, cancelPlan } from "@/server/services/subscription";
import { logAudit } from "@/server/services/audit";
import { getEnv } from "@/lib/env";

export interface BillingActionState {
  error?: string;
}

export async function startCheckoutAction(
  _prev: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const user = await requireUser();
  try {
    requirePermission(user.role, "billing:manage");
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }

  const provider = getBillingProvider();
  const appUrl = getEnv().APP_URL;
  const { url } = await provider.createCheckout({
    tenantId: user.tenantId,
    plan: "pro",
    customerEmail: user.email,
    successUrl: `${appUrl}/app/settings/billing`,
    cancelUrl: `${appUrl}/app/settings/billing`,
  });

  redirect(url);
}

/**
 * Dev/demo-only activation used when no real billing provider is configured
 * (ManualProvider). Guarded to owners/admins with billing:manage.
 */
export async function confirmManualUpgradeAction(): Promise<void> {
  const user = await requireUser();
  requirePermission(user.role, "billing:manage");
  const provider = getBillingProvider();
  if (provider.enabled) return; // real provider handles this via webhook
  await activatePlan({
    tenantId: user.tenantId,
    plan: "pro",
    provider: "manual",
  });
  await logAudit(user, { action: "billing.upgraded", metadata: { plan: "pro" } });
  revalidatePath("/app/settings/billing");
}

export async function downgradeAction(): Promise<void> {
  const user = await requireUser();
  requirePermission(user.role, "billing:manage");
  await cancelPlan(user.tenantId);
  await logAudit(user, {
    action: "billing.downgraded",
    metadata: { plan: "free" },
  });
  revalidatePath("/app/settings/billing");
}
