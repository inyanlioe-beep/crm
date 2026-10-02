import { and, asc, desc, eq, isNull, isNotNull, lt, or, sql } from "drizzle-orm";
import { withTenant } from "@/server/db/client";
import { activities, users } from "@/server/db/schema";
import { requirePermission } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/auth";

export type ActivityType =
  | "note"
  | "task"
  | "email"
  | "call"
  | "meeting"
  | "stage_change";

export interface TimelineItem {
  id: string;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
}

export interface ActivityTarget {
  contactId?: string | null;
  dealId?: string | null;
}

/** Timeline for a contact or deal, newest first. */
export async function listTimeline(
  user: SessionUser,
  target: ActivityTarget,
): Promise<TimelineItem[]> {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const conds = [];
    if (target.contactId) conds.push(eq(activities.contactId, target.contactId));
    if (target.dealId) conds.push(eq(activities.dealId, target.dealId));
    if (conds.length === 0) return [];

    const rows = await tx
      .select({
        id: activities.id,
        type: activities.type,
        subject: activities.subject,
        body: activities.body,
        dueAt: activities.dueAt,
        completedAt: activities.completedAt,
        createdAt: activities.createdAt,
        createdByName: users.name,
      })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.createdBy))
      .where(conds.length === 1 ? conds[0] : or(...conds))
      .orderBy(desc(activities.createdAt));
    return rows;
  });
}

export interface AddNoteInput extends ActivityTarget {
  body: string;
}

export async function addNote(
  user: SessionUser,
  input: AddNoteInput,
): Promise<{ id: string }> {
  requirePermission(user.role, "crm:create");
  return withTenant(user.tenantId, async (tx) => {
    const [row] = await tx
      .insert(activities)
      .values({
        tenantId: user.tenantId,
        type: "note",
        body: input.body,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
        createdBy: user.userId,
      })
      .returning({ id: activities.id });
    return row;
  });
}

export interface AddEmailInput extends ActivityTarget {
  subject: string;
  body: string;
}

/** Record a sent email on the timeline (type "email"). */
export async function addEmailActivity(
  user: SessionUser,
  input: AddEmailInput,
): Promise<{ id: string }> {
  requirePermission(user.role, "crm:create");
  return withTenant(user.tenantId, async (tx) => {
    const [row] = await tx
      .insert(activities)
      .values({
        tenantId: user.tenantId,
        type: "email",
        subject: input.subject,
        body: input.body,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
        createdBy: user.userId,
      })
      .returning({ id: activities.id });
    return row;
  });
}

export interface AddTaskInput extends ActivityTarget {
  subject: string;
  body?: string | null;
  dueAt?: Date | null;
}

export async function addTask(
  user: SessionUser,
  input: AddTaskInput,
): Promise<{ id: string }> {
  requirePermission(user.role, "crm:create");
  return withTenant(user.tenantId, async (tx) => {
    const [row] = await tx
      .insert(activities)
      .values({
        tenantId: user.tenantId,
        type: "task",
        subject: input.subject,
        body: input.body ?? null,
        dueAt: input.dueAt ?? null,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
        createdBy: user.userId,
      })
      .returning({ id: activities.id });
    return row;
  });
}

/** Toggle a task between completed and open. */
export async function setTaskComplete(
  user: SessionUser,
  id: string,
  complete: boolean,
): Promise<void> {
  requirePermission(user.role, "crm:update");
  await withTenant(user.tenantId, async (tx) => {
    await tx
      .update(activities)
      .set({ completedAt: complete ? new Date() : null })
      .where(and(eq(activities.id, id), eq(activities.type, "task")));
  });
}

export async function deleteActivity(
  user: SessionUser,
  id: string,
): Promise<void> {
  requirePermission(user.role, "crm:update");
  await withTenant(user.tenantId, async (tx) => {
    await tx.delete(activities).where(eq(activities.id, id));
  });
}

export interface TaskItem {
  id: string;
  subject: string | null;
  body: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  contactId: string | null;
  dealId: string | null;
}

export type TaskFilter = "open" | "overdue" | "completed" | "all";

/** List tasks for the tenant with a status filter. Open/overdue sorted by due. */
export async function listTasks(
  user: SessionUser,
  filter: TaskFilter = "open",
): Promise<TaskItem[]> {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const conds = [eq(activities.type, "task")];
    const now = new Date();

    if (filter === "open") {
      conds.push(isNull(activities.completedAt));
    } else if (filter === "completed") {
      conds.push(isNotNull(activities.completedAt));
    } else if (filter === "overdue") {
      conds.push(isNull(activities.completedAt));
      conds.push(isNotNull(activities.dueAt));
      conds.push(lt(activities.dueAt, now));
    }

    const rows = await tx
      .select({
        id: activities.id,
        subject: activities.subject,
        body: activities.body,
        dueAt: activities.dueAt,
        completedAt: activities.completedAt,
        createdAt: activities.createdAt,
        contactId: activities.contactId,
        dealId: activities.dealId,
      })
      .from(activities)
      .where(and(...conds))
      // Nulls last on due date, then earliest due first.
      .orderBy(
        sql`${activities.dueAt} asc nulls last`,
        asc(activities.createdAt),
      );
    return rows;
  });
}

export async function countOpenTasks(user: SessionUser): Promise<number> {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(and(eq(activities.type, "task"), isNull(activities.completedAt)));
    return count;
  });
}
