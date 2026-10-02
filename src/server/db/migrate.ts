import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url =
    process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL / DATABASE_ADMIN_URL not set");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  console.log("Running schema migrations...");
  await migrate(db, { migrationsFolder: join(__dirname, "../../../drizzle") });

  console.log("Applying RLS policies...");
  const rls = readFileSync(join(__dirname, "rls.sql"), "utf8");
  await sql.unsafe(rls);

  console.log("Migrations + RLS applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
