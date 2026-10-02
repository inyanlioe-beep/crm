import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";
import { getUsage } from "@/server/services/subscription";
import { getBillingProvider } from "@/server/billing/billing";
import { PLAN_CATALOG } from "@/server/billing/plans";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  confirmManualUpgradeAction,
  downgradeAction,
} from "./actions";
import { UpgradeButton } from "./upgrade-button";

function limitLabel(limit: number): string {
  return Number.isFinite(limit) ? String(limit) : "Unlimited";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ manual?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const usage = await getUsage(user);
  const canManage = hasPermission(user.role, "billing:manage");
  const providerEnabled = getBillingProvider().enabled;
  const pro = PLAN_CATALOG.pro;

  const rows: Array<{ label: string; used: number; limit: number }> = [
    { label: "Members", used: usage.members.used, limit: usage.members.limit },
    {
      label: "Contacts",
      used: usage.contacts.used,
      limit: usage.contacts.limit,
    },
    { label: "Deals", used: usage.deals.used, limit: usage.deals.limit },
  ];

  const showManualConfirm =
    sp.manual === "1" && !providerEnabled && usage.plan === "free";

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You are on the{" "}
          <span className="font-medium capitalize">{usage.plan}</span> plan.
        </p>
      </div>

      <section className="rounded-lg border border-border p-4">
        <h2 className="font-semibold">Usage</h2>
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <span>
                {r.used} / {limitLabel(r.limit)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {usage.plan === "free" ? (
        <section className="rounded-lg border border-border p-4">
          <h2 className="font-semibold">Upgrade to Pro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCurrency(pro.priceMonthlyCents)} / month · unlimited members,
            contacts, and deals.
          </p>
          {!canManage && (
            <p className="mt-3 text-sm text-muted-foreground">
              Only the workspace owner can manage billing.
            </p>
          )}
          {canManage && showManualConfirm && (
            <form action={confirmManualUpgradeAction} className="mt-3">
              <Button type="submit">Confirm upgrade (demo mode)</Button>
            </form>
          )}
          {canManage && !showManualConfirm && (
            <div className="mt-3">
              <UpgradeButton />
              {!providerEnabled && (
                <p className="mt-2 text-xs text-muted-foreground">
                  No payment provider configured — upgrade runs in demo mode.
                </p>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-border p-4">
          <h2 className="font-semibold">Pro plan active</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Thanks for subscribing. You have unlimited usage.
          </p>
          {canManage && (
            <form action={downgradeAction} className="mt-3">
              <Button type="submit" variant="outline">
                Downgrade to Free
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
