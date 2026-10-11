import type { Tx } from "@/db/client";
import { auditLogs } from "@/db/schema";

/** Strips large/sensitive fields before storing snapshots in the audit log. */
function compact(v: unknown): unknown {
  if (v == null) return null;
  const json = JSON.parse(JSON.stringify(v));
  if (json && typeof json === "object") {
    for (const k of ["search", "transcript", "biography", "tableOfContents"]) {
      if (k in json && typeof json[k] === "string" && json[k].length > 500) {
        json[k] = `${json[k].slice(0, 500)}…`;
      }
    }
  }
  return json;
}

export async function audit(
  tx: Tx,
  entry: {
    actorId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: compact(entry.before),
    after: compact(entry.after),
    meta: entry.meta ?? null,
  });
}
