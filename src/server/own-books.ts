/**
 * "Kitob yozish": the user's own books. A book is a resource (type book,
 * created by the user) whose text is the user's write-up document — so the
 * full editor (chapters, find, AI writing and interview, voice and video to
 * text, PDF / Word export) works for it. Own books stay out of the Darsxona.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { ownBooks, resources, writeups } from "@/db/schema";
import { BOOK_TEMPLATES, templateDoc } from "@/lib/book-templates";
import { AppError } from "@/lib/errors";
import { docToPlain, sanitizeDoc } from "@/lib/writeup-doc";
import { applyCreateResource, parseResource } from "./catalog";

export const ownBookInput = z.object({
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(1000).nullish(),
  template: z.enum(BOOK_TEMPLATES).default("blank"),
  goalWords: z.number().int().min(100).max(2_000_000).nullish(),
  locale: z.enum(["uz", "en"]).default("uz"),
});

export async function createOwnBook(ctx: AppContext, raw: unknown) {
  const a = ownBookInput.parse(raw);
  return withUser(db, ctx, async (tx) => {
    const id = await applyCreateResource(
      tx,
      ctx,
      parseResource({ type: "book", title: a.title, description: a.subtitle ?? null }),
      { origin: "manual" },
    );
    await tx.insert(ownBooks).values({
      resourceId: id,
      userId: ctx.userId,
      template: a.template,
      goalWords: a.goalWords ?? null,
    });
    const doc = sanitizeDoc(templateDoc(a.template, a.locale));
    const plain = docToPlain(doc);
    await tx.insert(writeups).values({
      userId: ctx.userId,
      resourceId: id,
      doc,
      plain,
      // Guiding prompts are not the author's words yet.
      words: 0,
    });
    return id;
  });
}

export type OwnBook = {
  id: string;
  title: string;
  subtitle: string | null;
  template: string;
  goalWords: number | null;
  words: number;
  chapters: number;
  updatedAt: Date;
};

export async function listOwnBooks(ctx: AppContext): Promise<OwnBook[]> {
  const rows = await withUser(db, ctx, (tx) =>
    tx.execute<{
      id: string;
      title: string;
      subtitle: string | null;
      template: string;
      goal_words: number | null;
      words: number | null;
      chapters: number | null;
      updated_at: Date;
    }>(sql`
      select r.id, r.title, r.description as subtitle, o.template, o.goal_words,
        w.words,
        (select count(*)::int from jsonb_array_elements(coalesce(w.doc->'content', '[]'::jsonb)) n
          where n->>'type' = 'heading') as chapters,
        greatest(o.updated_at, coalesce(w.updated_at, o.updated_at)) as updated_at
      from nodinest.own_books o
      join nodinest.resources r on r.id = o.resource_id and r.deleted_at is null
      left join nodinest.writeups w on w.resource_id = r.id and w.user_id = ${ctx.userId}
      where o.user_id = ${ctx.userId}
      order by updated_at desc`),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    template: r.template,
    goalWords: r.goal_words,
    words: r.words ?? 0,
    chapters: r.chapters ?? 0,
    updatedAt: new Date(r.updated_at),
  }));
}

export async function getOwnBook(ctx: AppContext, id: string) {
  const [row] = await withUser(db, ctx, (tx) =>
    tx
      .select({ template: ownBooks.template, goalWords: ownBooks.goalWords })
      .from(ownBooks)
      .where(and(eq(ownBooks.resourceId, id), eq(ownBooks.userId, ctx.userId))),
  );
  return row ?? null;
}

export async function setOwnBookGoal(ctx: AppContext, id: string, goal: number | null) {
  const g = z.number().int().min(100).max(2_000_000).nullable().parse(goal);
  await withUser(db, ctx, (tx) =>
    tx
      .update(ownBooks)
      .set({ goalWords: g, updatedAt: new Date() })
      .where(and(eq(ownBooks.resourceId, id), eq(ownBooks.userId, ctx.userId))),
  );
}

export async function deleteOwnBook(ctx: AppContext, id: string) {
  const book = await getOwnBook(ctx, id);
  if (!book) throw new AppError("NOT_FOUND");
  await withUser(db, ctx, (tx) =>
    tx
      .update(resources)
      .set({ deletedAt: new Date() })
      .where(and(eq(resources.id, id), eq(resources.createdBy, ctx.userId))),
  );
}
