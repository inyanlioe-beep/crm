import { defineConfig } from "drizzle-kit";

const url =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/crm";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
