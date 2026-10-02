# CRM SaaS (Multi-tenant)

A multi-tenant B2B CRM built with Next.js. Each workspace (tenant) is isolated
at the database layer with PostgreSQL Row-Level Security. Includes contacts &
companies, a drag-and-drop sales pipeline, activities & tasks, transactional
email with timeline logging, dashboards, team management with RBAC, and
subscription billing.

See [CHANGE_LOG.MD](./CHANGE_LOG.MD) for a per-feature build history.

## Stack

- **Next.js 15** (App Router, Server Actions) + **TypeScript**
- **Tailwind CSS** + shadcn-style UI components
- **PostgreSQL** + **Drizzle ORM**, isolation via **Row-Level Security**
- **argon2** password hashing, self-hosted session auth
- **Resend** transactional email (HTTP API; console fallback in dev)
- **Stripe** billing (HTTP API; manual/demo fallback without keys)
- **@dnd-kit** kanban, **Recharts** dashboards
- **Vitest** (unit + integration) and **Playwright** (E2E)

## Architecture

Every tenant-scoped table carries a `tenant_id` and a `tenant_isolation` RLS
policy. At request time the app connects as a non-superuser role (`app_user`,
`NOBYPASSRLS`) and runs queries through `withTenant(tenantId, fn)`, which sets
`app.current_tenant` for the transaction. An admin connection
(`DATABASE_ADMIN_URL`) is used only for migrations and tenant provisioning.

See [src/server/db/README.md](./src/server/db/README.md) for isolation details.

## Prerequisites

- Node.js 20+ (built on 22/24)
- PostgreSQL 14+

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    Set DATABASE_URL (app_user), DATABASE_ADMIN_URL (superuser), SESSION_SECRET.

# 3. Create schema + RLS policies (uses DATABASE_ADMIN_URL)
npm run db:migrate

# 4. Create the RLS-enforced app role (run once as a superuser)
psql "$DATABASE_ADMIN_URL" -f src/server/db/setup-role.sql

# 5. (optional) Seed two demo tenants
npm run db:seed

# 6. Start the dev server
npm run dev
```

Open http://localhost:3000 and create a workspace at `/register`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | App connection (RLS-enforced `app_user`) |
| `DATABASE_ADMIN_URL` | yes* | Migrations + tenant provisioning (superuser). Defaults to `DATABASE_URL` |
| `SESSION_SECRET` | yes | Signs/derives session material (min 32 chars) |
| `APP_URL` | no | Absolute app URL for links/webhooks |
| `RESEND_API_KEY` / `EMAIL_FROM` | no | Transactional email (console fallback when unset) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO` | no | Billing (manual/demo mode when unset) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | no | Distributed rate limiting (in-memory fallback) |

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint (Next.js config) |
| `npm test` | Vitest unit + integration |
| `npm run e2e` | Playwright E2E (`e2e/`) |
| `npm run db:generate` | Generate Drizzle migrations from schema |
| `npm run db:migrate` | Apply migrations + RLS |
| `npm run db:seed` | Seed demo tenants |

## Testing

Unit tests run without a database. Integration tests (tenant isolation,
services) are **skipped** unless `TEST_DATABASE_URL` points at Postgres reached
via the non-superuser `app_user` role:

```bash
npm run db:migrate
psql "$DATABASE_ADMIN_URL" -f src/server/db/setup-role.sql
TEST_DATABASE_URL=postgres://app_user:password@localhost:5432/crm \
TEST_ADMIN_DATABASE_URL=postgres://postgres:postgres@localhost:5432/crm \
npm test
```

Playwright smoke tests (landing page, auth redirect) need no DB:

```bash
npm run e2e:install   # one-time: download the Chromium browser
npm run e2e
```

CI runs typecheck, lint, unit tests, and build on every push/PR, plus a
separate job that spins up Postgres and runs the integration tests against the
RLS-enforced role. See [.github/workflows/ci.yml](./.github/workflows/ci.yml).

## Deployment

- **App:** Vercel (or any Node host). Set all required env vars.
- **Database:** a managed Postgres with RLS (Neon, Supabase, RDS). Run
  `db:migrate` on deploy and create the `app_user` role once.
- **Billing:** add Stripe keys and point the Stripe webhook at
  `/api/billing/webhook` (events: `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`). Without keys the app runs billing in demo mode.
- **Email:** add a `RESEND_API_KEY` and verified `EMAIL_FROM`.
- **Rate limiting:** add Upstash Redis for multi-instance deployments.

## Security

- Tenant isolation enforced in the database via RLS (not just app code).
- Passwords hashed with argon2id; sessions stored as hashes (opaque tokens).
- Rate limiting on login/registration; audit log for sensitive actions.
- Security headers (X-Frame-Options, nosniff, Referrer-Policy, HSTS, etc.).
- Server Actions use Next.js same-origin CSRF protection.
