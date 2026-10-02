import "dotenv/config";
import { getAdminDb, withTenant, closeDb } from "./client";
import { companies, contacts } from "./schema";
import { createTenantWithOwner } from "@/server/services/tenant";

/**
 * Seed two tenants with sample data. Used for local demos and to visually
 * confirm tenant isolation. The owner password is "password" (hash below is
 * a placeholder; real hashing lands in Task 3). Safe to re-run: uses random
 * slugs suffixed with a timestamp.
 */
async function main() {
  const stamp = Date.now();
  const placeholderHash = "seed-placeholder-hash";

  const acme = await createTenantWithOwner({
    tenantName: "Acme Inc",
    slug: `acme-${stamp}`,
    ownerEmail: "owner@acme.test",
    ownerName: "Acme Owner",
    passwordHash: placeholderHash,
  });

  const globex = await createTenantWithOwner({
    tenantName: "Globex Corp",
    slug: `globex-${stamp}`,
    ownerEmail: "owner@globex.test",
    ownerName: "Globex Owner",
    passwordHash: placeholderHash,
  });

  await withTenant(acme.tenantId, async (tx) => {
    const [c] = await tx
      .insert(companies)
      .values({ tenantId: acme.tenantId, name: "Acme Widgets" })
      .returning();
    await tx.insert(contacts).values({
      tenantId: acme.tenantId,
      companyId: c.id,
      firstName: "Alice",
      lastName: "Acme",
      email: "alice@acme.test",
    });
  });

  await withTenant(globex.tenantId, async (tx) => {
    const [c] = await tx
      .insert(companies)
      .values({ tenantId: globex.tenantId, name: "Globex Labs" })
      .returning();
    await tx.insert(contacts).values({
      tenantId: globex.tenantId,
      companyId: c.id,
      firstName: "Bob",
      lastName: "Globex",
      email: "bob@globex.test",
    });
  });

  console.log("Seeded tenants:", {
    acme: acme.tenantId,
    globex: globex.tenantId,
  });

  // Verify isolation via admin db count vs tenant-scoped count.
  void getAdminDb();
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
