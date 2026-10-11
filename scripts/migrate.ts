/**
 * Applies SQL migrations in ./drizzle. Usage:
 *   npm run db:migrate                 (uses .env.local)
 *   DOTENV_PATH=.env.test npm run db:migrate
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), {
    migrationsFolder: "./drizzle",
    migrationsSchema: "nodinest_migrations",
  });
  await client.end();
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
