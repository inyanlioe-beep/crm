import { asc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/server/db/client";
import { deals, stages, pipelines, contacts, companies } from "@/server/db/schema";
import { requirePermission } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/auth";
import { withQuota } from "@/server/services/subscription";

export interface DealCard {
  id: string;
  title: string;
  valueCents: number;
  currency: string;
  stageId: string;
  position: number;
  contactName: string | null;
  companyName: string | null;
  expectedCloseDate: Date | null;
}

export interface BoardStage {
  id: string;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  deals: DealCard[];
  totalCents: number;
  // weighted by stage probability — a simple forecast figure
  weightedCents: number;
}

export interface Board {
  pipelineId: string;
  pipelineName: string;
  stages: BoardStage[];
  totalCents: number;
  weightedCents: number;
}

/** Resolve the tenant's default pipeline (or the first one). */
async function resolvePipelineId(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  pipelineId?: string,
): Promise<{ id: string; name: string } | null> {
  if (pipelineId) {
    const [p] = await tx
      .select({ id: pipelines.id, name: pipelines.name })
      .from(pipelines)
      .where(eq(pipelines.id, pipelineId))
      .limit(1);
    return p ?? null;
  }
  const list = await tx
    .select({ id: pipelines.id, name: pipelines.name, isDefault: pipelines.isDefault })
    .from(pipelines)
    .orderBy(asc(pipelines.createdAt));
  if (list.length === 0) return null;
  const def = list.find((p) => p.isDefault) ?? list[0];
  return { id: def.id, name: def.name };
}

/** Build the kanban board: stages (ordered) each with their deals + totals. */
export async function getBoard(
  user: SessionUser,
  pipelineId?: string,
): Promise<Board | null> {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const pipeline = await resolvePipelineId(tx, pipelineId);
    if (!pipeline) return null;

    const stageRows = await tx
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, pipeline.id))
      .orderBy(asc(stages.position));

    const dealRows = await tx
      .select({
        id: deals.id,
        title: deals.title,
        valueCents: deals.valueCents,
        currency: deals.currency,
        stageId: deals.stageId,
        position: deals.position,
        expectedCloseDate: deals.expectedCloseDate,
        contactFirst: contacts.firstName,
        contactLast: contacts.lastName,
        companyName: companies.name,
      })
      .from(deals)
      .leftJoin(contacts, eq(contacts.id, deals.contactId))
      .leftJoin(companies, eq(companies.id, deals.companyId))
      .where(eq(deals.pipelineId, pipeline.id))
      .orderBy(asc(deals.position));

    const byStage = new Map<string, DealCard[]>();
    for (const s of stageRows) byStage.set(s.id, []);
    for (const d of dealRows) {
      const card: DealCard = {
        id: d.id,
        title: d.title,
        valueCents: d.valueCents,
        currency: d.currency,
        stageId: d.stageId,
        position: d.position,
        contactName:
          [d.contactFirst, d.contactLast].filter(Boolean).join(" ") || null,
        companyName: d.companyName,
        expectedCloseDate: d.expectedCloseDate,
      };
      (byStage.get(d.stageId) ?? []).push(card);
    }

    let total = 0;
    let weighted = 0;
    const boardStages: BoardStage[] = stageRows.map((s) => {
      const cards = byStage.get(s.id) ?? [];
      const stageTotal = cards.reduce((sum, c) => sum + c.valueCents, 0);
      const stageWeighted = Math.round((stageTotal * s.probability) / 100);
      total += stageTotal;
      weighted += stageWeighted;
      return {
        id: s.id,
        name: s.name,
        position: s.position,
        probability: s.probability,
        isWon: s.isWon,
        isLost: s.isLost,
        deals: cards,
        totalCents: stageTotal,
        weightedCents: stageWeighted,
      };
    });

    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      stages: boardStages,
      totalCents: total,
      weightedCents: weighted,
    };
  });
}

export interface DealInput {
  title: string;
  valueCents: number;
  currency?: string;
  stageId?: string;
  contactId?: string | null;
  companyId?: string | null;
  expectedCloseDate?: Date | null;
}

export async function createDeal(
  user: SessionUser,
  input: DealInput,
): Promise<{ id: string }> {
  requirePermission(user.role, "crm:create");
  // Quota check + insert share one transaction (no check-then-act race).
  return withQuota(user, "deals", async (tx) => {
    const pipeline = await resolvePipelineId(tx);
    if (!pipeline) throw new Error("No pipeline configured");

    // Determine target stage: provided, else the first stage by position.
    let stageId = input.stageId;
    if (!stageId) {
      const [first] = await tx
        .select({ id: stages.id })
        .from(stages)
        .where(eq(stages.pipelineId, pipeline.id))
        .orderBy(asc(stages.position))
        .limit(1);
      if (!first) throw new Error("Pipeline has no stages");
      stageId = first.id;
    }

    // Append to the end of the stage.
    const [{ maxPos }] = await tx
      .select({ maxPos: sql<number>`coalesce(max(${deals.position}), -1)::int` })
      .from(deals)
      .where(eq(deals.stageId, stageId));

    const [row] = await tx
      .insert(deals)
      .values({
        tenantId: user.tenantId,
        pipelineId: pipeline.id,
        stageId,
        title: input.title,
        valueCents: input.valueCents,
        currency: input.currency ?? "USD",
        contactId: input.contactId ?? null,
        companyId: input.companyId ?? null,
        ownerId: user.userId,
        position: maxPos + 1,
        expectedCloseDate: input.expectedCloseDate ?? null,
      })
      .returning({ id: deals.id });
    return row;
  });
}

export async function updateDeal(
  user: SessionUser,
  id: string,
  input: DealInput,
): Promise<void> {
  requirePermission(user.role, "crm:update");
  await withTenant(user.tenantId, async (tx) => {
    await tx
      .update(deals)
      .set({
        title: input.title,
        valueCents: input.valueCents,
        currency: input.currency ?? "USD",
        contactId: input.contactId ?? null,
        companyId: input.companyId ?? null,
        expectedCloseDate: input.expectedCloseDate ?? null,
        ...(input.stageId ? { stageId: input.stageId } : {}),
      })
      .where(eq(deals.id, id));
  });
}

export async function deleteDeal(user: SessionUser, id: string): Promise<void> {
  requirePermission(user.role, "crm:delete");
  await withTenant(user.tenantId, async (tx) => {
    await tx.delete(deals).where(eq(deals.id, id));
  });
}

/**
 * Move a deal to a target stage at a target index. Reorders siblings in the
 * target stage so positions stay 0..n-1. Guards that the stage belongs to the
 * same tenant/pipeline (RLS already restricts tenant; we also check pipeline).
 */
export async function moveDeal(
  user: SessionUser,
  input: { dealId: string; toStageId: string; toIndex: number },
): Promise<void> {
  requirePermission(user.role, "crm:update");
  await withTenant(user.tenantId, async (tx) => {
    const [deal] = await tx
      .select({ id: deals.id, pipelineId: deals.pipelineId })
      .from(deals)
      .where(eq(deals.id, input.dealId))
      .limit(1);
    if (!deal) throw new Error("Deal not found");

    const [stage] = await tx
      .select({ id: stages.id, pipelineId: stages.pipelineId })
      .from(stages)
      .where(eq(stages.id, input.toStageId))
      .limit(1);
    if (!stage || stage.pipelineId !== deal.pipelineId) {
      throw new Error("Invalid target stage");
    }

    // Current deals in the target stage, excluding the moving one, ordered.
    const siblings = (
      await tx
        .select({ id: deals.id })
        .from(deals)
        .where(eq(deals.stageId, input.toStageId))
        .orderBy(asc(deals.position))
    ).filter((d) => d.id !== input.dealId);

    const clampedIndex = Math.max(0, Math.min(input.toIndex, siblings.length));
    const ordered = [
      ...siblings.slice(0, clampedIndex).map((d) => d.id),
      input.dealId,
      ...siblings.slice(clampedIndex).map((d) => d.id),
    ];

    // Persist new stage for the moved deal, then rewrite positions.
    await tx
      .update(deals)
      .set({ stageId: input.toStageId })
      .where(eq(deals.id, input.dealId));

    for (let i = 0; i < ordered.length; i++) {
      await tx
        .update(deals)
        .set({ position: i })
        .where(eq(deals.id, ordered[i]));
    }
  });
}

export async function getDeal(user: SessionUser, id: string) {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(deals)
      .where(eq(deals.id, id))
      .limit(1);
    return row ?? null;
  });
}

export async function listStages(user: SessionUser, pipelineId?: string) {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const pipeline = await resolvePipelineId(tx, pipelineId);
    if (!pipeline) return [];
    return tx
      .select({ id: stages.id, name: stages.name })
      .from(stages)
      .where(eq(stages.pipelineId, pipeline.id))
      .orderBy(asc(stages.position));
  });
}
