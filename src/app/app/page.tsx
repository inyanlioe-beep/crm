import { requireUser } from "@/server/auth/current-user";
import {
  getDashboardMetrics,
  parseRange,
} from "@/server/services/analytics";
import { formatCurrency } from "@/lib/utils";
import { StageValueChart, ActivityChart } from "@/components/crm/charts";
import { RangeFilter } from "./range-filter";

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const range = parseRange(sp);
  const metrics = await getDashboardMetrics(user, range);

  const activeDays = Math.round(
    (range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000),
  );

  const stageData = metrics.stageBreakdown.map((s) => ({
    stageName: s.stageName,
    dealCount: s.dealCount,
    totalDollars: Math.round(s.totalCents / 100),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {user.name}.
          </p>
        </div>
        <RangeFilter activeDays={activeDays} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Pipeline value"
          value={formatCurrency(metrics.pipelineTotalCents)}
          hint={`Weighted ${formatCurrency(metrics.weightedForecastCents)}`}
        />
        <MetricCard label="Open deals" value={String(metrics.openDealCount)} />
        <MetricCard
          label="Conversion"
          value={`${Math.round(metrics.conversionRate * 100)}%`}
          hint={`${metrics.wonCount} won · ${metrics.lostCount} lost`}
        />
        <MetricCard
          label="Open tasks"
          value={String(metrics.openTaskCount)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-semibold">Value by stage</h2>
          <StageValueChart data={stageData} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-semibold">Activity over time</h2>
          <ActivityChart data={metrics.activityByDay} />
        </div>
      </div>
    </div>
  );
}
