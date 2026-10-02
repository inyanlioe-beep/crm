import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";

/**
 * Integration tests for the deals board + moveDeal. Skipped unless
 * TEST_DATABASE_URL is set (app_user / NOBYPASSRLS). See db/README.md.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("deals board", () => {
  let dealsSvc: typeof import("./deals");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");
  let user: SessionUser;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    dealsSvc = await import("./deals");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Deals Co",
      slug: `deals-${stamp}`,
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

  it("creates deals in the first stage and sums stage totals", async () => {
    await dealsSvc.createDeal(user, { title: "Deal A", valueCents: 100_00 });
    await dealsSvc.createDeal(user, { title: "Deal B", valueCents: 250_00 });

    const board = await dealsSvc.getBoard(user);
    expect(board).not.toBeNull();
    const first = board!.stages[0];
    expect(first.deals.length).toBe(2);
    expect(first.totalCents).toBe(350_00);
    expect(board!.totalCents).toBe(350_00);
  });

  it("moves a deal to another stage and updates totals", async () => {
    const board = await dealsSvc.getBoard(user);
    const first = board!.stages[0];
    const second = board!.stages[1];
    const deal = first.deals[0];

    await dealsSvc.moveDeal(user, {
      dealId: deal.id,
      toStageId: second.id,
      toIndex: 0,
    });

    const after = await dealsSvc.getBoard(user);
    const afterSecond = after!.stages[1];
    expect(afterSecond.deals.some((d) => d.id === deal.id)).toBe(true);
    expect(after!.stages[0].deals.some((d) => d.id === deal.id)).toBe(false);
  });

  it("computes a weighted forecast from stage probabilities", async () => {
    const board = await dealsSvc.getBoard(user);
    // weighted = sum over stages of total * probability/100
    const expected = board!.stages.reduce(
      (sum, s) => sum + Math.round((s.totalCents * s.probability) / 100),
      0,
    );
    expect(board!.weightedCents).toBe(expected);
  });

  it("prevents a viewer from creating a deal", async () => {
    const viewer: SessionUser = { ...user, role: "viewer" };
    await expect(
      dealsSvc.createDeal(viewer, { title: "X", valueCents: 1 }),
    ).rejects.toThrow();
  });
});
