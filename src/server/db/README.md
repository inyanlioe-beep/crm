# Database & tenant isolation

Multi-tenant isolation is enforced at the database layer with PostgreSQL
Row-Level Security (RLS). Every tenant-scoped table carries a `tenant_id`
column and a `tenant_isolation` policy:

```sql
tenant_id = current_setting('app.current_tenant', true)::uuid
```

At request time the app connects as a **non-superuser** role (`app_user`,
`NOBYPASSRLS`) and runs queries through `withTenant(tenantId, fn)`, which opens
a transaction and sets `app.current_tenant` via `set_config(..., true)`
(transaction-local). RLS then filters every row automatically — even if
application code forgets a `WHERE tenant_id = ...` clause.

An **admin** connection (`DATABASE_ADMIN_URL`, a superuser or `BYPASSRLS` role)
is used only for migrations and tenant provisioning (registration), where no
tenant session exists yet.

## Files

- `schema.ts` — Drizzle schema for all tables + relations.
- `rls.sql` — enables + forces RLS and creates the isolation policy. Idempotent.
- `setup-role.sql` — creates the `app_user` role and grants. Run once as admin.
- `migrate.ts` — runs Drizzle migrations, then applies `rls.sql`.
- `seed.ts` — creates two demo tenants with sample data.
- `client.ts` — `withTenant()`, `getAppDb()`, `getAdminDb()`, `closeDb()`.

## Local setup

```bash
# 1. Start Postgres (example with Docker)
docker run --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=crm \
  -p 5432:5432 postgres:16-alpine

# 2. Point env at the admin (superuser) connection for migrations
export DATABASE_ADMIN_URL="postgres://postgres:postgres@localhost:5432/crm"

# 3. Create schema + RLS
npm run db:migrate

# 4. Create the app_user role (as superuser)
psql "$DATABASE_ADMIN_URL" -f src/server/db/setup-role.sql

# 5. App connection (RLS enforced)
export DATABASE_URL="postgres://app_user:password@localhost:5432/crm"
npm run db:seed
```

## Running the isolation integration test

The test in `tenant-isolation.test.ts` is skipped unless `TEST_DATABASE_URL`
points at a database reached via the **non-superuser** `app_user` role:

```bash
export TEST_DATABASE_URL="postgres://app_user:password@localhost:5432/crm"
export TEST_ADMIN_DATABASE_URL="postgres://postgres:postgres@localhost:5432/crm"
npm test
```

It proves: (1) a tenant sees only its own rows, (2) one tenant cannot read
another's rows, and (3) inserting a row for a different tenant is rejected by
the policy's `WITH CHECK`.
