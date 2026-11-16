import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";
import {
  bookPages,
  bookTextSources,
  collections,
  learningRecords,
  notes,
  resources,
  writeups,
} from "@/db/schema";

export type OfflinePageRef = {
  url: string;
  /** "section" pages carry a nav key, the rest their own title. */
  group: "section" | "item" | "read" | "taqriz" | "collection" | "note";
  title: string;
};

export type OfflineManifest = {
  pages: OfflinePageRef[];
  /** Books whose whole text is kept on the device (the reader reads it offline). */
  books: { id: string; title: string; pages: number[] }[];
};

/** Sections, each with its nav key (the device shows them in its own language). */
const SECTIONS: [string, string][] = [
  ["/", "dashboard"],
  ["/plans", "plans"],
  ["/library", "library"],
  ["/notes", "notes"],
  ["/collections", "collections"],
  ["/write", "write"],
  ["/review", "review"],
  ["/stats", "stats"],
  ["/media", "media"],
  ["/chats", "chats"],
  ["/settings", "settings"],
  ["/guide", "guide"],
];

/**
 * What the device keeps for use without the internet (components/pwa/offline-sync):
 * the sections, the items the person touched lately with their reading and
 * taqriz pages, collections and notes, and the full text of the books in progress.
 */
export async function offlineManifest(
  ctx: AppContext,
  username: string | null,
): Promise<OfflineManifest> {
  return withUser(db, ctx, async (tx) => {
    const [items, texts, cols, myNotes, myWriteups] = await Promise.all([
      tx
        .select({ id: resources.id, title: resources.title, status: learningRecords.status })
        .from(learningRecords)
        .innerJoin(resources, eq(resources.id, learningRecords.resourceId))
        .where(and(eq(learningRecords.userId, ctx.userId), isNull(resources.deletedAt)))
        .orderBy(desc(learningRecords.updatedAt))
        .limit(80),
      tx
        .select({ resourceId: bookTextSources.resourceId })
        .from(bookTextSources)
        .where(and(eq(bookTextSources.userId, ctx.userId), eq(bookTextSources.status, "ready"))),
      tx
        .select({ id: collections.id, name: collections.name })
        .from(collections)
        .where(eq(collections.userId, ctx.userId))
        .orderBy(desc(collections.updatedAt))
        .limit(30),
      tx
        .select({ id: notes.id, title: notes.title })
        .from(notes)
        .where(and(eq(notes.userId, ctx.userId), isNull(notes.deletedAt)))
        .orderBy(desc(notes.updatedAt))
        .limit(40),
      tx
        .select({ resourceId: writeups.resourceId })
        .from(writeups)
        .where(eq(writeups.userId, ctx.userId))
        .orderBy(desc(writeups.updatedAt))
        .limit(20),
    ]);
    const hasText = new Set(texts.map((t) => t.resourceId));
    const title = new Map(items.map((i) => [i.id, i.title]));
    const pages: OfflinePageRef[] = SECTIONS.map(([url, key]) => ({
      url,
      group: "section",
      title: key,
    }));
    if (username) pages.push({ url: `/u/${username}`, group: "section", title: "profile" });
    for (const i of items) pages.push({ url: `/library/${i.id}`, group: "item", title: i.title });
    const reading = items.filter((i) => hasText.has(i.id)).slice(0, 25);
    for (const i of reading)
      pages.push({ url: `/library/${i.id}/read`, group: "read", title: i.title });
    for (const w of myWriteups)
      pages.push({
        url: `/library/${w.resourceId}/taqriz`,
        group: "taqriz",
        title: title.get(w.resourceId) ?? "",
      });
    for (const c of cols)
      pages.push({ url: `/collections/${c.id}`, group: "collection", title: c.name ?? "" });
    for (const n of myNotes)
      pages.push({ url: `/notes/${n.id}`, group: "note", title: n.title ?? "" });

    // The whole text of the books being read now (and a few more read lately).
    const keep = [
      ...items.filter((i) => hasText.has(i.id) && i.status === "in_progress"),
      ...items.filter((i) => hasText.has(i.id) && i.status !== "in_progress"),
    ].slice(0, 8);
    const pageRows = keep.length
      ? await tx
          .select({
            resourceId: bookPages.resourceId,
            pages: sql<number[]>`array_agg(distinct ${bookPages.page} order by ${bookPages.page})`,
          })
          .from(bookPages)
          .where(
            and(
              eq(bookPages.userId, ctx.userId),
              inArray(
                bookPages.resourceId,
                keep.map((k) => k.id),
              ),
            ),
          )
          .groupBy(bookPages.resourceId)
      : [];
    const pagesOf = new Map(pageRows.map((r) => [r.resourceId, r.pages]));
    const books = keep
      .map((k) => ({ id: k.id, title: k.title, pages: pagesOf.get(k.id) ?? [] }))
      .filter((b) => b.pages.length);
    return { pages, books };
  });
}
