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
import { LOCALES } from "@/i18n/config";

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
  /** null / omitted = every important question the material supports. */
  count: z.number().int().min(1).max(200).nullish(),
  focus: z.string().trim().max(500).default(""),
  deck: z.string().trim().max(120).optional(),
  locale: z.enum(LOCALES).default("uz"),
  /**
   * "deep": smaller parts studied closely, harder exam-level questions, and
   * every card checked against the material afterwards (fixed or dropped).
   */
  depth: z.enum(["standard", "deep"]).default("standard"),
});

export const CARD_KINDS = [
  "understanding",
  "recall",
  "term",
  "person",
  "date",
  "application",
  "quote",
] as const;

const CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: [...CARD_KINDS] },
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
          explanation: { type: Type.STRING },
          source: { type: Type.STRING, description: "e.g. p. 12, 14:30 (konspekt), my notes" },
        },
        required: ["kind", "question", "answer"],
      },
    },
  },
  required: ["cards"],
};

type GenCard = {
  kind: string;
  question: string;
  answer: string;
  explanation?: string;
  source?: string;
};

const DEEP_RULES = [
  "DEEP MODE — the user wants an exam-level, very accurate set:",
  "- Go beyond surface recall: ask why / how, causes and consequences, the author's reasoning and evidence, comparisons, distinctions between similar ideas, exceptions and conditions, and what follows from an idea.",
  "- Capture precise details exactly as the material gives them: full names, titles, dates, numbers, places, definitions, the wording of key terms; ask about each important one.",
  "- Every answer must be directly supported by the material. If the material is ambiguous, do not ask about it. Never guess.",
  "- 'source' must point to where it is said (p. N, a time, 'my notes') and, when possible, quote a few exact words of the supporting passage in «».",
].join("\n");

const VERIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          n: { type: Type.INTEGER },
          verdict: { type: Type.STRING, enum: ["ok", "fix", "drop"] },
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
        required: ["n", "verdict"],
      },
    },
  },
  required: ["results"],
};

/**
 * Deep mode's second pass: each card is checked against the same material.
 * Wrong or unsupported answers are corrected ("fix") or removed ("drop");
 * vague or trivial questions are dropped. On failure the cards are kept.
 */
async function verifyCards(text: string, cards: GenCard[], locale: string): Promise<GenCard[]> {
  if (!cards.length) return cards;
  const list = cards
    .map(
      (c, i) =>
        `#${i + 1} Q: ${c.question}\nA: ${c.answer}${c.source ? `\nSOURCE: ${c.source}` : ""}`,
    )
    .join("\n\n");
  try {
    const res = await generate(
      [{ role: "user", parts: [{ text: `${text}\n\nCARDS TO CHECK\n${list}` }] }],
      {
        systemInstruction: [
          "You are a meticulous fact-checker for study cards. Compare EVERY card with the material above.",
          "verdict 'ok': the question is clear and the answer is fully correct and supported by the material.",
          "verdict 'fix': the card is worth keeping but the answer is incomplete, imprecise or partly wrong (or the question is ambiguous) — return the corrected 'question' and 'answer', using only the material.",
          "verdict 'drop': the answer is not supported by the material, the question is trivial, duplicated, or about something outside the work.",
          "Check names, dates, numbers and term meanings character by character against the material.",
          "Also 'fix' a question or answer that mentions 'the material', 'the text', 'my notes', 'the taqriz' or 'the transcript' — ask about the subject itself.",
          langRule(locale),
        ].join("\n"),
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: VERIFY_SCHEMA,
        thinkingConfig: { thinkingBudget: 2048 },
      },
      { timeoutMs: 100_000 },
    );
    const results =
      (
        JSON.parse(res.text ?? "{}") as {
          results?: { n: number; verdict: string; question?: string; answer?: string }[];
        }
      ).results ?? [];
    if (!results.length) return cards;
    const byN = new Map(results.map((r) => [r.n, r]));
    return cards.flatMap((c, i) => {
      const r = byN.get(i + 1);
      if (!r || r.verdict === "ok") return [c];
      if (r.verdict === "drop") return [];
      return [
        {
          ...c,
          question: r.question?.trim() || c.question,
          answer: r.answer?.trim() || c.answer,
        },
      ];
    });
  } catch {
    return cards;
  }
}

const SYSTEM = (want: string, locale: string, focus: string, deep = false) =>
  [
    "You are an outstanding teacher and examiner. Study this part of the material deeply — the whole context, not single sentences — and write the questions that would really be asked in a good test or oral exam on this topic, so the user understands it and remembers it.",
    want,
    deep ? DEEP_RULES : "",
    "Cover, wherever the material has them:",
    "- the central ideas, arguments and conclusions; why / how something happens (causes, reasons, evidence, consequences); how ideas connect or differ (understanding);",
    "- essential facts and events (recall);",
    "- key terms and difficult or foreign words: their meaning, translation and origin (term) — e.g. Arabic, Persian, Russian or English words used in the text;",
    "- people: who they are, what they did or said (person);",
    "- important dates, years, periods and numbers and what happened then (date);",
    "- applying or comparing an idea (application); memorable key quotes — who said it and what it means (quote).",
    "Each question asks one clear thing; the answer is complete but short (1–4 sentences or a short list) so it can be checked from memory. Add an 'explanation' only when it helps remembering (context, a mnemonic, an example).",
    "Ask about the subject itself, as a teacher would: never mention 'my notes', 'the taqriz', 'the transcript', 'the material' or 'the text' in a question or answer (that belongs in 'source').",
    "Use ONLY the material and well-established facts it relies on; never invent facts, quotes, page numbers or times. 'source' says where the answer is (p. N, a time like 12:30, 'my notes', 'my taqriz').",
    "Ignore parts that clearly do not belong to the work (pasted by mistake, test text, another topic). Skip trivia (page counts, publication details). Do not repeat or rephrase the EXISTING questions.",
    focus ? `Focus: ${focus}` : "",
    langRule(locale),
  ]
    .filter(Boolean)
    .join("\n");

/** "p. my notes" → "my notes": "p." only belongs before a page number. */
function cleanSource(v: string | undefined): string | null {
  const t = v
    ?.trim()
    .replace(/^p\.\s*(?=\D)/i, "")
    .slice(0, 200);
  return t || null;
}

/** Splits text at paragraph breaks into pieces of about `size` characters. */
function chunks(text: string, size: number) {
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n{2,}/)) {
    if (cur && cur.length + para.length > size) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n\n" : "") + para.slice(0, size * 1.5);
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Word set used to drop near-duplicate questions from parallel parts. */
const words = (q: string) =>
  new Set(
    q
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
function similar(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.max(1, Math.min(a.size, b.size));
}

const CHUNK = 24_000;
const MAX_PARTS = 8;
// Deep mode: smaller parts get closer reading (and are checked afterwards).
const DEEP_CHUNK = 14_000;
const DEEP_MAX_PARTS = 10;

/**
 * Makes cards from one or more resources and saves them into a deck. The
 * material is split into parts that are studied in parallel (fast even for a
 * whole book or a long konspekt); near-duplicates are removed afterwards.
 */
export async function generateCards(ctx: AppContext, raw: unknown) {
  const a = generateInput.parse(raw);
  const deep = a.depth === "deep";
  const size = deep ? DEEP_CHUNK : CHUNK;
  const maxParts = deep ? DEEP_MAX_PARTS : MAX_PARTS;
  await gate(ctx, "cards");
  const per = Math.floor(MAX_MATERIAL / a.resourceIds.length);
  const mats = await Promise.all(a.resourceIds.map((id) => material(ctx, id, per)));
  const existing = await withUser(db, ctx, (tx) =>
    tx
      .select({ q: studyCards.question })
      .from(studyCards)
      .where(and(eq(studyCards.userId, ctx.userId), inArray(studyCards.resourceId, a.resourceIds)))
      .limit(300),
  );

  // Parts: each starts with its work's facts so every part knows the context.
  let parts = mats.flatMap((m, wi) => {
    const [head, ...rest] = m.text.split("\n\n");
    const body = rest.join("\n\n");
    return (body ? chunks(body, size) : [""]).map((c) => ({ wi, text: `${head}\n\n${c}` }));
  });
  if (parts.length > maxParts) {
    // Too long: merge neighbours of the same work until it fits.
    const merged: typeof parts = [];
    const step = Math.ceil(parts.length / maxParts);
    for (let i = 0; i < parts.length; i += step) {
      const g = parts.slice(i, i + step);
      merged.push({
        wi: g[0].wi,
        text: g
          .map((x) => x.text)
          .join("\n\n")
          .slice(0, size * 2),
      });
    }
    parts = merged;
  }
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  const existingText = existing.length
    ? `EXISTING QUESTIONS\n${existing.map((e) => `- ${e.q}`).join("\n")}`
    : "";

  const runPart = async (p: (typeof parts)[number]) => {
    // Deep mode asks a little more per part: the check afterwards drops some.
    const share = a.count
      ? Math.max(1, Math.ceil((a.count * p.text.length * (deep ? 1.25 : 1)) / total) + 1)
      : null;
    const want = share
      ? `Write about ${share} questions for this part.`
      : deep
        ? "Write EVERY question a demanding examiner would ask about this part — as many as the content truly supports (often 15–40), no filler."
        : "Write EVERY question that is genuinely important for this part — as many as the content deserves (often 8–30), no filler.";
    const res = await generate(
      [{ role: "user", parts: [{ text: [p.text, existingText].filter(Boolean).join("\n\n") }] }],
      {
        systemInstruction: SYSTEM(want, a.locale, a.focus, deep),
        temperature: deep ? 0.2 : 0.3,
        responseMimeType: "application/json",
        responseSchema: CARD_SCHEMA,
        thinkingConfig: { thinkingBudget: deep ? 4096 : 1024 },
      },
      { timeoutMs: 100_000 },
    );
    let cards: GenCard[];
    try {
      cards = (JSON.parse(res.text ?? "{}") as { cards?: GenCard[] }).cards ?? [];
    } catch {
      return [];
    }
    if (deep) cards = await verifyCards(p.text, cards, a.locale);
    return cards.map((c) => ({ ...c, wi: p.wi }));
  };
  // A few requests at once (free-tier rate limits).
  const width = deep ? 5 : 4;
  const results: (GenCard & { wi: number })[][] = [];
  for (let i = 0; i < parts.length; i += width)
    results.push(
      ...(await Promise.all(parts.slice(i, i + width).map((p) => runPart(p).catch(() => [])))),
    );

  // Interleave parts (spread over the whole work), drop near-duplicates.
  const flat: (GenCard & { wi: number })[] = [];
  for (let i = 0; results.some((r) => r[i]); i++)
    for (const r of results) if (r[i]) flat.push(r[i]);
  const seen = existing.map((e) => words(e.q));
  let cards = flat.filter((c) => {
    if (!c.question?.trim() || !c.answer?.trim()) return false;
    const w = words(c.question);
    if (seen.some((s) => similar(s, w) > 0.8)) return false;
    seen.push(w);
    return true;
  });
  cards = cards.slice(0, a.count ?? 200);
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
          resourceId: a.resourceIds[c.wi] ?? a.resourceIds[0],
          deck,
          question: c.question.trim().slice(0, 2000),
          answer: c.answer.trim().slice(0, 4000),
          explanation: c.explanation?.trim().slice(0, 2000) || null,
          source: cleanSource(c.source),
          kind: (CARD_KINDS as readonly string[]).includes(c.kind) ? c.kind : "recall",
        })),
      )
      .returning({ id: studyCards.id, question: studyCards.question, answer: studyCards.answer }),
  );
  return {
    deck,
    deep,
    created: rows.length,
    parts: parts.length,
    thinMaterial: mats.some((m) => !m.hasOwn),
    sample: rows.slice(0, 50).map((r) => ({ q: r.question, a: r.answer })),
  };
}

export const improveInput = z.object({
  deck: z.string().trim().min(1).max(120),
  instruction: z.string().trim().max(800).default(""),
  locale: z.enum(LOCALES).default("uz"),
});

/** Rewrites a deck's cards to be sharper (review progress is kept). */
export async function improveCards(ctx: AppContext, raw: unknown) {
  const a = improveInput.parse(raw);
  await gate(ctx, "cards");
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
