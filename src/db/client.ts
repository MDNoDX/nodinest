/**
 * Database client factory, shared by the app (src/db/index.ts), scripts and
 * integration tests. Kept free of "server-only" so tests can import it.
 */
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The authenticated actor every user-scoped operation runs as. */
export type AppContext = {
  userId: string;
  /** Effective role (superadmin only while admin mode is on). */
  role: "user" | "superadmin";
  /** The account is a superadmin (used for unlimited AI). */
  superadminAccount?: boolean;
  /** Admin parts given by the superadmin (lib/admin-perms.ts). */
  perms?: readonly string[];
};

export function createDb(url: string, opts: { max?: number } = {}): Database {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, {
    max: opts.max ?? (process.env.NODE_ENV === "production" ? 5 : 10),
    // Required for Supabase/PgBouncer transaction pooling.
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return drizzle(client, { schema, casing: "snake_case" }) as Database;
}

const RLS_ROLE_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Runs `fn` in a transaction as the given user with row-level security
 * active: sets app.user_id / app.role and switches to the unprivileged
 * DB_RLS_ROLE (default "nodinest_app") for the duration of the transaction.
 * Application code must STILL filter by owner — RLS is defence in depth.
 */
export async function withUser<T>(
  database: Database,
  ctx: AppContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const role = process.env.DB_RLS_ROLE ?? "nodinest_app";
  if (role && !RLS_ROLE_RE.test(role)) throw new Error("Invalid DB_RLS_ROLE");
  return database.transaction(async (tx) => {
    if (role) {
      await tx.execute(
        sql`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.role', ${ctx.role}, true), set_config('role', ${role}, true)`,
      );
    } else {
      await tx.execute(
        sql`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.role', ${ctx.role}, true)`,
      );
    }
    return fn(tx);
  });
}
