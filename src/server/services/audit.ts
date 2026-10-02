import { desc } from "drizzle-orm";
import { withTenant } from "@/server/db/client";
import { auditLogs, users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/auth";

export interface AuditInput {
  action: string;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Record an audit entry for a sensitive action. Best-effort: audit failures
 * must never block the primary operation, so errors are swallowed (logged).
 */
export async function logAudit(
  user: SessionUser,
  input: AuditInput,
): Promise<void> {
  try {
    await withTenant(user.tenantId, async (tx) => {
      await tx.insert(auditLogs).values({
        tenantId: user.tenantId,
        userId: user.userId,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? null,
      });
    });
  } catch (err) {
    console.error("audit log failed", input.action, err);
  }
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorName: string | null;
  createdAt: Date;
}

/** List recent audit entries for the tenant. Requires members:view. */
export async function listAuditLogs(
  user: SessionUser,
  limit = 100,
): Promise<AuditEntry[]> {
  requirePermission(user.role, "members:view");
  return withTenant(user.tenantId, async (tx) => {
    return tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        actorName: users.name,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(limit, 500));
  });
}
