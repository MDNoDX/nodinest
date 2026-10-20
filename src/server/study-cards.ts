/**
 * Study cards: important questions made from the user's own material and
 * reviewed with spaced repetition, so what was read / heard is remembered.
 *
 * Generation reads, per resource: its facts, the user's notes and quotes,
 * finished transcripts / konspekts of its video, the taqriz and the indexed
 * book text. The AI is asked for the questions a good teacher would ask —
 * core ideas, reasons, connections, definitions, application, key quotes —
 * with complete, checkable answers and where they come from. Nothing outside
 * the material is presented as fact; existing questions are not repeated.
 */
import "server-only";
import { Type } from "@google/genai";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { studyCards } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { schedule, type Grade } from "@/lib/srs";
import { generate } from "./ai/gemini";
import { factsText, gate, langRule, resourceFacts } from "./ai/study";

const MAX_MATERIAL = 120_000;

async function material(ctx: AppContext, resourceId: string, budget: number) {
  const facts = await resourceFacts(ctx, resourceId);
  const [notes, trs, w, pages] = await withUser(db, ctx, (tx) =>
    Promise.all([
      tx.execute<{
        kind: string;
        quote_text: string | null;
        title: string | null;
        body: string | null;
        page_from: number | null;
      }>(sql`
        select kind::text as kind, quote_text, title, body, page_from from nodinest.notes
        where user_id = ${ctx.userId} and resource_id = ${resourceId} and deleted_at is null
        order by page_from asc nulls last, created_at asc limit 80`),
      tx.execute<{ mode: string; text: string }>(sql`
        select mode, text from nodinest.transcripts
        where user_id = ${ctx.userId} and resource_id = ${resourceId} and status = 'done' and text is not null
        order by updated_at desc limit 2`),
      tx.execute<{ plain: string }>(sql`
        select plain from nodinest.writeups where user_id = ${ctx.userId} and resource_id = ${resourceId}`),
      tx.execute<{ page: number; content: string }>(sql`
        select page, content from nodinest.book_pages
        where user_id = ${ctx.userId} and resource_id = ${resourceId}
        order by page asc limit 400`),
    ]),
  );
  const parts: string[] = [`### WORK: ${facts.title}\n${factsText(facts)}`];
  if (notes.length)
    parts.push(
      `MY NOTES AND QUOTES\n${notes
        .map((n) =>
          n.kind === "quote"
            ? `- QUOTE${n.page_from ? ` (p. ${n.page_from})` : ""}: «${n.quote_text}»${n.body ? ` — ${n.body}` : ""}`
            : `- NOTE: ${[n.title, n.body].filter(Boolean).join(": ")}`,
        )
        .join("\n")}`,
    );
  for (const t of trs)
    parts.push(`${t.mode === "notes" ? "KONSPEKT" : "TRANSCRIPT"} OF ITS RECORDING\n${t.text}`);
  if (w[0]?.plain?.trim()) parts.push(`MY TAQRIZ\n${w[0].plain}`);
  let text = parts.join("\n\n").slice(0, budget);
  // Book text fills what is left of the budget (page-tagged for sources).
  if (pages.length && text.length < budget - 2000) {
    let book = "BOOK TEXT";
    for (const p of pages) {
      const chunk = `\n[p. ${p.page}] ${p.content.replace(/\s+/g, " ").trim()}`;
      if (text.length + book.length + chunk.length > budget) break;
      book += chunk;
    }
    text += `\n\n${book}`;
  }
  return {
    title: facts.title,
    text,
    hasOwn: notes.length + trs.length + (w[0] ? 1 : 0) + pages.length > 0,
  };
}

export const generateInput = z.object({
  resourceIds: z.array(z.string().uuid()).min(1).max(8),
  count: z.number().int().min(3).max(50).default(15),
  focus: z.string().trim().max(500).default(""),
  deck: z.string().trim().max(120).optional(),
  locale: z.enum(["uz", "en"]).default("uz"),
});

const CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          work: { type: Type.INTEGER, description: "Number of the WORK it is about (1-based)" },
          kind: { type: Type.STRING, enum: ["recall", "understanding", "application", "quote"] },
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
          explanation: { type: Type.STRING },
          source: { type: Type.STRING, description: "e.g. p. 12, 14:30 (konspekt), my notes" },
        },
        required: ["work", "kind", "question", "answer"],
      },
    },
  },
  required: ["cards"],
};

type GenCard = {
  work: number;
  kind: string;
  question: string;
  answer: string;
  explanation?: string;
  source?: string;
};

const SYSTEM = (count: number, locale: string, focus: string) =>
  [
    `You are an excellent teacher preparing ${count} study questions so the user deeply understands and remembers the WORKS below.`,
    "Choose the most important things, the ones a strong exam or a thoughtful discussion would ask about: the central ideas and arguments, why something is so (causes, reasons, evidence), how ideas connect or differ, key terms with their meaning, important people / events / numbers only when they matter, how to apply an idea, and memorable key quotes (who said it / what it means).",
    "Mix the kinds: about 35% understanding (why / how / explain), 30% recall of essential facts and terms, 20% application or comparison, 15% quotes. Order them from the foundations to the details.",
    "Each question asks one clear thing and can be answered from the material. Each answer is complete but short (1–4 sentences, or a short list), so it can be checked from memory; add an 'explanation' only when context helps remembering (a mnemonic, the connection, an example).",
    "Use ONLY the material. Never invent facts, quotes, page numbers or times; 'source' says where the answer is (p. N, a time like 12:30 from the konspekt, 'my notes', 'my taqriz').",
    "Ask about the subject itself, as a teacher would: never mention 'my notes', 'the taqriz', 'the transcript', 'the material' or 'the text' inside a question or answer (that belongs in 'source' only).",
    "Ignore parts of the material that clearly do not belong to the work (pasted by mistake, test text, another topic).",
    "Do not ask trivia (page counts, publication details) unless important; do not repeat or rephrase the EXISTING questions.",
    focus ? `Focus: ${focus}` : "",
    langRule(locale),
  ]
    .filter(Boolean)
    .join("\n");

/** Makes cards from one or more resources and saves them into a deck. */
export async function generateCards(ctx: AppContext, raw: unknown) {
  const a = generateInput.parse(raw);
  await gate(ctx, "ask");
  const per = Math.floor(MAX_MATERIAL / a.resourceIds.length);
  const mats = await Promise.all(a.resourceIds.map((id) => material(ctx, id, per)));
  const existing = await withUser(db, ctx, (tx) =>
    tx
      .select({ q: studyCards.question })
      .from(studyCards)
      .where(and(eq(studyCards.userId, ctx.userId), inArray(studyCards.resourceId, a.resourceIds)))
      .limit(300),
  );
  const prompt = [
    mats.map((m, i) => `## WORK ${i + 1}\n${m.text}`).join("\n\n"),
    existing.length ? `EXISTING QUESTIONS\n${existing.map((e) => `- ${e.q}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await generate(
    [{ role: "user", parts: [{ text: prompt }] }],
    {
      systemInstruction: SYSTEM(a.count, a.locale, a.focus),
      temperature: 0.4,
      responseMimeType: "application/json",
      responseSchema: CARD_SCHEMA,
      thinkingConfig: { thinkingBudget: 4096 },
    },
    { timeoutMs: 110_000 },
  );
  let cards: GenCard[] = [];
  try {
    cards = (JSON.parse(res.text ?? "{}") as { cards?: GenCard[] }).cards ?? [];
  } catch {
    throw new AppError("AI_UNAVAILABLE", "bad_json");
  }
  cards = cards.filter((c) => c.question?.trim() && c.answer?.trim()).slice(0, a.count);
  if (!cards.length) throw new AppError("AI_UNAVAILABLE", "no_cards");
  const deck =
    a.deck ||
    (mats.length === 1 ? mats[0].title : mats.map((m) => m.title).join(" + ")).slice(0, 120);
  const rows = await withUser(db, ctx, (tx) =>
    tx
      .insert(studyCards)
      .values(
        cards.map((c) => ({
          userId: ctx.userId,
          resourceId: a.resourceIds[Math.min(Math.max(1, c.work || 1), a.resourceIds.length) - 1],
          deck,
          question: c.question.trim().slice(0, 2000),
          answer: c.answer.trim().slice(0, 4000),
          explanation: c.explanation?.trim().slice(0, 2000) || null,
          source: c.source?.trim().slice(0, 200) || null,
          kind: ["recall", "understanding", "application", "quote"].includes(c.kind)
            ? c.kind
            : "recall",
        })),
      )
      .returning({ id: studyCards.id, question: studyCards.question, answer: studyCards.answer }),
  );
  return {
    deck,
    created: rows.length,
    thinMaterial: mats.some((m) => !m.hasOwn),
    sample: rows.slice(0, 50).map((r) => ({ q: r.question, a: r.answer })),
  };
}

export const improveInput = z.object({
  deck: z.string().trim().min(1).max(120),
  instruction: z.string().trim().max(800).default(""),
  locale: z.enum(["uz", "en"]).default("uz"),
});

/** Rewrites a deck's cards to be sharper (review progress is kept). */
export async function improveCards(ctx: AppContext, raw: unknown) {
  const a = improveInput.parse(raw);
  await gate(ctx, "ask");
  const cards = await withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(studyCards)
      .where(and(eq(studyCards.userId, ctx.userId), eq(studyCards.deck, a.deck)))
      .orderBy(asc(studyCards.createdAt))
      .limit(80),
  );
  if (!cards.length) throw new AppError("NOT_FOUND");
  const ids = [...new Set(cards.map((c) => c.resourceId).filter((x): x is string => !!x))].slice(
    0,
    4,
  );
  const mats = await Promise.all(
    ids.map((id) => material(ctx, id, Math.floor(80_000 / Math.max(1, ids.length)))),
  );
  const res = await generate(
    [
      {
        role: "user",
        parts: [
          {
            text: [
              mats.map((m, i) => `## WORK ${i + 1}\n${m.text}`).join("\n\n"),
              `CARDS\n${cards.map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`).join("\n")}`,
            ].join("\n\n"),
          },
        ],
      },
    ],
    {
      systemInstruction: [
        "Improve these study cards so they are the best possible for understanding and remembering the material.",
        "For each card (same number, same order): make the question precise and important (one thing, no ambiguity), make the answer complete, correct per the material and easy to check; add a short explanation / mnemonic when it helps; fix the source if the material shows it.",
        "Keep every card (do not drop or merge). Never invent facts. Questions are about the subject itself — never mention 'notes', 'taqriz', 'transcript' or 'the material' in them.",
        a.instruction ? `The user asks: ${a.instruction}` : "",
        langRule(a.locale),
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                n: { type: Type.INTEGER },
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                source: { type: Type.STRING },
              },
              required: ["n", "question", "answer"],
            },
          },
        },
        required: ["cards"],
      },
      thinkingConfig: { thinkingBudget: 4096 },
    },
    { timeoutMs: 110_000 },
  );
  const better =
    (JSON.parse(res.text ?? "{}") as { cards?: (Omit<GenCard, "work" | "kind"> & { n: number })[] })
      .cards ?? [];
  let changed = 0;
  await withUser(db, ctx, async (tx) => {
    for (const b of better) {
      const c = cards[b.n - 1];
      if (!c || !b.question?.trim() || !b.answer?.trim()) continue;
      await tx
        .update(studyCards)
        .set({
          question: b.question.trim().slice(0, 2000),
          answer: b.answer.trim().slice(0, 4000),
          explanation: b.explanation?.trim().slice(0, 2000) || c.explanation,
          source: b.source?.trim().slice(0, 200) || c.source,
          updatedAt: new Date(),
        })
        .where(and(eq(studyCards.id, c.id), eq(studyCards.userId, ctx.userId)));
      changed++;
    }
  });
  return { deck: a.deck, improved: changed };
}

// ── Decks and review ──────────────────────────────────────────────────────

export async function listDecks(ctx: AppContext) {
  return withUser(db, ctx, (tx) =>
    tx.execute<{
      deck: string;
      total: number;
      due: number;
      learned: number;
      resource_id: string | null;
    }>(sql`
      select deck, count(*)::int as total,
        count(*) filter (where due_at <= now() and not suspended)::int as due,
        count(*) filter (where reps >= 2)::int as learned,
        (array_agg(resource_id))[1] as resource_id
      from nodinest.study_cards where user_id = ${ctx.userId}
      group by deck order by max(created_at) desc`),
  );
}

export async function listCards(ctx: AppContext, deck: string) {
  return withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(studyCards)
      .where(and(eq(studyCards.userId, ctx.userId), eq(studyCards.deck, deck)))
      .orderBy(asc(studyCards.createdAt)),
  );
}

/** Due cards first (oldest due), optionally from one deck. */
export async function dueCards(ctx: AppContext, opts: { deck?: string | null; limit?: number }) {
  return withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(studyCards)
      .where(
        and(
          eq(studyCards.userId, ctx.userId),
          eq(studyCards.suspended, false),
          lte(studyCards.dueAt, new Date()),
          opts.deck ? eq(studyCards.deck, opts.deck) : undefined,
        ),
      )
      .orderBy(asc(studyCards.dueAt))
      .limit(Math.min(opts.limit ?? 50, 200)),
  );
}

export async function reviewCard(ctx: AppContext, id: string, grade: Grade) {
  return withUser(db, ctx, async (tx) => {
    const [c] = await tx
      .select()
      .from(studyCards)
      .where(and(eq(studyCards.id, id), eq(studyCards.userId, ctx.userId)));
    if (!c) throw new AppError("NOT_FOUND");
    const n = schedule(c, grade);
    const now = new Date();
    await tx
      .update(studyCards)
      .set({
        ease: n.ease,
        intervalDays: n.intervalDays,
        reps: n.reps,
        lapses: c.lapses + (n.lapse ? 1 : 0),
        lastReviewedAt: now,
        dueAt: new Date(now.getTime() + n.intervalDays * 86_400_000),
        updatedAt: now,
      })
      .where(eq(studyCards.id, id));
    return { intervalDays: n.intervalDays };
  });
}

export const cardInput = z.object({
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1).max(4000),
  explanation: z.string().trim().max(2000).nullish(),
  source: z.string().trim().max(200).nullish(),
});

export async function updateCard(ctx: AppContext, id: string, raw: unknown) {
  const a = cardInput.parse(raw);
  await withUser(db, ctx, (tx) =>
    tx
      .update(studyCards)
      .set({
        ...a,
        explanation: a.explanation || null,
        source: a.source || null,
        updatedAt: new Date(),
      })
      .where(and(eq(studyCards.id, id), eq(studyCards.userId, ctx.userId))),
  );
}

export async function addCard(ctx: AppContext, deck: string, raw: unknown) {
  const a = cardInput.parse(raw);
  const d = z.string().trim().min(1).max(120).parse(deck);
  const [first] = await withUser(db, ctx, (tx) =>
    tx
      .select({ resourceId: studyCards.resourceId })
      .from(studyCards)
      .where(and(eq(studyCards.userId, ctx.userId), eq(studyCards.deck, d)))
      .limit(1),
  );
  await withUser(db, ctx, (tx) =>
    tx.insert(studyCards).values({
      userId: ctx.userId,
      resourceId: first?.resourceId ?? null,
      deck: d,
      ...a,
      explanation: a.explanation || null,
      source: a.source || null,
    }),
  );
}

export async function deleteCard(ctx: AppContext, id: string) {
  await withUser(db, ctx, (tx) =>
    tx.delete(studyCards).where(and(eq(studyCards.id, id), eq(studyCards.userId, ctx.userId))),
  );
}

export async function deleteDeck(ctx: AppContext, deck: string) {
  await withUser(db, ctx, (tx) =>
    tx.delete(studyCards).where(and(eq(studyCards.userId, ctx.userId), eq(studyCards.deck, deck))),
  );
}
