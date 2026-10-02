import { desc, eq, ilike, sql } from "drizzle-orm";
import { withTenant } from "@/server/db/client";
import { companies, contacts } from "@/server/db/schema";
import { requirePermission } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/auth";

export const PAGE_SIZE = 20;

export interface CompanyInput {
  name: string;
  domain?: string | null;
  industry?: string | null;
  tags?: string[];
}

export interface CompanyListParams {
  search?: string;
  page?: number;
}

export interface CompanyListResult {
  items: Array<{
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    tags: string[];
    contactCount: number;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageCount: number;
}

export async function listCompanies(
  user: SessionUser,
  params: CompanyListParams = {},
): Promise<CompanyListResult> {
  requirePermission(user.role, "crm:view");
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const search = params.search?.trim();

  return withTenant(user.tenantId, async (tx) => {
    const where = search
      ? ilike(companies.name, `%${search}%`)
      : undefined;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(where);

    const rows = await tx
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.domain,
        industry: companies.industry,
        tags: companies.tags,
        createdAt: companies.createdAt,
        contactCount: sql<number>`(
          select count(*)::int from ${contacts}
          where ${contacts.companyId} = ${companies.id}
        )`,
      })
      .from(companies)
      .where(where)
      .orderBy(desc(companies.createdAt))
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

export async function getCompany(user: SessionUser, id: string) {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);
    return row ?? null;
  });
}

export async function createCompany(
  user: SessionUser,
  input: CompanyInput,
): Promise<{ id: string }> {
  requirePermission(user.role, "crm:create");
  return withTenant(user.tenantId, async (tx) => {
    const [row] = await tx
      .insert(companies)
      .values({
        tenantId: user.tenantId,
        name: input.name,
        domain: input.domain ?? null,
        industry: input.industry ?? null,
        tags: input.tags ?? [],
      })
      .returning({ id: companies.id });
    return row;
  });
}

export async function updateCompany(
  user: SessionUser,
  id: string,
  input: CompanyInput,
): Promise<void> {
  requirePermission(user.role, "crm:update");
  await withTenant(user.tenantId, async (tx) => {
    await tx
      .update(companies)
      .set({
        name: input.name,
        domain: input.domain ?? null,
        industry: input.industry ?? null,
        tags: input.tags ?? [],
      })
      .where(eq(companies.id, id));
  });
}

export async function deleteCompany(
  user: SessionUser,
  id: string,
): Promise<void> {
  requirePermission(user.role, "crm:delete");
  await withTenant(user.tenantId, async (tx) => {
    await tx.delete(companies).where(eq(companies.id, id));
  });
}

/** Lightweight option list for select inputs (id + name). */
export async function companyOptions(
  user: SessionUser,
): Promise<Array<{ id: string; name: string }>> {
  requirePermission(user.role, "crm:view");
  return withTenant(user.tenantId, async (tx) => {
    return tx
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .orderBy(companies.name)
      .limit(1000);
  });
}
