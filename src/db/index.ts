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
/** The Frankfurt database (next to the fra1 functions) when configured, else the original. */
const url = process.env.EU_DATABASE_URL || process.env.DATABASE_URL;
export const db: Database = globalForDb.__nodinestDb ?? createDb(url!);
if (process.env.NODE_ENV !== "production") globalForDb.__nodinestDb = db;
