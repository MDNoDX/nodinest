import "server-only";
import { createDb, type Database } from "./client";

export type { Database, Tx, AppContext } from "./client";
export { withUser } from "./client";

const globalForDb = globalThis as unknown as { __nodinestDb?: Database };

/**
 * Privileged connection (table owner). Use ONLY for: auth, rate limiting,
 * caches, settings, audit writes and admin operations already authorised
 * server-side. All user-scoped data access goes through `withUser`.
 */
// Production: Neon us-east-1, next to Netlify's functions (us-east-2), moved
// from Frankfurt on 2026-11-21; EU_DATABASE_URL is the old Frankfurt copy, used
// only when nothing else is set.
const url = process.env.DATABASE_URL || process.env.EU_DATABASE_URL;
export const db: Database = globalForDb.__nodinestDb ?? createDb(url!);
if (process.env.NODE_ENV !== "production") globalForDb.__nodinestDb = db;
