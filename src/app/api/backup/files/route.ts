import type { NextRequest } from "next/server";
import { BACKUP_RANGE, backupAllowed, backupList } from "@/server/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The backup job's list of every stored file (CRON_SECRET only). */
export async function GET(req: NextRequest) {
  if (!backupAllowed(req.headers.get("authorization")))
    return new Response("forbidden", { status: 403 });
  return Response.json(
    { range: BACKUP_RANGE, files: await backupList() },
    { headers: { "cache-control": "no-store" } },
  );
}
