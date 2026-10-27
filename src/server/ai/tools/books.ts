/**
 * Book tools: a PDF the user gives the assistant becomes a readable book
 * (Kitobni o'qish), its chapters are found and the audiobook is prepared;
 * own books (Kitob yozish); editing notes; messages to the admin. Every one
 * is a confirmation card.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db, withUser } from "@/db";
import { files, notes } from "@/db/schema";
import { BOOK_TEMPLATES } from "@/lib/book-templates";
import { AppError } from "@/lib/errors";
import { analyzeAudiobook, resetAudiobook } from "../../audiobook";
import { findStructure } from "../../book-structure";
import { indexFromFile } from "../../booktext";
import { sendFeedback } from "../../feedback";
import { createOwnBook } from "../../own-books";
import {
  bool,
  def,
  describeResources,
  int,
  obj,
  resolveResource,
  resourceRef,
  resourceRefSchema,
  str,
  uuid,
} from "./helpers";

const describe = (ctx: Parameters<typeof describeResources>[0], ids: string[]) =>
  describeResources(
    ctx,
    ids.map((id) => ({ id, score: 1, reason: "source" })),
  );

const loc = (l: string) => (l === "en" ? "en" : "uz");

export const BOOK_TOOLS = {
  add_book_pdf: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Attach a PDF the user sent (its fileId from '[Attached file …, fileId: …]') to a book and make it readable on the site: the text is extracted, the chapters are found for the whole book, and (audiobook=true, default) the audiobook is analysed. Use it whenever the user sends a book's PDF to add / read / listen to it. If the book is not in their library yet, propose add_resource FIRST (title, authors, original date from the PDF's title page) and then this tool with the same title.",
    parameters: obj(
      {
        ...resourceRef,
        fileId: str("The attached PDF's fileId"),
        audiobook: bool("Also prepare the audiobook (default true)"),
      },
      ["fileId"],
    ),
    args: z.object({ ...resourceRefSchema, fileId: uuid, audiobook: z.boolean().optional() }),
    preview: async (ctx, a) => {
      const [f] = await withUser(db, ctx, (tx) =>
        tx
          .select({ name: files.originalName, size: files.sizeBytes, mime: files.mimeType })
          .from(files)
          .where(
            and(eq(files.id, a.fileId), eq(files.ownerId, ctx.userId), isNull(files.deletedAt)),
          ),
      );
      const id = await resolveResource(ctx, a).catch(() => null);
      return {
        file: f ? { name: f.name, size: Number(f.size), pdf: f.mime === "application/pdf" } : null,
        sources: id ? await describe(ctx, [id]) : [],
      };
    },
    run: async (ctx, a, env) => {
      const id = await resolveResource(ctx, a);
      const [f] = await withUser(db, ctx, (tx) =>
        tx
          .select({ mime: files.mimeType })
          .from(files)
          .where(
            and(eq(files.id, a.fileId), eq(files.ownerId, ctx.userId), isNull(files.deletedAt)),
          ),
      );
      if (!f) throw new AppError("NOT_FOUND", "file");
      if (f.mime !== "application/pdf") throw new AppError("VALIDATION", "only_pdf_indexed");
      // The chat attachment becomes the book's own PDF (shown on its page).
      await withUser(db, ctx, (tx) =>
        tx
          .update(files)
          .set({ resourceId: id, purpose: "attachment" })
          .where(and(eq(files.id, a.fileId), eq(files.ownerId, ctx.userId))),
      );
      const r = await indexFromFile(ctx, id, a.fileId);
      await resetAudiobook(ctx, id);
      const locale = loc(env.locale);
      // Chapters, then the audiobook analysis: after the answer (a big book takes minutes).
      after(async () => {
        await findStructure(ctx, id, locale).catch(() => null);
        if (a.audiobook !== false) await analyzeAudiobook(ctx, id, locale).catch(() => {});
      });
      return {
        pages: r.pages,
        href: `/library/${id}/read`,
        audiobook: a.audiobook !== false ? `/library/${id}/audiobook` : undefined,
        note: "The chapters and the audiobook analysis are being prepared in the background (1–5 minutes for a big book).",
      };
    },
  }),

  prepare_audiobook: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Prepare (or re-prepare) the audiobook of a book whose PDF text is already on the site: deep analysis of the whole book, characters with their voices, pronunciation, chapters. Takes 1–5 minutes; then the user listens at the returned link.",
    parameters: obj({ ...resourceRef }),
    args: z.object({ ...resourceRefSchema }),
    preview: async (ctx, a) => {
      const id = await resolveResource(ctx, a).catch(() => null);
      return { sources: id ? await describe(ctx, [id]) : [] };
    },
    run: async (ctx, a, env) => {
      const id = await resolveResource(ctx, a);
      const locale = loc(env.locale);
      after(() => analyzeAudiobook(ctx, id, locale).catch(() => {}));
      return {
        started: true,
        href: `/library/${id}/audiobook`,
        note: "The analysis runs in the background (1–5 minutes).",
      };
    },
  }),

  create_own_book: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Start a book the USER writes (Kitob yozish): title, optional subtitle, a template (memoir = life story, family, knowledge, stories, travel, blank) with ready chapters and guiding questions, optional word goal.",
    parameters: obj(
      {
        title: str("Book title"),
        subtitle: str(""),
        template: str("memoir | family | knowledge | stories | travel | blank", {
          enum: [...BOOK_TEMPLATES],
        }),
        goalWords: int("Word goal, e.g. 30000"),
      },
      ["title"],
    ),
    args: z.object({
      title: z.string().trim().min(1).max(300),
      subtitle: z.string().trim().max(1000).optional(),
      template: z.enum(BOOK_TEMPLATES).optional(),
      goalWords: z.number().int().min(100).max(2_000_000).optional(),
    }),
    run: async (ctx, a, env) => {
      const id = await createOwnBook(ctx, {
        title: a.title,
        subtitle: a.subtitle ?? null,
        template: a.template ?? "blank",
        goalWords: a.goalWords ?? null,
        locale: loc(env.locale),
      });
      return { created: true, href: `/write/${id}` };
    },
  }),

  update_note: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Edit one of the user's notes or quotes (find it first with search_my_notes): new title, text, quote text, page. Only the given fields change.",
    parameters: obj(
      {
        noteId: str("The note's id"),
        noteTitle: str("New title"),
        body: str("New text"),
        quoteText: str("New quote text"),
        pageFrom: int("Page"),
      },
      ["noteId"],
    ),
    args: z.object({
      noteId: uuid,
      noteTitle: z.string().trim().max(300).optional(),
      body: z.string().trim().max(50_000).optional(),
      quoteText: z.string().trim().max(10_000).optional(),
      pageFrom: z.number().int().min(0).max(100_000).optional(),
    }),
    run: async (ctx, a) => {
      const [n] = await withUser(db, ctx, (tx) =>
        tx
          .select()
          .from(notes)
          .where(
            and(eq(notes.id, a.noteId), eq(notes.userId, ctx.userId), isNull(notes.deletedAt)),
          ),
      );
      if (!n) throw new AppError("NOT_FOUND");
      // Only the given fields change (tags, links and the rest stay).
      await withUser(db, ctx, (tx) =>
        tx
          .update(notes)
          .set({
            ...(a.noteTitle !== undefined ? { title: a.noteTitle || null } : {}),
            ...(a.body !== undefined ? { body: a.body || null } : {}),
            ...(a.quoteText !== undefined ? { quoteText: a.quoteText || null } : {}),
            ...(a.pageFrom !== undefined ? { pageFrom: a.pageFrom } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(notes.id, n.id), eq(notes.userId, ctx.userId))),
      );
      return { updated: true, href: `/notes/${n.id}` };
    },
  }),

  message_admin: def({
    perm: "write_personal",
    mode: "confirm",
    description:
      "Send the user's message to the site admin (Takliflar → Adminga yozish): a suggestion, a bug report or a question — in the user's own words.",
    parameters: obj(
      {
        noteTitle: str("Short subject"),
        body: str("The message"),
        contact: str("Optional contact (Telegram, e-mail)"),
      },
      ["noteTitle", "body"],
    ),
    args: z.object({
      noteTitle: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(5000),
      contact: z.string().trim().max(200).optional(),
    }),
    run: async (ctx, a) => {
      await sendFeedback(ctx, { title: a.noteTitle, body: a.body, contact: a.contact ?? null });
      return { sent: true, href: "/suggestions" };
    },
  }),
} as const;
