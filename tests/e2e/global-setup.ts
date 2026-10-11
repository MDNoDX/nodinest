import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";

export default async function setup() {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  await sql`drop schema if exists nodinest cascade`;
  await sql`drop schema if exists nodinest_migrations cascade`;
  await migrate(drizzle(sql), {
    migrationsFolder: "./drizzle",
    migrationsSchema: "nodinest_migrations",
  });
  await sql`insert into nodinest.categories (slug, name_uz, name_en) values ('literature', 'Adabiyot', 'Literature')`;
  await sql.end();
}
