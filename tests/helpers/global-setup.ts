/**
 * Integration tests run against a real PostgreSQL database
 * (TEST_DATABASE_URL, default: local `nodinest_test`). The nodinest schemas
 * are dropped and all migrations re-applied before the run.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://mdnodx@127.0.0.1:5432/nodinest_test";

export default async function setup() {
  const sql = postgres(TEST_DB_URL, { max: 1, onnotice: () => {} });
  await sql`drop schema if exists nodinest cascade`;
  await sql`drop schema if exists nodinest_migrations cascade`;
  await migrate(drizzle(sql), {
    migrationsFolder: "./drizzle",
    migrationsSchema: "nodinest_migrations",
  });
  await sql.end();
}
