import "server-only";
import { z } from "zod";
import { db, withUser } from "@/db";
import { AppError } from "@/lib/errors";
import { normalizeText } from "@/lib/normalize";
import {
  CONTRIBUTOR_ROLES,
  LEARNING_STATUSES,
  PERSON_ROLES,
  RESOURCE_TYPES,
  httpUrl,
} from "@/lib/validation";
import {
  findDuplicateResources,
  getPersonSnapshot,
  getResourceSnapshot,
  searchPeople,
} from "../../catalog";
import { ensureInLibrary, setLearningStatus, setRating } from "../../records";
import { submitPerson, submitResource, submitSuggestion } from "../../suggestions";
import {
  uuid,
  partialDate,
  str,
  int,
  bool,
  obj,
  arr,
  def,
  resolveResource,
  describeResources,
  resourceRef,
  resourceRefSchema,
  updateResourceFields,
} from "./helpers";

export const CATALOG_TOOLS = {
  // ─── Act: catalog ───────────────────────────────────────────────────────
  add_resource: def({
    perm: "write_catalog",
    mode: "confirm",
    description:
      "Add a book/course/video/lecture/article/podcast to the catalog and (optionally) to the user's library with a status. Authors are given by NAME (existing people are reused, missing ones created). Only facts you know (use lookup_book_online first, with its coverUrl). Every call is shown to the user as a proposal card with possible duplicates; nothing is created until they confirm. Call search_catalog / list_my_library first and do NOT propose a book that already exists (use update_my_record for it). Never guess dates, pages or publishers — leave them out when unknown.",
    parameters: obj(
      {
        type: str("Type", { enum: [...RESOURCE_TYPES] }),
        title: str("Title"),
        originalTitle: str("Original title"),
        authors: arr({ type: "string" }, "Author / speaker names"),
        authorRole: str("Role of those people", { enum: [...CONTRIBUTOR_ROLES] }),
        description: str("Short description"),
        originalDate: str(
          'Original writing / first publication date (books). Flexible date: YYYY, YYYY-MM, YYYY-MM-DD; "YYYY~" = approximately; "YYYY/YYYY" = somewhere in that range (12th century = "1101/1200"); negative = BC',
        ),
        editionDate: str("Books: the edition the user reads. Other types: release date"),
        publisher: str("Publisher name (books; existing publishers are reused)"),
        pageCount: int("Pages"),
        language: str("Language code, e.g. uz, en, ru"),
        isbn: str("ISBN"),
        coverUrl: str("Cover image URL (https)"),
        sourceUrl: str("Canonical/source URL"),
        readingUrl: str("Where it can be read online"),
        durationMinutes: int("Length in minutes (non-book types; articles: reading time)"),
        channel: str("Where: channel, platform, site or university (non-book types)"),
        lessonCount: int("Courses: number of lessons"),
        categoryIds: arr({ type: "string" }, "Category UUIDs from list_categories"),
        tags: arr({ type: "string" }),
        status: str("Also add to the user's library with this status", {
          enum: [...LEARNING_STATUSES],
        }),
        rating: int("The user's rating out of 10 (if they gave one)"),
      },
      ["type", "title"],
    ),
    args: z.object({
      type: z.enum(RESOURCE_TYPES),
      title: z.string().trim().min(1).max(400),
      originalTitle: z.string().trim().max(400).optional(),
      authors: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
      authorRole: z.enum(CONTRIBUTOR_ROLES).optional(),
      description: z.string().trim().max(10_000).optional(),
      originalDate: partialDate.optional(),
      editionDate: partialDate.optional(),
      publisher: z.string().trim().max(200).optional(),
      pageCount: z.number().int().min(1).max(100_000).optional(),
      language: z.string().trim().max(40).optional(),
      isbn: z.string().trim().max(20).optional(),
      coverUrl: httpUrl.optional(),
      sourceUrl: httpUrl.optional(),
      readingUrl: httpUrl.optional(),
      durationMinutes: z.number().int().min(1).max(100_000).optional(),
      channel: z.string().trim().max(200).optional(),
      lessonCount: z.number().int().min(1).max(10_000).optional(),
      categoryIds: z.array(uuid).max(10).optional(),
      tags: z.array(z.string().trim().min(1).max(48)).max(10).optional(),
      status: z.enum(LEARNING_STATUSES).optional(),
      rating: z.number().int().min(1).max(10).optional(),
      /** Set on the confirmation card: use this existing entry instead of creating. */
      useExistingId: uuid.optional(),
      /** Set on the confirmation card: the user insists it is a different book. */
      createNew: z.boolean().optional(),
    }),
    preview: async (ctx, a) => {
      const isbnDigits = a.isbn?.replace(/[\s-]/g, "") ?? "";
      const dups = await withUser(db, ctx, (tx) =>
        findDuplicateResources(tx, {
          type: a.type,
          title: a.title,
          identifiers: isbnDigits
            ? [{ scheme: isbnDigits.length === 10 ? "isbn10" : "isbn13", value: isbnDigits }]
            : [],
          sourceUrl: a.sourceUrl ?? null,
        }),
      );
      return { duplicates: await describeResources(ctx, dups) };
    },
    run: async (ctx, a) => {
      const mark = async (id: string) => {
        if (a.status) await setLearningStatus(db, ctx, id, a.status);
        else await withUser(db, ctx, (tx) => ensureInLibrary(tx, ctx.userId, id));
        if (a.rating) await setRating(db, ctx, id, a.rating);
      };
      if (a.useExistingId) {
        await mark(a.useExistingId);
        return { linked: true, id: a.useExistingId, href: `/library/${a.useExistingId}` };
      }
      const isBook = a.type === "book";
      const isbnDigits = a.isbn?.replace(/[\s-]/g, "") ?? "";
      const role = a.authorRole ?? (isBook || a.type === "article" ? "author" : "speaker");
      const contributors: {
        personId: string | null;
        newPersonName: string | null;
        role: typeof role;
      }[] = [];
      for (const name of a.authors ?? []) {
        const [hit] = await withUser(db, ctx, (tx) => searchPeople(tx, name, 1));
        const exact = hit && normalizeText(hit.fullName) === normalizeText(name);
        contributors.push(
          exact
            ? { personId: hit.id, newPersonName: null, role }
            : { personId: null, newPersonName: name, role },
        );
      }
      try {
        const out = await submitResource(
          db,
          ctx,
          {
            type: a.type,
            title: a.title,
            originalTitle: a.originalTitle,
            description: a.description,
            originalDate: a.originalDate,
            publicationDate: a.editionDate,
            language: a.language,
            coverUrl: a.coverUrl,
            sourceUrl: a.sourceUrl,
            contributors,
            categoryIds: a.categoryIds ?? [],
            tags: a.tags ?? [],
            identifiers: isbnDigits
              ? [{ scheme: isbnDigits.length === 10 ? "isbn10" : "isbn13", value: isbnDigits }]
              : [],
            book: isBook
              ? { publisherName: a.publisher, pageCount: a.pageCount, readingUrl: a.readingUrl }
              : null,
            media: !isBook
              ? {
                  channel: a.channel,
                  durationSeconds: a.durationMinutes ? a.durationMinutes * 60 : null,
                  lessonCount: a.lessonCount,
                }
              : null,
          },
          { allowDuplicate: !!a.createNew, origin: "ai" },
        );
        if (out.mode === "applied") await mark(out.id);
        return out.mode === "applied"
          ? { created: true, id: out.id, href: `/library/${out.id}` }
          : { suggested: true, href: "/suggestions" };
      } catch (err) {
        // An identical entry appeared meanwhile: use it instead of duplicating.
        if (err instanceof AppError && err.code === "DUPLICATE") {
          const c = ((err.details as { candidates?: { id: string; score: number }[] })
            ?.candidates ?? [])[0];
          if (c && c.score >= 0.95) {
            await mark(c.id);
            return { linked: true, id: c.id, href: `/library/${c.id}` };
          }
        }
        throw err;
      }
    },
  }),
  update_resource: def({
    perm: "write_catalog",
    mode: "confirm",
    description:
      "Change catalog fields of a resource (title, dates, description, cover, pages, readingUrl, language, publisher…). Applies directly when the user may edit it; otherwise it becomes a suggestion for the admin.",
    parameters: obj(
      {
        ...resourceRef,
        changes: obj({
          title: str(""),
          originalTitle: str(""),
          description: str(""),
          originalDate: str(
            'Flexible date: YYYY, YYYY-MM, YYYY-MM-DD; "YYYY~" = approximately; "YYYY/YYYY" = somewhere in that range (12th century = "1101/1200"); negative = BC',
          ),
          editionDate: str("Edition / release date (same format)"),
          coverUrl: str("https image URL"),
          sourceUrl: str(""),
          language: str(""),
          publisher: str(""),
          pageCount: int(""),
          readingUrl: str(""),
          durationMinutes: int(""),
          channel: str(""),
          lessonCount: int("Courses"),
        }),
      },
      ["changes"],
    ),
    args: z.object({
      ...resourceRefSchema,
      changes: z.object({
        title: z.string().trim().min(1).max(400).optional(),
        originalTitle: z.string().trim().max(400).optional(),
        description: z.string().trim().max(20_000).optional(),
        originalDate: partialDate.optional(),
        editionDate: partialDate.optional(),
        coverUrl: httpUrl.optional(),
        sourceUrl: httpUrl.optional(),
        language: z.string().trim().max(40).optional(),
        publisher: z.string().trim().max(200).optional(),
        pageCount: z.number().int().min(1).max(100_000).optional(),
        readingUrl: httpUrl.optional(),
        durationMinutes: z.number().int().min(1).max(100_000).optional(),
        channel: z.string().trim().max(200).optional(),
        lessonCount: z.number().int().min(1).max(10_000).optional(),
      }),
    }),
    run: async (ctx, a) => updateResourceFields(ctx, await resolveResource(ctx, a), a.changes),
  }),
  set_cover: def({
    perm: "write_catalog",
    mode: "confirm",
    description:
      "Set a resource's cover from an https image URL (e.g. coverUrl from lookup_book_online).",
    parameters: obj({ ...resourceRef, imageUrl: str("https image URL") }, ["imageUrl"]),
    args: z.object({ ...resourceRefSchema, imageUrl: httpUrl }),
    run: async (ctx, a) =>
      updateResourceFields(ctx, await resolveResource(ctx, a), { coverUrl: a.imageUrl }),
  }),
  add_person: def({
    perm: "write_catalog",
    mode: "confirm",
    description:
      "Add a person (author, scholar…) to the catalog using facts from sources (lookup_person_online). Never guess dates. Returns duplicates instead of creating when similar people exist (force=true only if really different).",
    parameters: obj(
      {
        fullName: str("Full name"),
        aliases: arr({ type: "string" }),
        shortDescription: str(""),
        biography: str("Short neutral biography"),
        birthDate: str("YYYY[-MM[-DD]] only if stated in a source"),
        deathDate: str("YYYY[-MM[-DD]] only if stated in a source"),
        nationality: str(""),
        roles: arr({ type: "string", enum: [...PERSON_ROLES] }),
        portraitUrl: str("Image URL"),
        sourceUrls: arr({ type: "string" }, "Sources (Wikipedia etc.)"),
        force: bool(""),
      },
      ["fullName"],
    ),
    args: z.object({
      fullName: z.string().trim().min(1).max(200),
      aliases: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
      shortDescription: z.string().trim().max(300).optional(),
      biography: z.string().trim().max(10_000).optional(),
      birthDate: partialDate.optional(),
      deathDate: partialDate.optional(),
      nationality: z.string().trim().max(120).optional(),
      roles: z.array(z.enum(PERSON_ROLES)).max(9).optional(),
      portraitUrl: httpUrl.optional(),
      sourceUrls: z.array(httpUrl).max(5).optional(),
      force: z.boolean().optional(),
    }),
    run: async (ctx, a) => {
      try {
        const { force, sourceUrls, ...rest } = a;
        const out = await submitPerson(
          db,
          ctx,
          {
            ...rest,
            aliases: a.aliases ?? [],
            roles: a.roles ?? [],
            links: (sourceUrls ?? []).map((url) => ({ kind: "source", url })),
          },
          { allowDuplicate: !!force, origin: "ai" },
        );
        return out.mode === "applied"
          ? { created: true, id: out.id, href: `/people/${out.id}` }
          : { suggested: true };
      } catch (err) {
        if (err instanceof AppError && err.code === "DUPLICATE")
          return {
            created: false,
            duplicates: (err.details as { candidates?: unknown })?.candidates ?? [],
          };
        throw err;
      }
    },
  }),
  suggest_correction: def({
    perm: "write_catalog",
    mode: "confirm",
    description:
      "Send a correction of someone else's catalog entry to admin review (e.g. biography, dates).",
    parameters: obj(
      {
        targetType: str("person or resource", { enum: ["person", "resource"] }),
        targetId: str("UUID"),
        changes: { type: "object", description: "field → new value" },
        explanation: str("Why"),
        sourceUrls: arr({ type: "string" }),
      },
      ["targetType", "targetId", "changes", "explanation"],
    ),
    args: z.object({
      targetType: z.enum(["person", "resource"]),
      targetId: uuid,
      changes: z.record(z.string(), z.unknown()),
      explanation: z.string().trim().min(1).max(3000),
      sourceUrls: z.array(httpUrl).max(5).optional(),
    }),
    run: async (ctx, a) => {
      const current: Record<string, unknown> | null = await withUser(db, ctx, (tx) =>
        a.targetType === "person"
          ? (getPersonSnapshot(tx, a.targetId) as Promise<Record<string, unknown> | null>)
          : (getResourceSnapshot(tx, a.targetId) as Promise<Record<string, unknown> | null>),
      );
      if (!current) throw new AppError("NOT_FOUND");
      const changes = Object.fromEntries(Object.entries(a.changes).filter(([k]) => k in current));
      if (!Object.keys(changes).length) throw new AppError("VALIDATION", "no_valid_changes");
      await submitSuggestion(
        db,
        ctx,
        {
          operation: "update",
          targetType: a.targetType,
          targetId: a.targetId,
          payload: { ...current, ...changes },
          explanation: a.explanation,
          sourceUrls: a.sourceUrls ?? [],
        },
        "ai",
      );
      return { suggested: true, href: "/suggestions" };
    },
  }),
} as const;
