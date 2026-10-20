/**
 * Collects everything an export needs: the user's taqriz documents with the
 * book's facts, the user's own record (status, rating, dates, short opinion)
 * and — optionally — their notes and quotes. Everything is read with the
 * user's RLS context; covers are fetched safely and normalised to JPEG.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";
import { safeFetch } from "@/lib/net/safe-fetch";
import { docMedia, sanitizeDoc, type WriteupDoc } from "@/lib/writeup-doc";
import { readFileBytes } from "../storage";

export type ExportNote = {
  kind: "note" | "quote";
  title: string | null;
  body: string | null;
  quoteText: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  location: string | null;
};

export type ExportItem = {
  resourceId: string;
  type: string;
  title: string;
  originalTitle: string | null;
  authors: string | null;
  publisher: string | null;
  originalDate: string | null;
  publicationDate: string | null;
  pageCount: number | null;
  durationSeconds: number | null;
  where: string | null;
  status: string | null;
  rating: number | null;
  startedAt: Date | null;
  startedPrecision: string | null;
  completedAt: Date | null;
  completedPrecision: string | null;
  opinion: string | null;
  doc: WriteupDoc | null;
  words: number;
  updatedAt: Date | null;
  notes: ExportNote[];
  cover: Uint8Array | null;
  /** JPEGs of images embedded in the taqriz, by file id. */
  images: Record<string, Uint8Array>;
  /** What the document is ("Transcript", "Konspekt"); default: taqriz. */
  docLabel?: string;
};

type Row = {
  resource_id: string;
  type: string;
  title: string;
  original_title: string | null;
  authors: string | null;
  publisher: string | null;
  original_date: string | null;
  publication_date: string | null;
  page_count: number | null;
  duration_seconds: number | null;
  channel: string | null;
  cover_url: string | null;
  cover_file_id: string | null;
  status: string | null;
  rating: number | null;
  started_at: Date | null;
  started_precision: string | null;
  completed_at: Date | null;
  completed_precision: string | null;
  review: string | null;
  doc: unknown;
  words: number | null;
  updated_at: Date | null;
};

/** JPEG ≤ 900 px, or null (react-pdf / Word only take JPEG/PNG). */
async function toJpeg(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 900, height: 1350, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

async function loadCover(ctx: AppContext, r: Row): Promise<Uint8Array | null> {
  try {
    if (r.cover_file_id) {
      const f = await readFileBytes(ctx, r.cover_file_id);
      return f ? toJpeg(f.bytes) : null;
    }
    if (r.cover_url) {
      const res = await safeFetch(r.cover_url, {
        binary: true,
        maxBytes: 8_000_000,
        timeoutMs: 8000,
        accept: "image/*",
        allowTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
      });
      return res.bytes ? toJpeg(res.bytes) : null;
    }
  } catch {
    /* a missing cover never fails the export */
  }
  return null;
}

/**
 * `resourceIds` = specific books (in that order); omitted = every book the
 * user has written a taqriz for (newest first).
 */
export async function loadExport(
  ctx: AppContext,
  opts: { resourceIds?: string[]; includeNotes?: boolean; covers?: boolean },
): Promise<ExportItem[]> {
  const ids = opts.resourceIds;
  const rows = await withUser(db, ctx, async (tx) =>
    tx.execute<Row>(sql`
      select r.id as resource_id, r.type::text, r.title, r.original_title,
        (select string_agg(p.full_name, ', ' order by c.position)
           from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
          where c.resource_id = r.id) as authors,
        pub.name as publisher, r.original_date, r.publication_date, b.page_count,
        m.duration_seconds, m.channel, r.cover_url, r.cover_file_id,
        lr.status::text as status, lr.rating, lr.started_at, lr.completed_at, lr.started_precision,
        lr.completed_precision, lr.review,
        w.doc, w.words, w.updated_at
      from nodinest.resources r
      left join nodinest.writeups w on w.resource_id = r.id and w.user_id = ${ctx.userId}
      left join nodinest.learning_records lr on lr.resource_id = r.id and lr.user_id = ${ctx.userId}
      left join nodinest.book_details b on b.resource_id = r.id
      left join nodinest.publishers pub on pub.id = b.publisher_id
      left join nodinest.media_details m on m.resource_id = r.id
      where ${
        ids?.length
          ? sql`r.id in (${sql.join(
              ids.map((i) => sql`${i}::uuid`),
              sql`, `,
            )})`
          : sql`w.id is not null and w.words > 0`
      }
      order by w.updated_at desc nulls last
      limit 300`),
  );
  const ordered = ids?.length
    ? ids.map((i) => rows.find((r) => r.resource_id === i)).filter((r): r is Row => !!r)
    : [...rows];

  const notesBy = new Map<string, ExportNote[]>();
  if (opts.includeNotes && ordered.length) {
    const notes = await withUser(db, ctx, (tx) =>
      tx.execute<
        ExportNote & {
          resource_id: string;
          quote_text: string | null;
          page_from: number | null;
          page_to: number | null;
        }
      >(sql`
        select n.resource_id, n.kind::text as kind, n.title, n.body, n.quote_text, n.page_from, n.page_to, n.location
        from nodinest.notes n
        where n.user_id = ${ctx.userId} and n.deleted_at is null
          and n.resource_id in (${sql.join(
            ordered.map((r) => sql`${r.resource_id}::uuid`),
            sql`, `,
          )})
        order by n.page_from asc nulls last, n.created_at asc`),
    );
    for (const n of notes) {
      const list = notesBy.get(n.resource_id) ?? [];
      list.push({
        kind: n.kind,
        title: n.title,
        body: n.body,
        quoteText: n.quote_text,
        pageFrom: n.page_from,
        pageTo: n.page_to,
        location: n.location,
      });
      notesBy.set(n.resource_id, list);
    }
  }

  const covers =
    opts.covers === false
      ? ordered.map(() => null)
      : await Promise.all(ordered.map((r) => loadCover(ctx, r)));

  const docs = ordered.map((r) => (r.doc ? sanitizeDoc(r.doc) : null));
  const images: Record<string, Uint8Array>[] = await Promise.all(
    docs.map(async (d) => {
      if (!d || opts.covers === false) return {};
      const out: Record<string, Uint8Array> = {};
      for (const m of docMedia(d)
        .filter((x) => x.type === "image")
        .slice(0, 30)) {
        const f = await readFileBytes(ctx, m.fileId).catch(() => null);
        const jpg = f ? await toJpeg(f.bytes) : null;
        if (jpg) out[m.fileId] = jpg;
      }
      return out;
    }),
  );

  return ordered.map((r, i) => ({
    resourceId: r.resource_id,
    type: r.type,
    title: r.title,
    originalTitle: r.original_title,
    authors: r.authors,
    publisher: r.publisher,
    originalDate: r.original_date,
    publicationDate: r.publication_date,
    pageCount: r.page_count,
    durationSeconds: r.duration_seconds,
    where: r.channel,
    status: r.status === "abandoned" || r.status === "paused" ? "in_progress" : r.status,
    rating: r.rating,
    startedAt: r.started_at ? new Date(r.started_at) : null,
    completedAt: r.completed_at ? new Date(r.completed_at) : null,
    startedPrecision: r.started_precision,
    completedPrecision: r.completed_precision,
    opinion: r.review,
    doc: docs[i],
    words: r.words ?? 0,
    updatedAt: r.updated_at ? new Date(r.updated_at) : null,
    notes: notesBy.get(r.resource_id) ?? [],
    cover: covers[i],
    images: images[i],
  }));
}
