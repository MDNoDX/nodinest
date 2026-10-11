"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addRelation } from "@/server/catalog";
import { submitArchive, submitPerson, submitResource } from "@/server/suggestions";
import { withUser } from "@/db";
import { importUrlMetadata } from "@/server/url-import";
import { AppError } from "@/lib/errors";
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
    if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
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
      unlimited: ctx.role === "superadmin",
    });
    // Never return the full page text to the client form.
    const { text: _text, ...rest } = m;
    void _text;
    return rest;
  });
}
