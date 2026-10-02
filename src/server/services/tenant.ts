import { getAdminDb, TenantDb } from "@/server/db/client";
import {
  tenants,
  users,
  pipelines,
  stages,
  subscriptions,
  userRoleEnum,
} from "@/server/db/schema";

export type Role = (typeof userRoleEnum.enumValues)[number];

const DEFAULT_STAGES = [
  { name: "Lead", probability: 10, isWon: false, isLost: false },
  { name: "Qualified", probability: 30, isWon: false, isLost: false },
  { name: "Proposal", probability: 60, isWon: false, isLost: false },
  { name: "Negotiation", probability: 80, isWon: false, isLost: false },
  { name: "Won", probability: 100, isWon: true, isLost: false },
  { name: "Lost", probability: 0, isWon: false, isLost: true },
];

/**
 * Seed the default pipeline + stages for a freshly created tenant.
 * Works with any Drizzle executor (admin db or a tenant tx).
 */
export async function seedDefaultPipeline(
  db: Pick<TenantDb, "insert">,
  tenantId: string,
): Promise<{ pipelineId: string }> {
  const [pipeline] = await db
    .insert(pipelines)
    .values({ tenantId, name: "Sales Pipeline", isDefault: true })
    .returning();

  await db.insert(stages).values(
    DEFAULT_STAGES.map((s, i) => ({
      tenantId,
      pipelineId: pipeline.id,
      name: s.name,
      position: i,
      probability: s.probability,
      isWon: s.isWon,
      isLost: s.isLost,
    })),
  );

  return { pipelineId: pipeline.id };
}

export interface CreateTenantInput {
  tenantName: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  passwordHash: string;
}

export interface CreateTenantResult {
  tenantId: string;
  userId: string;
}

/**
 * Provision a new tenant with its owner user, default pipeline, and a free
 * subscription. Runs on the admin connection (bypasses RLS) because there is
 * no tenant session yet at registration time. All writes happen in one tx.
 */
export async function createTenantWithOwner(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const db = getAdminDb();
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: input.tenantName, slug: input.slug, plan: "free" })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: input.ownerEmail.toLowerCase(),
        name: input.ownerName,
        passwordHash: input.passwordHash,
        role: "owner",
      })
      .returning();

    await tx
      .insert(subscriptions)
      .values({ tenantId: tenant.id, plan: "free", status: "active" });

    await seedDefaultPipeline(tx, tenant.id);

    return { tenantId: tenant.id, userId: user.id };
  });
}
