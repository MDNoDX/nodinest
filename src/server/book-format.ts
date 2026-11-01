/**
 * Lays a book's pages out for reading: lines the PDF broke are joined, each
 * line of dialogue stands apart with its speaker, titles and quotations are
 * marked, what the PDF repeats on every page is left out, and the author's
 * words are kept. Done a few pages at a time, so it can stop
 * and go on: after an upload, while someone reads, and from the minute cron.
 * A page the model changed too much keeps its plain layout.
 */
import "server-only";
import { Type } from "@google/genai";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, withUser, type AppContext } from "@/db";
import { bookPages } from "@/db/schema";
import {
  blocksFromParas,
  keepsWords,
  runningPhrases,
  stripRunning,
  type BookBlock,
  type Running,
} from "@/lib/book-blocks";
import { reflow } from "@/lib/reflow";
import { generate, isAiConfigured } from "./ai/gemini";
import { hitRateLimit } from "./rate-limit";

const BATCH = 8;

const SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      page: { type: Type.INTEGER },
      blocks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            k: { type: Type.STRING, enum: ["h", "p", "d", "q", "c"] },
            t: { type: Type.STRING },
            s: { type: Type.STRING },
          },
          required: ["k", "t"],
        },
      },
    },
    required: ["page", "blocks"],
  },
};

const PROMPT = `You lay out pages of a book for reading. The text comes from a PDF, line by line.
For each page return its content as blocks, in order:
- h: a title or chapter heading
- p: narration (join the lines the PDF broke, mend words hyphenated at a line end)
- d: one line of direct speech or spoken thought, only the spoken words with their quotation marks or dash; always put who says it in "s"
- q: a quotation, verse, Quran verse or hadith set apart from the text
- c: centred lines of a title page (author, title, publisher, year)
Words around speech ("he said", "Royce replied.") are their own p block after the d block, as in a script. One paragraph like "— Come here,— he said.— Now." is three blocks: d, p, d.
Who speaks: follow the scene across the pages. "He said" means the person the scene is about, and two people talking take turns. Use the name the book calls them by ("Gared", or "Chol" for the old man), spelled exactly the same every time and exactly as in PEOPLE IN THIS BOOK when that list is given. Leave "s" out only when the text truly cannot tell.
Rules: keep the author's words EXACTLY, in the same order and language and script. Never translate, summarise, correct or add anything, except speaker names in "s". Drop only bare page numbers. A paragraph cut by the end of the page stays cut.`;

/** The book's cast (when its audiobook was analysed) and the speakers named so far. */
async function peopleOf(ctx: AppContext, resourceId: string) {
  const rows = await withUser(db, ctx, (tx) =>
    tx.execute<{ name: string }>(sql`
      (select c->>'name' as name from nodinest.audiobooks a,
        jsonb_array_elements(a.analysis->'characters') c
       where a.user_id = ${ctx.userId} and a.resource_id = ${resourceId})
      union
      (select distinct b->>'s' from nodinest.book_pages p, jsonb_array_elements(p.formatted) b
       where p.user_id = ${ctx.userId} and p.resource_id = ${resourceId}
         and jsonb_typeof(p.formatted) = 'array' and b->>'s' is not null)
      limit 40`),
  );
  return rows.map((r) => r.name).filter(Boolean);
}

/** One batch: the next pages without a layout, from `around` on. Returns how many were done. */
async function batch(
  ctx: AppContext,
  resourceId: string,
  around: number,
  phrases: Running[],
  people: string[],
) {
  const rows = await withUser(db, ctx, (tx) =>
    tx
      .select({ id: bookPages.id, page: bookPages.page, content: bookPages.content })
      .from(bookPages)
      .where(
        and(
          eq(bookPages.userId, ctx.userId),
          eq(bookPages.resourceId, resourceId),
          isNull(bookPages.formatted),
        ),
      )
      // From the place being read onward, then the pages before it.
      .orderBy(sql`(${bookPages.page} < ${around})`, asc(bookPages.page))
      .limit(BATCH),
  );
  if (!rows.length) return 0;
  const text = (r: (typeof rows)[number]) => stripRunning(r.content, r.page, phrases);
  const known = people.length ? `PEOPLE IN THIS BOOK: ${people.join(", ")}\n\n` : "";
  const res = await generate(
    [
      {
        role: "user",
        parts: [
          {
            text: `${known}${rows.map((r) => `=== PAGE ${r.page} ===\n${text(r)}`).join("\n\n")}`,
          },
        ],
      },
    ],
    {
      systemInstruction: PROMPT,
      temperature: 0,
      maxOutputTokens: 16_000,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      thinkingConfig: { thinkingBudget: 512 },
    },
    { timeoutMs: 90_000, patient: true },
  );
  let made: { page: number; blocks: BookBlock[] }[] = [];
  try {
    made = JSON.parse(res.text ?? "[]");
  } catch {
    /* every page below keeps the plain layout */
  }
  await withUser(db, ctx, async (tx) => {
    for (const r of rows) {
      const m = made.find((x) => x.page === r.page)?.blocks;
      const ok = m?.length && keepsWords(text(r), m);
      await tx
        .update(bookPages)
        .set({ formatted: ok ? m : blocksFromParas(reflow(text(r))) })
        .where(eq(bookPages.id, r.id));
    }
  });
  return rows.length;
}

/** Works through the book until `budgetMs` is spent; never throws. */
export async function formatBook(
  ctx: AppContext,
  resourceId: string,
  opts: { around?: number; budgetMs?: number } = {},
) {
  if (!isAiConfigured()) return 0;
  const end = Date.now() + (opts.budgetMs ?? 0);
  let done = 0;
  try {
    const all = await withUser(db, ctx, (tx) =>
      tx
        .select({ page: bookPages.page, content: bookPages.content })
        .from(bookPages)
        .where(and(eq(bookPages.userId, ctx.userId), eq(bookPages.resourceId, resourceId))),
    );
    const phrases = runningPhrases(all);
    const people = await peopleOf(ctx, resourceId);
    do {
      if (!(await hitRateLimit(db, `format:${ctx.userId}`, 400, 86_400)).allowed) break;
      const n = await batch(ctx, resourceId, opts.around ?? 1, phrases, people);
      if (!n) break;
      done += n;
    } while (Date.now() < end);
  } catch (err) {
    console.error(
      "[nodinest] book layout:",
      err instanceof Error ? err.message.slice(0, 160) : err,
    );
  }
  return done;
}

/** From the cron: goes on with one book that is not finished. */
export async function formatWaiting() {
  const [next] = await db
    .select({ userId: bookPages.userId, resourceId: bookPages.resourceId })
    .from(bookPages)
    .where(isNull(bookPages.formatted))
    .limit(1);
  if (next) await formatBook({ userId: next.userId, role: "user" }, next.resourceId);
}
