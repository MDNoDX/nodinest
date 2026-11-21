import type { NextRequest } from "next/server";
import { z } from "zod";
import { BACKUP_RANGE, backupAllowed, backupRange } from "@/server/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const q = z.object({ id: z.string().uuid(), start: z.coerce.number().int().min(0) });

/** One piece (≤ 4 MB) of a stored file for the backup job: ?id=…&start=… (CRON_SECRET only). */
export async function GET(req: NextRequest) {
  if (!backupAllowed(req.headers.get("authorization")))
    return new Response("forbidden", { status: 403 });
  const p = q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!p.success) return new Response("bad request", { status: 400 });
  const r = await backupRange(p.data.id, p.data.start, p.data.start + BACKUP_RANGE - 1);
  if (!r) return new Response("not found", { status: 404 });
  return new Response(r.stream, {
    headers: {
      "content-type": "application/octet-stream",
      "content-range": `bytes ${r.start}-${r.end}/${r.size}`,
      "cache-control": "no-store",
    },
  });
}
