import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Integration test proving RLS tenant isolation.
 *
 * Requires a real Postgres reachable via TEST_DATABASE_URL, connecting as a
 * NON-superuser role (NOBYPASSRLS) so policies are enforced. If that env var
 * is absent the suite is skipped so unit CI stays green without a database.
 *
 * Setup expected before running with a DB:
 *   npm run db:migrate   (creates schema + RLS)
 *   psql ... -f src/server/db/setup-role.sql   (creates app_user role)
 *   TEST_DATABASE_URL=postgres://app_user:password@host/db npm test
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("RLS tenant isolation", () => {
  // Imported lazily so the module (and its env access) only loads with a DB.
  let mod: typeof import("./client");
  let schema: typeof import("./schema");
  let tenantSvc: typeof import("@/server/services/tenant");
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    mod = await import("./client");
    schema = await import("./schema");
    tenantSvc = await import("@/server/services/tenant");

    const stamp = Date.now();
    const a = await tenantSvc.createTenantWithOwner({
      tenantName: "Tenant A",
      slug: `a-${stamp}`,
      ownerEmail: `a-${stamp}@test.local`,
      ownerName: "A Owner",
      passwordHash: "x",
    });
    const b = await tenantSvc.createTenantWithOwner({
      tenantName: "Tenant B",
      slug: `b-${stamp}`,
      ownerEmail: `b-${stamp}@test.local`,
      ownerName: "B Owner",
      passwordHash: "x",
    });
    tenantA = a.tenantId;
    tenantB = b.tenantId;

    // Insert one company per tenant using the tenant-scoped connection.
    await mod.withTenant(tenantA, async (tx) => {
      await tx
        .insert(schema.companies)
        .values({ tenantId: tenantA, name: "A-Only Company" });
    });
    await mod.withTenant(tenantB, async (tx) => {
      await tx
        .insert(schema.companies)
        .values({ tenantId: tenantB, name: "B-Only Company" });
    });
  });

  afterAll(async () => {
    await mod?.closeDb();
  });

  it("tenant A sees only its own companies", async () => {
    const rows = await mod.withTenant(tenantA, async (tx) =>
      tx.select().from(schema.companies),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
    expect(rows.some((r) => r.name === "A-Only Company")).toBe(true);
    expect(rows.some((r) => r.name === "B-Only Company")).toBe(false);
  });

  it("tenant B cannot see tenant A rows", async () => {
    const rows = await mod.withTenant(tenantB, async (tx) =>
      tx.select().from(schema.companies),
    );
    expect(rows.every((r) => r.tenantId === tenantB)).toBe(true);
    expect(rows.some((r) => r.name === "A-Only Company")).toBe(false);
  });

  it("cannot insert a row for a different tenant (WITH CHECK)", async () => {
    await expect(
      mod.withTenant(tenantA, async (tx) => {
        await tx
          .insert(schema.companies)
          .values({ tenantId: tenantB, name: "Smuggled" });
      }),
    ).rejects.toThrow();
  });
});
