/**
 * Taqriz: the user's free-form write-up of a resource (private, one per
 * resource). Plain writing, optional chapters (headings) and lists — the
 * outline is derived from the headings. Documents are sanitised on every save.
 */
import { and, eq, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database } from "@/db/client";
import { resources, writeups, ownBooks } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  countWords,
  docToPlain,
  markdownToNodes,
  sanitizeDoc,
  type DocNode,
  type WriteupDoc,
  authorWordCount,
} from "@/lib/writeup-doc";

export async function getWriteup(database: Database, ctx: AppContext, resourceId: string) {
  return withUser(database, ctx, async (tx) => {
    const [w] = await tx
      .select({ doc: writeups.doc, updatedAt: writeups.updatedAt, words: writeups.words })
      .from(writeups)
      .where(and(eq(writeups.userId, ctx.userId), eq(writeups.resourceId, resourceId)));
    return w ? { doc: w.doc as WriteupDoc, updatedAt: w.updatedAt, words: w.words } : null;
  });
}

/**
 * Saves the whole document. `baseUpdatedAt` is the version the client
 * started from: if the stored one is newer (edited on another device) the
 * save is refused with CONFLICT unless `force` is set.
 */
export async function saveWriteup(
  database: Database,
  ctx: AppContext,
  resourceId: string,
  raw: unknown,
  opts: { baseUpdatedAt?: string | null; force?: boolean } = {},
) {
  const doc = sanitizeDoc(raw);
  const plain = docToPlain(doc);
  if (JSON.stringify(doc).length > 2_000_000) throw new AppError("VALIDATION", "too_large");
  return withUser(database, ctx, async (tx) => {
    const [r] = await tx
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.id, resourceId));
    if (!r) throw new AppError("NOT_FOUND");
    const [cur] = await tx
      .select({ updatedAt: writeups.updatedAt })
      .from(writeups)
      .where(and(eq(writeups.userId, ctx.userId), eq(writeups.resourceId, resourceId)))
      .for("update");
    if (
      cur &&
      !opts.force &&
      opts.baseUpdatedAt &&
      cur.updatedAt.getTime() > new Date(opts.baseUpdatedAt).getTime()
    )
      throw new AppError("CONFLICT", "edited_elsewhere");
    // Own books ("Kitob yozish") don't count their template's guiding prompts.
    const [own] = await tx
      .select({ id: ownBooks.resourceId })
      .from(ownBooks)
      .where(eq(ownBooks.resourceId, resourceId));
    const words = own ? authorWordCount(doc) : countWords(plain);
    const values = { doc, plain, words, updatedAt: new Date() };
    const [row] = await tx
      .insert(writeups)
      .values({ userId: ctx.userId, resourceId, ...values })
      .onConflictDoUpdate({ target: [writeups.userId, writeups.resourceId], set: values })
      .returning({ updatedAt: writeups.updatedAt, words: writeups.words });
    return { updatedAt: row.updatedAt.toISOString(), words: row.words };
  });
}

/**
 * AI / import helper: adds Markdown text at the end, or replaces the chapter
 * whose heading matches `chapter` (its text up to the next heading).
 */
export async function writeToWriteup(
  database: Database,
  ctx: AppContext,
  resourceId: string,
  input: { chapter?: string | null; markdown: string; mode: "append" | "replace_chapter" },
) {
  const cur = await getWriteup(database, ctx, resourceId);
  const content: DocNode[] = (cur?.doc.content ?? []).filter(
    (n, i, all) => !(all.length === 1 && n.type === "paragraph" && !n.content?.length),
  );
  const heading = (t: string): DocNode => ({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: t }],
  });
  const body = markdownToNodes(input.markdown);
  const norm = (s: string) => s.trim().toLowerCase();
  const title = input.chapter?.trim();
  const at = title
    ? content.findIndex(
        (n) =>
          n.type === "heading" &&
          norm((n.content ?? []).map((c) => c.text ?? "").join("")) === norm(title),
      )
    : -1;
  if (input.mode === "replace_chapter" && at >= 0) {
    let end = at + 1;
    while (end < content.length && content[end].type !== "heading") end++;
    content.splice(at + 1, end - at - 1, ...body);
  } else if (at >= 0) {
    let end = at + 1;
    while (end < content.length && content[end].type !== "heading") end++;
    content.splice(end, 0, ...body);
  } else {
    if (title) content.push(heading(title));
    content.push(...body);
  }
  return saveWriteup(database, ctx, resourceId, { type: "doc", content }, { force: true });
}

export async function deleteWriteup(database: Database, ctx: AppContext, resourceId: string) {
  await withUser(database, ctx, (tx) =>
    tx
      .delete(writeups)
      .where(and(eq(writeups.userId, ctx.userId), eq(writeups.resourceId, resourceId))),
  );
}

/** Write-ups the user has, newest first (for the notes hub / dashboard). */
export async function listMyWriteups(database: Database, ctx: AppContext, limit = 20) {
  return withUser(database, ctx, async (tx) =>
    (
      await tx.execute<{
        resource_id: string;
        title: string;
        type: string;
        words: number;
        updated_at: string;
        cover_url: string | null;
        cover_file_id: string | null;
      }>(sql`
        select w.resource_id, r.title, r.type::text, w.words, w.updated_at, r.cover_url, r.cover_file_id
        from nodinest.writeups w join nodinest.resources r on r.id = w.resource_id
        where w.user_id = ${ctx.userId} and w.words > 0
        order by w.updated_at desc limit ${limit}`)
    ).map((r) => ({ ...r })),
  );
}
