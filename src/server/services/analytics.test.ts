import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";

/**
 * Integration test for dashboard aggregation accuracy. Skipped unless
 * TEST_DATABASE_URL is set. See db/README.md.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("dashboard metrics", () => {
  let analytics: typeof import("./analytics");
  let dealsSvc: typeof import("./deals");
  let activitiesSvc: typeof import("./activities");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");
  let user: SessionUser;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    analytics = await import("./analytics");
    dealsSvc = await import("./deals");
    activitiesSvc = await import("./activities");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Analytics Co",
      slug: `analytics-${stamp}`,
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

  it("sums pipeline value across stages", async () => {
    await dealsSvc.createDeal(user, { title: "A", valueCents: 100_00 });
    await dealsSvc.createDeal(user, { title: "B", valueCents: 400_00 });

    const m = await analytics.getDashboardMetrics(user);
    expect(m.pipelineTotalCents).toBe(500_00);
    expect(m.openDealCount).toBe(2);
    const sumFromBreakdown = m.stageBreakdown.reduce(
      (sum, s) => sum + s.totalCents,
      0,
    );
    expect(sumFromBreakdown).toBe(500_00);
  });

  it("computes conversion rate from won/lost stages", async () => {
    const board = await dealsSvc.getBoard(user);
    const won = board!.stages.find((s) => s.isWon)!;
    const lost = board!.stages.find((s) => s.isLost)!;

    const d1 = await dealsSvc.createDeal(user, {
      title: "Winner",
      valueCents: 1,
    });
    await dealsSvc.moveDeal(user, {
      dealId: d1.id,
      toStageId: won.id,
      toIndex: 0,
    });
    const d2 = await dealsSvc.createDeal(user, { title: "Loser", valueCents: 1 });
    await dealsSvc.moveDeal(user, {
      dealId: d2.id,
      toStageId: lost.id,
      toIndex: 0,
    });

    const m = await analytics.getDashboardMetrics(user);
    expect(m.wonCount).toBeGreaterThanOrEqual(1);
    expect(m.lostCount).toBeGreaterThanOrEqual(1);
    // with 1 won + 1 lost, conversion is 0.5
    expect(m.conversionRate).toBeCloseTo(
      m.wonCount / (m.wonCount + m.lostCount),
      5,
    );
  });

  it("returns a continuous daily activity series", async () => {
    const m = await analytics.getDashboardMetrics(user, {
      from: new Date(Date.now() - 7 * 86_400_000),
      to: new Date(),
    });
    expect(m.activityByDay.length).toBeGreaterThanOrEqual(7);
  });

  it("buckets a logged activity into its UTC day (BUG-7)", async () => {
    const contact = await (
      await import("./contacts")
    ).createContact(user, { firstName: "ActivityBucket" });
    await activitiesSvc.addNote(user, {
      contactId: contact.id,
      body: "logged today",
    });

    const todayUtc = new Date().toISOString().slice(0, 10);
    const m = await analytics.getDashboardMetrics(user, {
      from: new Date(Date.now() - 2 * 86_400_000),
      to: new Date(),
    });
    const todayPoint = m.activityByDay.find((p) => p.date === todayUtc);
    expect(todayPoint).toBeDefined();
    // The note we just created must be counted in today's UTC bucket.
    expect(todayPoint!.count).toBeGreaterThanOrEqual(1);
  });
});
