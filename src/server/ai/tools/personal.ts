import { generateCards, improveCards, listDecks } from "../../study-cards";
import { readingValue } from "@/lib/reading-date";
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, withUser } from "@/db";
import { files, learningRecords } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { LEARNING_STATUSES, RESOURCE_TYPES, httpUrl } from "@/lib/validation";
import { indexFromFile, indexFromUrl } from "../../booktext";
import { getResourceDetail } from "../../catalog";
import { writeToWriteup } from "../../writeups";
import { dayKey } from "@/lib/dates";
import { saveGoal } from "../../goals";
import { createStepGoal, saveRoutine } from "../../roznoma";
import { saveNote, toggleCollectionItem } from "../../notes";
import { upsertLearningRecord } from "../../records";
import {
  uuid,
  dateTime,
  str,
  int,
  bool,
  obj,
  arr,
  def,
  resolveResource,
  describeResources,
  resolveCollection,
  moveToRank,
  resourceRef,
  resourceRefSchema,
} from "./helpers";
import { asLocale } from "@/i18n/config";

export const PERSONAL_TOOLS = {
  // ─── Act: personal ──────────────────────────────────────────────────────
  update_my_record: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Update the user's own record of a resource: status, rating OUT OF 10, start / finish dates at the precision the user gave: 2024, 2024-05, 2024-05-12 or ISO date-time 2026-05-01T21:30 (never invent a day or time the user did not say), short review, progress. Adds it to the library if needed.",
    parameters: obj({
      ...resourceRef,
      status: str("", { enum: [...LEARNING_STATUSES] }),
      rating: int("1-10"),
      startedAt: str("YYYY | YYYY-MM | YYYY-MM-DD | ISO date-time"),
      completedAt: str("YYYY | YYYY-MM | YYYY-MM-DD | ISO date-time"),
      review: str("Short review"),
      progressCurrent: int(""),
      progressTotal: int(""),
      progressUnit: str("", { enum: ["pages", "chapters", "minutes", "percent", "lessons"] }),
    }),
    args: z.object({
      ...resourceRefSchema,
      status: z.enum(LEARNING_STATUSES).optional(),
      rating: z.number().int().min(1).max(10).optional(),
      startedAt: dateTime.optional(),
      completedAt: dateTime.optional(),
      review: z.string().trim().max(20_000).optional(),
      progressCurrent: z.number().int().min(0).max(1_000_000).optional(),
      progressTotal: z.number().int().min(1).max(1_000_000).optional(),
      progressUnit: z.enum(["pages", "chapters", "minutes", "percent", "lessons"]).optional(),
    }),
    run: async (ctx, a) => {
      const id = await resolveResource(ctx, a);
      const [rec] = await withUser(db, ctx, (tx) =>
        tx
          .select()
          .from(learningRecords)
          .where(and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, id))),
      );
      const prevStatus =
        rec?.status === "abandoned" || rec?.status === "paused" ? "in_progress" : rec?.status;
      await upsertLearningRecord(db, ctx, {
        resourceId: id,
        status: a.status ?? prevStatus ?? (a.completedAt ? "completed" : "planned"),
        startedAt:
          a.startedAt ?? readingValue(rec?.startedAt ?? null, rec?.startedPrecision ?? null),
        completedAt:
          a.completedAt ?? readingValue(rec?.completedAt ?? null, rec?.completedPrecision ?? null),
        rating: a.rating ?? rec?.rating ?? null,
        review: a.review ?? rec?.review ?? null,
        progressCurrent: a.progressCurrent ?? rec?.progressCurrent ?? null,
        progressTotal: a.progressTotal ?? rec?.progressTotal ?? null,
        progressUnit: a.progressUnit ?? rec?.progressUnit ?? "pages",
      });
      return { updated: true, href: `/library/${id}` };
    },
  }),
  write_taqriz: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Write into the user's taqriz (free-form write-up) of a resource, in the user's language. Text is light Markdown: '## ' chapter titles, '- ' lists, '> ' quotes, **bold**. mode=append adds at the end (or at the end of `chapter` if it exists, else creates that chapter); mode=replace_chapter rewrites that chapter's text. Chapters are optional.",
    parameters: obj(
      {
        ...resourceRef,
        chapter: str("Optional chapter title"),
        markdown: str("Text to write"),
        mode: str("append | replace_chapter", { enum: ["append", "replace_chapter"] }),
      },
      ["markdown"],
    ),
    args: z.object({
      ...resourceRefSchema,
      chapter: z.string().trim().max(300).optional(),
      markdown: z.string().min(1).max(100_000),
      mode: z.enum(["append", "replace_chapter"]).optional(),
    }),
    run: async (ctx, a) => {
      const id = await resolveResource(ctx, a);
      const out = await writeToWriteup(db, ctx, id, {
        chapter: a.chapter,
        markdown: a.markdown,
        mode: a.mode ?? "append",
      });
      return { saved: true, words: out.words, href: `/library/${id}/taqriz` };
    },
  }),
  add_to_collection: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Add a resource to one of the user's collections (by name or id; created if missing — ranked=true for Top-N lists). Optional rank places it at that position (#1 = best).",
    parameters: obj({
      ...resourceRef,
      collectionId: str(""),
      collectionName: str("e.g. Top 10 kitoblar"),
      ranked: bool(""),
      rank: int("1 = top"),
    }),
    args: z.object({
      ...resourceRefSchema,
      collectionId: uuid.optional(),
      collectionName: z.string().trim().max(120).optional(),
      ranked: z.boolean().optional(),
      rank: z.number().int().min(1).max(1000).optional(),
    }),
    run: async (ctx, a) => {
      const rid = await resolveResource(ctx, a);
      const cid = await resolveCollection(ctx, a, { ranked: a.ranked ?? !!a.rank });
      await toggleCollectionItem(db, ctx, cid, { resourceId: rid }, true);
      if (a.rank) await moveToRank(ctx, cid, rid, a.rank);
      return { added: true, href: `/collections/${cid}` };
    },
  }),
  list_study_decks: def({
    perm: "read_library",
    mode: "read",
    description:
      "List the user's study-card decks (questions for memorising) with how many cards are due today.",
    parameters: obj({}),
    args: z.object({}),
    run: async (ctx) =>
      (await listDecks(ctx)).map((d) => ({
        deck: d.deck,
        total: d.total,
        due: d.due,
        learned: d.learned,
        href: `/review?deck=${encodeURIComponent(d.deck)}`,
      })),
  }),
  make_study_cards: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Prepare the most important study questions (with answers) from one or more of the user's resources — using their notes, quotes, the video transcript / konspekt, their taqriz and the book text — and save them as a deck for spaced-repetition review (memorising). Use when the user asks for questions, a test, flashcards or help remembering. Give resources by title as the user said them.",
    parameters: obj(
      {
        resources: arr(obj(resourceRef), "The resources to make questions from (1–8)"),
        count: int(
          "How many questions, only if the user said a number (max 200). Omit it to get EVERY important question the material supports.",
        ),
        focus: str("Optional focus, e.g. 'faqat 3-bob', 'asosiy tushunchalar', 'imtihonga'"),
        deck: str("Optional deck name; default: the resource title(s)"),
        deep: bool(
          "Deep mode: harder exam-level questions, every card checked against the material (slower). Use when the user asks for deep / thorough / exam / very accurate questions, or many (e.g. 100).",
        ),
      },
      ["resources"],
    ),
    args: z.object({
      resources: z.array(z.object(resourceRefSchema)).min(1).max(8),
      count: z.number().int().min(1).max(200).optional(),
      deep: z.boolean().optional(),
      focus: z.string().trim().max(500).optional(),
      deck: z.string().trim().max(120).optional(),
    }),
    preview: async (ctx, a) => {
      const ids = await Promise.all(
        a.resources.map((r) => resolveResource(ctx, r).catch(() => null)),
      );
      return {
        sources: await describeResources(
          ctx,
          ids.filter((x): x is string => !!x).map((id) => ({ id, score: 1, reason: "source" })),
        ),
      };
    },
    run: async (ctx, a, env) => {
      const ids = [...new Set(await Promise.all(a.resources.map((r) => resolveResource(ctx, r))))];
      const out = await generateCards(ctx, {
        resourceIds: ids,
        count: a.count ?? null,
        focus: a.focus ?? "",
        deck: a.deck,
        depth: a.deep ? "deep" : "standard",
        locale: asLocale(env.locale),
      });
      return {
        created: out.created,
        deck: out.deck,
        note: out.thinMaterial
          ? "Some resources had no notes / transcript / book text: their questions rely on the catalog facts only."
          : undefined,
        questions: out.sample.map((x) => x.q),
        href: `/review?deck=${encodeURIComponent(out.deck)}`,
      };
    },
  }),
  improve_study_cards: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Improve an existing study-card deck: sharper, more important questions and complete, correct answers (review progress is kept). Optional instruction from the user.",
    parameters: obj(
      { deck: str("Deck name (see list_study_decks)"), instruction: str("What to improve") },
      ["deck"],
    ),
    args: z.object({
      deck: z.string().trim().min(1).max(120),
      instruction: z.string().trim().max(800).optional(),
    }),
    run: async (ctx, a, env) => {
      const out = await improveCards(ctx, {
        deck: a.deck,
        instruction: a.instruction ?? "",
        locale: asLocale(env.locale),
      });
      return { ...out, href: `/review?deck=${encodeURIComponent(a.deck)}` };
    },
  }),
  set_rank: def({
    perm: "write_personal",
    mode: "confirm",
    description: "Move a resource to a position in a ranked collection (#1 = best).",
    parameters: obj(
      { ...resourceRef, collectionId: str(""), collectionName: str(""), rank: int("1 = top") },
      ["rank"],
    ),
    args: z.object({
      ...resourceRefSchema,
      collectionId: uuid.optional(),
      collectionName: z.string().trim().max(120).optional(),
      rank: z.number().int().min(1).max(1000),
    }),
    run: async (ctx, a) => {
      const rid = await resolveResource(ctx, a);
      const cid = await resolveCollection(ctx, a);
      await moveToRank(ctx, cid, rid, a.rank);
      return { ranked: true, href: `/collections/${cid}` };
    },
  }),
  create_note: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Create a private note, or an EXACT quotation (with page). Never invent quotations — take exact text from read_book_pages / search_in_books.",
    parameters: obj(
      {
        kind: str("note or quote", { enum: ["note", "quote"] }),
        noteTitle: str("Optional heading"),
        body: str("Note text / commentary"),
        quoteText: str("Exact quotation"),
        resourceId: str("Resource UUID"),
        resourceTitle: str("Or resource title"),
        pageFrom: int(""),
        pageTo: int(""),
        location: str("Chapter"),
        tags: arr({ type: "string" }),
      },
      ["kind"],
    ),
    args: z
      .object({
        kind: z.enum(["note", "quote"]),
        noteTitle: z.string().trim().max(300).optional(),
        body: z.string().trim().max(20_000).optional(),
        quoteText: z.string().trim().max(5000).optional(),
        resourceId: uuid.optional(),
        resourceTitle: z.string().trim().max(400).optional(),
        pageFrom: z.number().int().min(0).optional(),
        pageTo: z.number().int().min(0).optional(),
        location: z.string().trim().max(300).optional(),
        tags: z.array(z.string().trim().min(1).max(48)).max(10).optional(),
      })
      .refine(
        (n) => (n.kind === "quote" ? !!n.quoteText : !!(n.body || n.noteTitle)),
        "content_required",
      ),
    run: async (ctx, a) => {
      const resourceId =
        a.resourceId || a.resourceTitle
          ? await resolveResource(ctx, { resourceId: a.resourceId, title: a.resourceTitle })
          : null;
      const id = await saveNote(db, ctx, {
        kind: a.kind,
        title: a.noteTitle,
        body: a.body,
        quoteText: a.quoteText,
        resourceId,
        pageFrom: a.pageFrom,
        pageTo: a.pageTo,
        location: a.location,
        tags: a.tags ?? [],
        visibility: "private",
      });
      return { created: true, href: `/notes/${id}` };
    },
  }),
  create_plan: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      'Add an item to the user\'s Röznoma (daily planner): something done every day, on some weekdays (1=Mon…7=Sun) or once on a day (YYYY-MM-DD), with an optional amount ("20 bet") and time HH:MM (alarm).',
    parameters: obj(
      {
        planTitle: str("What"),
        amount: str("How much, e.g. 20 pages / 10 minutes"),
        time: str("HH:MM, optional"),
        repeat: str("", { enum: ["daily", "weekly", "once"] }),
        weekdays: arr(int("1=Mon…7=Sun"), "Weekly: the days"),
        onDay: str("YYYY-MM-DD (repeat once)"),
      },
      ["planTitle"],
    ),
    args: z.object({
      planTitle: z.string().trim().min(1).max(160),
      amount: z.string().trim().max(60).optional(),
      time: z.string().trim().max(5).optional(),
      repeat: z.enum(["daily", "weekly", "once"]).default("daily"),
      weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
      onDay: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    run: async (ctx, a, env) => {
      await saveRoutine(ctx, {
        title: a.planTitle,
        amount: a.amount || null,
        time: a.time || null,
        repeat: a.repeat,
        weekdays: a.weekdays ?? [],
        onDay: a.repeat === "once" ? (a.onDay ?? dayKey(new Date(), env.timeZone)) : null,
        alarm: true,
      });
      return { created: true, href: "/plans?tab=plans" };
    },
  }),
  create_goal: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Create a goal. Either what it consists of (steps: a list of things to tick off, e.g. a certificate: test → course → exam), or a number: complete N resources or read N pages per week/month/year.",
    parameters: obj(
      {
        goalTitle: str(""),
        metric: str("", { enum: ["completed_resources", "pages"] }),
        period: str("", { enum: ["week", "month", "year"] }),
        target: int(""),
        resourceType: str("", { enum: [...RESOURCE_TYPES] }),
        steps: arr(str("A step"), "What the goal consists of"),
      },
      ["goalTitle"],
    ),
    args: z.object({
      goalTitle: z.string().trim().min(1).max(200),
      metric: z.enum(["completed_resources", "pages", "steps"]).optional(),
      period: z.enum(["week", "month", "year"]).default("year"),
      target: z.number().int().min(1).max(100_000).optional(),
      resourceType: z.enum(RESOURCE_TYPES).optional(),
      steps: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    }),
    run: async (ctx, a) => {
      if (a.steps?.length || !a.metric || a.metric === "steps" || !a.target) {
        await createStepGoal(ctx, { title: a.goalTitle, steps: a.steps ?? [] });
        return { created: true, href: "/plans?tab=goals" };
      }
      await saveGoal(db, ctx, {
        title: a.goalTitle,
        metric: a.metric,
        period: a.period,
        target: a.target,
        resourceType: a.resourceType,
      });
      return { created: true, href: "/plans" };
    },
  }),
  index_book_text: def({
    perm: "write_personal",
    mode: "act",
    description:
      "Make a book searchable: extract its full text from the user's uploaded PDF, or from a public reading link (PDF or web page). Needed before search_in_books / read_book_pages.",
    parameters: obj({ ...resourceRef, url: str("Optional public URL of the PDF / reading page") }),
    args: z.object({ ...resourceRefSchema, url: httpUrl.optional() }),
    run: async (ctx, a) => {
      const id = await resolveResource(ctx, a);
      if (a.url) return { indexed: true, ...(await indexFromUrl(ctx, id, a.url)) };
      const [pdf] = await withUser(db, ctx, (tx) =>
        tx
          .select({ id: files.id })
          .from(files)
          .where(
            and(
              eq(files.ownerId, ctx.userId),
              eq(files.resourceId, id),
              eq(files.mimeType, "application/pdf"),
              isNull(files.deletedAt),
            ),
          )
          .orderBy(desc(files.createdAt))
          .limit(1),
      );
      if (pdf) return { indexed: true, ...(await indexFromFile(ctx, id, pdf.id)) };
      const d = await getResourceDetail(db, ctx, id);
      if (d?.book?.readingUrl)
        return { indexed: true, ...(await indexFromUrl(ctx, id, d.book.readingUrl)) };
      throw new AppError("VALIDATION", "no_pdf_or_link");
    },
  }),
} as const;
