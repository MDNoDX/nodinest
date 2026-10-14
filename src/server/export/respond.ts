import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/db";
import type { CurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "../rate-limit";
import { loadExport } from "./data";
import { renderDocx } from "./docx";
import { fileName, labels, type Loc } from "./labels";
import { renderPdf } from "./pdf";
import { renderText } from "./text";

export const FORMATS = ["pdf", "docx", "md", "txt"] as const;
export type Format = (typeof FORMATS)[number];
const MIME: Record<Format, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

/** Builds the requested file and returns it as a download. */
export async function exportResponse(
  user: CurrentUser,
  ctx: { userId: string; role: "user" | "superadmin" },
  opts: { resourceIds?: string[]; format: Format; includeNotes: boolean },
) {
  await enforceRateLimit(db, `export:${user.id}`, 40, 3600);
  const loc: Loc = user.locale === "en" ? "en" : "uz";
  const t = labels(loc);
  const combined = !opts.resourceIds;
  const items = await loadExport(ctx, {
    resourceIds: opts.resourceIds,
    includeNotes: opts.includeNotes,
    covers: opts.format === "pdf" || opts.format === "docx",
  });
  if (!items.length) throw new AppError("NOT_FOUND", "nothing_to_export");
  const common = { loc, timeZone: user.timezone, owner: user.name, combined };
  const body: Buffer | string =
    opts.format === "pdf"
      ? await renderPdf(items, common)
      : opts.format === "docx"
        ? await renderDocx(items, common)
        : renderText(items, { ...common, markdown: opts.format === "md" });
  const base = combined ? `${t.myWriteups} — ${user.name}` : `${t.writeup} — ${items[0].title}`;
  const name = fileName(base, opts.format);
  const ascii =
    name
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/"/g, "") || `nodinest.${opts.format}`;
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "content-type": MIME[opts.format],
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function parseFormat(v: string | null): Format {
  return (FORMATS as readonly string[]).includes(v ?? "") ? (v as Format) : "pdf";
}
