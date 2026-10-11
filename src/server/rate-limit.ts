/**
 * Fixed-window rate limiter backed by PostgreSQL (no Redis needed on the
 * free tier). One atomic upsert per check.
 */
import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { AppError } from "@/lib/errors";

export async function hitRateLimit(
  database: Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number; resetAt: Date }> {
  const rows = await database.execute<{ count: number; window_start: Date }>(sql`
    insert into nodinest.rate_limits (key, window_start, count)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    on conflict (key, window_start) do update set count = nodinest.rate_limits.count + 1
    returning count, window_start
  `);
  const row = rows[0];
  const resetAt = new Date(new Date(row.window_start).getTime() + windowSeconds * 1000);
  return { allowed: row.count <= limit, count: row.count, resetAt };
}

export async function enforceRateLimit(
  database: Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const r = await hitRateLimit(database, key, limit, windowSeconds);
  if (!r.allowed)
    throw new AppError("RATE_LIMITED", undefined, { resetAt: r.resetAt.toISOString() });
}

/** Opportunistic cleanup of expired windows (called occasionally). */
export async function pruneRateLimits(database: Database): Promise<void> {
  await database.execute(
    sql`delete from nodinest.rate_limits where window_start < now() - interval '2 days'`,
  );
}
