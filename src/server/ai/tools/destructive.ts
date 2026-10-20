import "server-only";
import { z } from "zod";
import { db } from "@/db";
import { deleteCollection, deleteNote } from "../../notes";
import { findLibraryDuplicates, mergeResources } from "../../merge";
import { removeLearningRecord } from "../../records";
import { submitArchive } from "../../suggestions";
import {
  uuid,
  str,
  obj,
  arr,
  def,
  resolveResource,
  describeResources,
  resolveCollection,
  resourceRef,
  resourceRefSchema,
} from "./helpers";

export const DESTRUCTIVE_TOOLS = {
  // ─── Confirm: destructive ───────────────────────────────────────────────
  remove_from_library: def({
    perm: "delete",
    mode: "confirm",
    description:
      "PROPOSE removing a resource from the user's library (requires the user's confirmation).",
    parameters: obj(resourceRef),
    args: z.object(resourceRefSchema),
    run: async (ctx, a) => {
      await removeLearningRecord(db, ctx, await resolveResource(ctx, a));
      return { removed: true };
    },
  }),
  delete_note: def({
    perm: "delete",
    mode: "confirm",
    description: "PROPOSE moving a note to trash (requires confirmation).",
    parameters: obj({ noteId: str("Note UUID") }, ["noteId"]),
    args: z.object({ noteId: uuid }),
    run: async (ctx, a) => {
      await deleteNote(db, ctx, a.noteId);
      return { deleted: true, href: "/notes?tab=trash" };
    },
  }),
  delete_collection: def({
    perm: "delete",
    mode: "confirm",
    description: "PROPOSE deleting a collection (its items stay in the library).",
    parameters: obj({ collectionId: str(""), collectionName: str("") }),
    args: z.object({
      collectionId: uuid.optional(),
      collectionName: z.string().trim().max(120).optional(),
    }),
    run: async (ctx, a) => {
      await deleteCollection(db, ctx, await resolveCollection(ctx, a));
      return { deleted: true, href: "/collections" };
    },
  }),
  find_duplicates: def({
    perm: "read_library",
    mode: "read",
    description:
      "Find likely duplicate entries in the user's library (same or very similar titles). Use before merge_resources.",
    parameters: obj({}),
    args: z.object({}),
    run: async (ctx) =>
      (await findLibraryDuplicates(ctx)).map((g) =>
        g.items.map((i) => ({ id: i.id, title: i.title, authors: i.authors, myStatus: i.status })),
      ),
  }),
  merge_resources: def({
    perm: "delete",
    mode: "confirm",
    description:
      "Merge duplicate entries into one: the user's record, notes, taqriz and collection places move to `keep`; the duplicates are archived (if the user may edit them). Use ids from find_duplicates / search_catalog.",
    parameters: obj(
      {
        keepId: str("UUID of the entry to keep"),
        removeIds: arr({ type: "string" }, "UUIDs of the duplicates"),
      },
      ["keepId", "removeIds"],
    ),
    args: z.object({ keepId: uuid, removeIds: z.array(uuid).min(1).max(10) }),
    preview: async (ctx, a) => ({
      keep: (await describeResources(ctx, [{ id: a.keepId, score: 1, reason: "keep" }]))[0] ?? null,
      remove: await describeResources(
        ctx,
        a.removeIds.map((id) => ({ id, score: 1, reason: "remove" })),
      ),
    }),
    run: async (ctx, a) => {
      const r = await mergeResources(ctx, a.keepId, a.removeIds);
      return { ...r, href: `/library/${a.keepId}` };
    },
  }),
  delete_resource: def({
    perm: "delete",
    mode: "confirm",
    description:
      "Delete an entry the user added by mistake: removes it from their library and archives the catalog entry when they created it (otherwise only removes it from their library and suggests archiving).",
    parameters: obj(resourceRef),
    args: z.object(resourceRefSchema),
    preview: async (ctx, a) => ({
      target:
        (
          await describeResources(ctx, [
            { id: await resolveResource(ctx, a), score: 1, reason: "target" },
          ])
        )[0] ?? null,
    }),
    run: async (ctx, a) => {
      const id = await resolveResource(ctx, a);
      await removeLearningRecord(db, ctx, id).catch(() => {});
      const out = await submitArchive(db, ctx, "resource", id, true, "Removed by its owner (AI)");
      return { deleted: true, archived: out.mode === "applied", href: "/library" };
    },
  }),
  archive_resource: def({
    perm: "delete",
    mode: "confirm",
    description:
      "PROPOSE archiving a catalog resource (applies only if the user may edit it; otherwise admin review).",
    parameters: obj(resourceRef),
    args: z.object(resourceRefSchema),
    run: async (ctx, a) =>
      submitArchive(db, ctx, "resource", await resolveResource(ctx, a), true, "AI"),
  }),
} as const;
