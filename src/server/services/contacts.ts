import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { withTenant } from "@/server/db/client";
import { contacts, companies } from "@/server/db/schema";
import { requirePermission } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/auth";
import { withQuota } from "@/server/services/subscription";
import { parseCsv, mapContactCsv } from "./csv";

export const PAGE_SIZE = 20;

export interface ContactInput {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  companyId?: string | null;
  tags?: string[];
}

export interface ContactListParams {
  search?: string;
  page?: number;
  companyId?: string;
}

export interface ContactListResult {
  items: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    tags: string[];
    companyId: string | null;
    companyName: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageCount: number;
}

export async function listContacts(
  user: SessionUser,
  params: ContactListParams = {},
): Promise<ContactListResult> {
  requirePermission(user.role, "crm:view");
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const search = params.search?.trim();

  return withTenant(user.tenantId, async (tx) => {
    const filters: SQL[] = [];
    if (search) {
      const s = or(
        ilike(contacts.firstName, `%${search}%`),
        ilike(contacts.lastName, `%${search}%`),
        ilike(contacts.email, `%${search}%`),
      );
      if (s) filters.push(s);
    }
    if (params.companyId) {
      filters.push(eq(contacts.companyId, params.companyId));
    }
    const where = filters.length ? and(...filters) : undefined;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(where);

    const rows = await tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        title: contacts.title,
        tags: contacts.tags,
        companyId: contacts.companyId,
        companyName: companies.name,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .leftJoin(companies, eq(companies.id, contacts.companyId))
      .where(where)
      .orderBy(desc(contacts.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset);

    return {
      items: rows,
      total: count,
      page,
      pageCount: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    };
  });
}

/** Lightweight option list for select inputs (id + display name). */
export async function contactOptions(
  user: SessionUser,
): Promise<Array<{ id: string; name: string }>> {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .orderBy(contacts.firstName)
      .limit(1000);
    return rows.map((r) => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(" "),
    }));
  });
}

export async function getContact(user: SessionUser, id: string) {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);
    return row ?? null;
  });
}

export async function createContact(
  user: SessionUser,
  input: ContactInput,
): Promise<{ id: string }> {
  requirePermission(user.role, "crm:create");
  // Quota check + insert share one transaction (no check-then-act race).
  return withQuota(user, "contacts", async (tx) => {
    const [row] = await tx
      .insert(contacts)
      .values({
        tenantId: user.tenantId,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email?.toLowerCase() ?? null,
        phone: input.phone ?? null,
        title: input.title ?? null,
        companyId: input.companyId ?? null,
        ownerId: user.userId,
        tags: input.tags ?? [],
      })
      .returning({ id: contacts.id });
    return row;
  });
}

export async function updateContact(
  user: SessionUser,
  id: string,
  input: ContactInput,
): Promise<void> {
  requirePermission(user.role, "crm:update");
  await withTenant(user.tenantId, async (tx) => {
    await tx
      .update(contacts)
      .set({
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email?.toLowerCase() ?? null,
        phone: input.phone ?? null,
        title: input.title ?? null,
        companyId: input.companyId ?? null,
        tags: input.tags ?? [],
      })
      .where(eq(contacts.id, id));
  });
}

export async function deleteContact(
  user: SessionUser,
  id: string,
): Promise<void> {
  requirePermission(user.role, "crm:delete");
  await withTenant(user.tenantId, async (tx) => {
    await tx.delete(contacts).where(eq(contacts.id, id));
  });
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Import contacts from raw CSV text. Resolves/creates companies by name
 * (case-insensitive) within the tenant. Runs in a single transaction so a
 * failure rolls back the whole import.
 */
export async function importContactsCsv(
  user: SessionUser,
  csvText: string,
): Promise<ImportResult> {
  requirePermission(user.role, "crm:create");
  const { rows, errors } = mapContactCsv(parseCsv(csvText));
  if (rows.length === 0) {
    return { imported: 0, skipped: 0, errors: errors.length ? errors : ["No valid rows found"] };
  }

  // Quota check + the whole batch insert share one transaction, so the
  // "whole batch fits" guarantee is atomic (no concurrent import can slip in
  // between the count and the inserts).
  return withQuota(
    user,
    "contacts",
    async (tx) => {
      const companyCache = new Map<string, string>();

    const resolveCompany = async (name?: string): Promise<string | null> => {
      if (!name) return null;
      const key = name.toLowerCase();
      const cached = companyCache.get(key);
      if (cached) return cached;

      const existing = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(ilike(companies.name, name))
        .limit(1);
      if (existing[0]) {
        companyCache.set(key, existing[0].id);
        return existing[0].id;
      }
      const [created] = await tx
        .insert(companies)
        .values({ tenantId: user.tenantId, name })
        .returning({ id: companies.id });
      companyCache.set(key, created.id);
      return created.id;
    };

      let imported = 0;
      for (const r of rows) {
        const companyId = await resolveCompany(r.company);
        await tx.insert(contacts).values({
          tenantId: user.tenantId,
          firstName: r.firstName,
          lastName: r.lastName ?? null,
          email: r.email?.toLowerCase() ?? null,
          phone: r.phone ?? null,
          title: r.title ?? null,
          companyId,
          ownerId: user.userId,
          tags: [],
        });
        imported++;
      }

      return { imported, skipped: errors.length, errors };
    },
    rows.length,
  );
}
