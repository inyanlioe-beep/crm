import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

/**
 * Two connection pools:
 *  - app pool: connects as a NON-superuser role that is subject to RLS.
 *    All request-time queries MUST go through withTenant() using this pool.
 *  - admin pool: used for migrations and system-level operations that must
 *    bypass RLS (e.g. creating a tenant + owner during registration, or
 *    handling billing webhooks that arrive without a tenant session).
 */

type Sql = ReturnType<typeof postgres>;
type Db = ReturnType<typeof drizzle<typeof schema>>;

let appSql: Sql | null = null;
let appDb: Db | null = null;
let adminSql: Sql | null = null;
let adminDb: Db | null = null;

function getAppSql(): Sql {
  if (!appSql) {
    const env = getEnv();
    appSql = postgres(env.DATABASE_URL, { max: 10 });
  }
  return appSql;
}

function getAdminSql(): Sql {
  if (!adminSql) {
    const env = getEnv();
    adminSql = postgres(env.DATABASE_ADMIN_URL ?? env.DATABASE_URL, { max: 5 });
  }
  return adminSql;
}

/** RLS-enforced Drizzle instance. Prefer withTenant() over using this directly. */
export function getAppDb(): Db {
  if (!appDb) appDb = drizzle(getAppSql(), { schema });
  return appDb;
}

/** Admin Drizzle instance that bypasses RLS. Use sparingly. */
export function getAdminDb(): Db {
  if (!adminDb) adminDb = drizzle(getAdminSql(), { schema });
  return adminDb;
}

export type TenantDb = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run a callback inside a transaction with the Postgres session variable
 * `app.current_tenant` set to the given tenantId. RLS policies read this
 * variable, so every query inside the callback is automatically scoped to
 * the tenant. Uses set_config(..., true) so the setting is transaction-local.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  const db = getAppDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_tenant', ${tenantId}, true)`,
    );
    return fn(tx);
  });
}

/** Close all pools (used in tests / graceful shutdown). */
export async function closeDb(): Promise<void> {
  await Promise.all([appSql?.end(), adminSql?.end()]);
  appSql = adminSql = null;
  appDb = adminDb = null;
}

export { schema };
