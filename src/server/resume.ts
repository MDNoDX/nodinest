/**
 * "Continue where I stopped": the second of the video / audio and the place in
 * the taqriz, per resource, saved to the account (owner-only, RLS).
 */
import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { withUser, type AppContext, type Database } from "@/db/client";
import { resources, resumePoints } from "@/db/schema";

const dockSource = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("youtube"),
    id: z.string().regex(/^[\w-]{11}$/),
    title: z.string().max(300),
    resourceId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("file"),
    // Our own files, or a public https media link.
    src: z
      .string()
      .max(2000)
      .refine((v) => /^\/api\/files\/[0-9a-f-]{36}$/i.test(v) || /^https:\/\//.test(v)),
    video: z.boolean(),
    title: z.string().max(300),
    resourceId: z.string().uuid(),
  }),
]);
export type SavedSource = z.infer<typeof dockSource>;

export const resumeInput = z.object({
  resourceId: z.string().uuid(),
  place: z.enum(["taqriz", "resource"]).optional(),
  media: z.object({ source: dockSource, seconds: z.number().min(0).max(86_400) }).optional(),
  doc: z
    .object({ pos: z.number().int().min(0).max(10_000_000), anchor: z.string().max(200) })
    .optional(),
});

export async function saveResume(database: Database, ctx: AppContext, raw: unknown) {
  const a = resumeInput.parse(raw);
  const set: Partial<typeof resumePoints.$inferInsert> = { updatedAt: new Date() };
  if (a.place) set.place = a.place;
  if (a.media) {
    set.media = a.media.source;
    set.mediaSeconds = Math.floor(a.media.seconds);
  }
  if (a.doc) {
    set.docPos = a.doc.pos;
    set.docAnchor = a.doc.anchor;
  }
  await withUser(database, ctx, (tx) =>
    tx
      .insert(resumePoints)
      .values({ userId: ctx.userId, resourceId: a.resourceId, place: a.place ?? "taqriz", ...set })
      .onConflictDoUpdate({ target: [resumePoints.userId, resumePoints.resourceId], set }),
  );
}

export async function getResume(database: Database, ctx: AppContext, resourceId: string) {
  const [r] = await withUser(database, ctx, (tx) =>
    tx
      .select()
      .from(resumePoints)
      .where(and(eq(resumePoints.userId, ctx.userId), eq(resumePoints.resourceId, resourceId))),
  );
  if (!r) return null;
  const media = dockSource.safeParse(r.media);
  return {
    media: media.success ? media.data : null,
    mediaSeconds: r.mediaSeconds,
    docPos: r.docPos,
    docAnchor: r.docAnchor,
    place: r.place,
    updatedAt: r.updatedAt,
  };
}

/** The most recent place (last 30 days) — opened after signing in. */
export async function lastResume(database: Database, ctx: AppContext) {
  const [r] = await withUser(database, ctx, (tx) =>
    tx
      .select({
        resourceId: resumePoints.resourceId,
        place: resumePoints.place,
        title: resources.title,
        mediaSeconds: resumePoints.mediaSeconds,
        updatedAt: resumePoints.updatedAt,
      })
      .from(resumePoints)
      .innerJoin(resources, eq(resources.id, resumePoints.resourceId))
      .where(
        and(
          eq(resumePoints.userId, ctx.userId),
          isNull(resources.deletedAt),
          sql`${resumePoints.updatedAt} > now() - interval '30 days'`,
        ),
      )
      .orderBy(desc(resumePoints.updatedAt))
      .limit(1),
  );
  return r ?? null;
}
