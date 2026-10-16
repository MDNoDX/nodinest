"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addRelation } from "@/server/catalog";
import { submitArchive, submitPerson, submitResource } from "@/server/suggestions";
import { withUser } from "@/db";
import { lookupBooks } from "@/server/lookup";
import { mergeResources } from "@/server/merge";
import { savePublisher } from "@/server/publishers";
import { removeLearningRecord } from "@/server/records";
import { importUrlMetadata } from "@/server/url-import";
import { run } from "./_run";

const idSchema = z.string().uuid();

export async function savePersonAction(
  input: unknown,
  opts: { id?: string | null; allowDuplicate?: boolean; explanation?: string | null } = {},
) {
  return run(async ({ ctx, db }) => {
    const id = opts.id ? idSchema.parse(opts.id) : null;
    const out = await submitPerson(db, ctx, input, {
      id,
      allowDuplicate: !!opts.allowDuplicate,
      explanation: opts.explanation,
    });
    revalidatePath("/people");
    if (out.mode === "applied") revalidatePath(`/people/${out.id}`);
    return out;
  });
}

export async function saveResourceAction(
  input: unknown,
  opts: { id?: string | null; allowDuplicate?: boolean; explanation?: string | null } = {},
) {
  return run(async ({ ctx, db }) => {
    const id = opts.id ? idSchema.parse(opts.id) : null;
    const out = await submitResource(db, ctx, input, {
      id,
      allowDuplicate: !!opts.allowDuplicate,
      explanation: opts.explanation,
    });
    revalidatePath("/library");
    if (out.mode === "applied") revalidatePath(`/library/${out.id}`);
    return out;
  });
}

export async function archiveCatalogAction(
  type: "person" | "resource",
  id: string,
  archived: boolean,
) {
  return run(async ({ ctx, db }) => {
    const out = await submitArchive(
      db,
      ctx,
      z.enum(["person", "resource"]).parse(type),
      idSchema.parse(id),
      archived,
    );
    revalidatePath(type === "person" ? "/people" : "/library");
    return out;
  });
}

export async function relateResourcesAction(
  fromId: string,
  toId: string,
  kind: "edition_of" | "translation_of" | "part_of" | "related",
) {
  return run(async ({ ctx, db }) => {
    await withUser(db, ctx, (tx) =>
      addRelation(
        tx,
        ctx,
        idSchema.parse(fromId),
        idSchema.parse(toId),
        z.enum(["edition_of", "translation_of", "part_of", "related"]).parse(kind),
      ),
    );
    revalidatePath(`/library/${fromId}`);
  });
}

export async function importUrlAction(url: string) {
  return run(async ({ ctx }) => {
    const m = await importUrlMetadata(z.string().max(2048).parse(url), ctx.userId, {
      unlimited: !!ctx.superadminAccount,
    });
    // Never return the full page text to the client form.
    const { text: _text, ...rest } = m;
    void _text;
    return rest;
  });
}

/** Book metadata + covers from Google Books / Open Library (add form). */
export async function lookupBooksAction(query: string) {
  return run(async () => lookupBooks(z.string().trim().min(1).max(300).parse(query), { limit: 6 }));
}

export async function savePublisherAction(input: unknown, publisherId?: string | null) {
  return run(async ({ ctx, db }) => {
    const pid = await savePublisher(
      db,
      ctx,
      input,
      z.string().uuid().nullish().parse(publisherId) ?? undefined,
    );
    revalidatePath("/publishers", "layout");
    return pid;
  });
}

/** Merge duplicates into `keepId` (the user's data moves; duplicates are archived). */
export async function mergeResourcesAction(keepId: string, removeIds: string[]) {
  return run(async ({ ctx }) => {
    const out = await mergeResources(
      ctx,
      z.string().uuid().parse(keepId),
      z.array(z.string().uuid()).min(1).max(10).parse(removeIds),
    );
    revalidatePath("/", "layout");
    return out;
  });
}

/** Delete an entry: leaves the user's library; archived too when the user created it. */
export async function deleteResourceAction(resourceId: string) {
  return run(async ({ ctx, db }) => {
    const id = z.string().uuid().parse(resourceId);
    await removeLearningRecord(db, ctx, id).catch(() => {});
    const out = await submitArchive(db, ctx, "resource", id, true, "Removed by its owner");
    revalidatePath("/", "layout");
    return { archived: out.mode === "applied" };
  });
}
