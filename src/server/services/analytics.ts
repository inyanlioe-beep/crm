import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { withTenant } from "@/server/db/client";
import { deals, stages, pipelines, activities } from "@/server/db/schema";
import { requirePermission } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/auth";

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Maximum span (in days) for the dashboard activity series. Longer ranges are
 * clamped to the most recent window by parseRange so the chart never silently
 * drops the tail of the requested period.
 */
export const MAX_RANGE_DAYS = 366;

export interface StageBreakdown {
  stageId: string;
  stageName: string;
  dealCount: number;
  totalCents: number;
}

export interface ActivityPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface DashboardMetrics {
  pipelineTotalCents: number;
  weightedForecastCents: number;
  openDealCount: number;
  wonCount: number;
  lostCount: number;
  // conversion = won / (won + lost), 0..1
  conversionRate: number;
  openTaskCount: number;
  stageBreakdown: StageBreakdown[];
  activityByDay: ActivityPoint[];
}

/** Default range: last 30 days. */
export function defaultRange(now: Date = new Date()): DateRange {
  const to = now;
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute dashboard metrics for the tenant's default pipeline, with an
 * activity time-series bounded by the given date range. All queries are tenant
 * scoped via withTenant (RLS enforced).
 */
export async function getDashboardMetrics(
  user: SessionUser,
  range: DateRange = defaultRange(),
): Promise<DashboardMetrics> {
  requirePermission(user.role, "crm:view");

  return withTenant(user.tenantId, async (tx) => {
    const [pipeline] = await tx
      .select({ id: pipelines.id, isDefault: pipelines.isDefault })
      .from(pipelines)
      .orderBy(asc(pipelines.createdAt))
      .limit(1);

    const empty: DashboardMetrics = {
      pipelineTotalCents: 0,
      weightedForecastCents: 0,
      openDealCount: 0,
      wonCount: 0,
      lostCount: 0,
      conversionRate: 0,
      openTaskCount: 0,
      stageBreakdown: [],
      activityByDay: [],
    };
    if (!pipeline) return empty;

    // Per-stage aggregation joined with stage metadata.
    const stageRows = await tx
      .select({
        stageId: stages.id,
        stageName: stages.name,
        position: stages.position,
        probability: stages.probability,
        isWon: stages.isWon,
        isLost: stages.isLost,
        dealCount: sql<number>`count(${deals.id})::int`,
        totalCents: sql<number>`coalesce(sum(${deals.valueCents}), 0)::bigint`,
      })
      .from(stages)
      .leftJoin(deals, eq(deals.stageId, stages.id))
      .where(eq(stages.pipelineId, pipeline.id))
      .groupBy(
        stages.id,
        stages.name,
        stages.position,
        stages.probability,
        stages.isWon,
        stages.isLost,
      )
      .orderBy(asc(stages.position));

    let pipelineTotal = 0;
    let weighted = 0;
    let openDeals = 0;
    let wonCount = 0;
    let lostCount = 0;
    const stageBreakdown: StageBreakdown[] = [];

    for (const s of stageRows) {
      const total = Number(s.totalCents);
      pipelineTotal += total;
      weighted += Math.round((total * s.probability) / 100);
      if (s.isWon) wonCount += s.dealCount;
      else if (s.isLost) lostCount += s.dealCount;
      else openDeals += s.dealCount;

      stageBreakdown.push({
        stageId: s.stageId,
        stageName: s.stageName,
        dealCount: s.dealCount,
        totalCents: total,
      });
    }

    const closed = wonCount + lostCount;
    const conversionRate = closed > 0 ? wonCount / closed : 0;

    // Open tasks count.
    const [{ openTaskCount }] = await tx
      .select({
        openTaskCount: sql<number>`count(*) filter (where ${activities.type} = 'task' and ${activities.completedAt} is null)::int`,
      })
      .from(activities);

    // Activity counts per day within the range. Bucket by UTC day explicitly
    // (AT TIME ZONE 'UTC') so the SQL day keys match the UTC keys produced on
    // the JS side below — otherwise a non-UTC DB session timezone would make
    // the keys disagree and every day would render as 0.
    const dayExpr = sql<string>`to_char(${activities.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const activityRows = await tx
      .select({
        day: dayExpr,
        count: sql<number>`count(*)::int`,
      })
      .from(activities)
      .where(
        and(
          gte(activities.createdAt, range.from),
          lte(activities.createdAt, range.to),
        ),
      )
      .groupBy(dayExpr)
      .orderBy(dayExpr);

    // Fill gaps so the chart has a continuous daily series. The range is
    // already clamped to MAX_RANGE_DAYS by parseRange, but we keep a hard
    // safety cap so an unclamped caller can't produce an unbounded payload.
    const byDay = new Map(activityRows.map((r) => [r.day, r.count]));
    const activityByDay: ActivityPoint[] = [];
    const cursor = new Date(range.from);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(range.to);
    end.setUTCHours(0, 0, 0, 0);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard <= MAX_RANGE_DAYS) {
      const key = toDay(cursor);
      activityByDay.push({ date: key, count: byDay.get(key) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      guard++;
    }

    return {
      pipelineTotalCents: pipelineTotal,
      weightedForecastCents: weighted,
      openDealCount: openDeals,
      wonCount,
      lostCount,
      conversionRate,
      openTaskCount,
      stageBreakdown,
      activityByDay,
    };
  });
}

/**
 * Parse ?from=&to= (YYYY-MM-DD) into a DateRange, defaulting to last 30 days.
 * Ranges longer than MAX_RANGE_DAYS are clamped to the most recent window
 * (keeping `to`, moving `from` forward) so the activity series never silently
 * truncates the tail of the requested period.
 */
export function parseRange(params: {
  from?: string;
  to?: string;
}): DateRange {
  const def = defaultRange();
  const from = params.from ? new Date(params.from) : def.from;
  const to = params.to ? new Date(`${params.to}T23:59:59.999Z`) : def.to;
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return def;

  const maxMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    return { from: new Date(to.getTime() - maxMs), to };
  }
  return { from, to };
}
