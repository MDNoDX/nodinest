/**
 * Server-side role management for operators with database access.
 *   npm run admin:grant -- someone@example.com            (grant superadmin)
 *   npm run admin:grant -- someone@example.com --revoke   (back to user)
 * The user must have signed in at least once. Writes an audit entry.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  if (!email || !email.includes("@"))
    throw new Error("Usage: npm run admin:grant -- <email> [--revoke]");
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {},
  });
  const role = revoke ? "user" : "superadmin";
  const rows =
    await sql`update nodinest."user" set role = ${role}, updated_at = now() where lower(email) = ${email} returning id`;
  if (rows.length === 0) {
    await sql.end();
    throw new Error(`No user with email ${email}. Sign in once first.`);
  }
  await sql`insert into nodinest.audit_logs (actor_id, action, entity_type, entity_id, after, meta)
    values (null, 'role.cli_set', 'user', ${rows[0].id}, ${sql.json({ role })}, ${sql.json({ via: "scripts/grant-admin.ts" })})`;
  await sql.end();
  console.log(`✓ ${email} is now ${role}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
