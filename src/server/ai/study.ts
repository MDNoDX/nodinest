/**
 * AI help while writing a taqriz:
 *  - askAboutSelection: explain the word / passage the user selected, using the
 *    resource's facts, the user's indexed book text and notes (no web search on
 *    the free tier, so the model must say when it does not know).
 *  - transcribeSegment: listen to one stretch of the video / audio being played
 *    (YouTube straight from its URL, other media as a clip recorded in the
 *    browser) and write it out verbatim or as a konspekt.
 * Both are owner-scoped, rate limited and never invent facts or quotes.
 */
import "server-only";
import {
  MediaResolution,
  type Content,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { AppError } from "@/lib/errors";
import { searchTokens } from "@/lib/normalize";
import { searchBookText } from "../booktext";
import { enforceRateLimit, hitRateLimit } from "../rate-limit";
import { limitsFor } from "../premium";
import { getAiSettings } from "../settings";
import { generate, isAiConfigured } from "./gemini";
import { LOCALES, aiLanguage, asLocale } from "@/i18n/config";

export async function gate(ctx: AppContext, bucket: "ask" | "listen" | "audiobook" | "cards") {
  if (!isAiConfigured()) throw new AppError("AI_UNAVAILABLE", "not_configured");
  const s = await getAiSettings(db);
  if (!s.enabled) throw new AppError("AI_UNAVAILABLE", "disabled");
  if (ctx.superadminAccount) return;
  if (s.pausedUntil && new Date(s.pausedUntil) > new Date()) throw new AppError("AI_QUOTA");
  // What the plan includes (free / premium, set by the admin: server/premium.ts).
  const plan = await limitsFor(ctx);
  if (bucket === "audiobook" && !plan.audiobook)
    throw new AppError("PREMIUM_REQUIRED", "audiobook");
  if (bucket === "cards" && !plan.studyCards) throw new AppError("PREMIUM_REQUIRED", "studyCards");
  if (bucket === "ask" || bucket === "cards") {
    await enforceRateLimit(db, `aiburst:${ctx.userId}`, 8, 60);
    const daily = await hitRateLimit(db, `ai:${ctx.userId}`, plan.aiDaily, 86_400);
    if (!daily.allowed)
      throw new AppError("RATE_LIMITED", undefined, {
        resetAt: daily.resetAt.toISOString(),
        premium: plan.premium,
      });
  } else if (bucket === "audiobook") {
    // One request per ~1.5-minute segment of an audiobook: about 3 hours a day.
    await enforceRateLimit(db, `abookburst:${ctx.userId}`, 10, 60);
    await enforceRateLimit(db, `abook:${ctx.userId}`, 120, 86_400);
  } else {
    // One request ≈ 1.5 minutes of video / audio: the plan's minutes a day
    // (free: about 10 minutes, premium: about 3 hours).
    await enforceRateLimit(db, `ailistenburst:${ctx.userId}`, 20, 60);
    const daily = await hitRateLimit(
      db,
      `ailisten:${ctx.userId}`,
      Math.max(1, Math.ceil(plan.listenMinutes / 1.5)),
      86_400,
    );
    if (!daily.allowed)
      throw new AppError("RATE_LIMITED", "listen", {
        resetAt: daily.resetAt.toISOString(),
        premium: plan.premium,
      });
  }
}

type ResourceFacts = {
  title: string;
  type: string;
  authors: string | null;
  description: string | null;
  original_date: string | null;
};

export async function resourceFacts(ctx: AppContext, id: string): Promise<ResourceFacts> {
  const [r] = await withUser(db, ctx, (tx) =>
    tx.execute<ResourceFacts>(sql`
      select r.title, r.type::text as type, r.description, r.original_date,
        (select string_agg(p.full_name, ', ' order by c.position)
           from nodinest.resource_contributors c join nodinest.people p on p.id = c.person_id
          where c.resource_id = r.id) as authors
      from nodinest.resources r where r.id = ${id} and r.deleted_at is null`),
  );
  if (!r) throw new AppError("NOT_FOUND");
  return r;
}

export const factsText = (r: ResourceFacts) =>
  [
    `Title: ${r.title}`,
    `Type: ${r.type}`,
    r.authors && `Authors / speakers: ${r.authors}`,
    r.original_date && `Date: ${r.original_date}`,
    r.description && `Description: ${r.description.slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n");

export const langRule = (locale: string) => `Answer in ${aiLanguage(asLocale(locale))}.`;

// ── Ask about the selection ───────────────────────────────────────────────

export const askInput = z
  .object({
    resourceId: z.string().uuid(),
    /** "book": asked while reading the book itself (Kitobni o'qish), not in a taqriz. */
    from: z.enum(["taqriz", "book"]).default("taqriz"),
    /** The page being read (book mode): no spoilers beyond it unless asked. */
    page: z.number().int().min(1).max(100_000).optional(),
    selection: z.string().trim().max(4000).default(""),
    context: z.string().max(4000).default(""),
    question: z.string().trim().max(1000).default(""),
    history: z
      .array(z.object({ q: z.string().max(1500), a: z.string().max(6000) }))
      .max(6)
      .default([]),
    locale: z.enum(LOCALES).default("uz"),
  })
  .refine((a) => a.selection || a.question, { message: "required", path: ["selection"] });

/** Everything a request needs (also used by the streaming route). */
export type Prepared = {
  contents: Content[];
  config: GenerateContentConfig;
  timeoutMs: number;
  meta: Record<string, unknown>;
};

export async function askAboutSelection(ctx: AppContext, raw: unknown) {
  const p = await prepareAsk(ctx, raw);
  const res = await generate(p.contents, p.config, { timeoutMs: p.timeoutMs });
  const answer = (res.text ?? "").trim();
  if (!answer) throw new AppError("AI_UNAVAILABLE", "empty");
  return { answer, ...(p.meta as { pages: { page: number; snippet: string }[] }) };
}

export async function prepareAsk(ctx: AppContext, raw: unknown): Promise<Prepared> {
  const a = askInput.parse(raw);
  await gate(ctx, "ask");
  const facts = await resourceFacts(ctx, a.resourceId);
  // The user's own book text (if indexed) is the best source for this book.
  const book = a.from === "book";
  const query = searchTokens(a.selection || a.question, 6).join(" ");
  const pages = query
    ? (await searchBookText(ctx, { query, resourceId: a.resourceId, limit: 4 })).hits
    : [];
  const system = [
    book
      ? "You are NodiNote's reading companion. The user is reading this book and selected a word or passage, or asks about the book. Help them understand it deeply."
      : "You are NodiNote's study assistant. The user is writing a taqriz (a review / study essay) and selected a word or passage. Help them understand it deeply.",
    book
      ? "Explain: the meaning (for a single word also its translation, origin and nuances), who the people and places mentioned are, the context (historical, literary, cultural), and how it connects to the story so far. If the book is in another language than the user's, translate the passage when it helps."
      : "Explain: the meaning (for a single word also its origin and nuances), the context it comes from (historical, literary, religious, scientific or terminological), how it connects to this work and its author, and anything worth noting for the essay.",
    book && a.page
      ? `The user is on page ${a.page}. Do NOT reveal what happens later in the book (no spoilers) unless they explicitly ask for it.`
      : "",
    "Use the book passages below when relevant and cite them as (p. N). Use your general knowledge for the rest.",
    "Be honest: never invent quotes, dates, page numbers, sources or facts. When you are not sure, say so plainly instead of guessing.",
    "Be concise (about 120–250 words unless the user asks for more). Format: short paragraphs, '- ' bullets, **bold** for key terms. No headings, no preamble.",
    langRule(a.locale),
  ]
    .filter(Boolean)
    .join("\n");
  const material = [
    `WORK\n${factsText(facts)}`,
    pages.length
      ? `BOOK PASSAGES (user's copy)\n${pages.map((p) => `(p. ${p.page}) ${p.snippet}`).join("\n")}`
      : "",
    a.context
      ? book
        ? `THE PAGE BEING READ${a.page ? ` (p. ${a.page})` : ""}\n${a.context}`
        : `SURROUNDING TEXT IN THE USER'S ESSAY\n${a.context}`
      : "",
    a.selection ? `SELECTED\n«${a.selection}»` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const contents = [
    { role: "user" as const, parts: [{ text: material }] },
    ...a.history.flatMap((h) => [
      { role: "user" as const, parts: [{ text: h.q }] },
      { role: "model" as const, parts: [{ text: h.a }] },
    ]),
    {
      role: "user" as const,
      parts: [{ text: a.question || "Explain the selected text." }],
    },
  ];
  return {
    contents,
    config: {
      systemInstruction: system,
      temperature: 0.3,
      thinkingConfig: { thinkingBudget: 1024 },
    },
    timeoutMs: 50_000,
    meta: { pages: pages.map((p) => ({ page: p.page, snippet: p.snippet })) },
  };
}

// ── Listen and write ──────────────────────────────────────────────────────

const YT_ID = /^[\w-]{11}$/;
const CLIP_MIME = /^audio\/(webm|ogg|mp4|mpeg|wav)(;.*)?$/;

export const segmentInput = z
  .object({
    resourceId: z.string().uuid(),
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("youtube"), id: z.string().regex(YT_ID) }),
      z.object({
        kind: z.literal("clip"),
        mime: z.string().regex(CLIP_MIME),
        // ≈ 2 minutes of compressed speech; server actions accept 2 MB.
        data: z.string().max(1_600_000),
      }),
    ]),
    from: z.number().min(0).max(86_400),
    to: z.number().min(1).max(86_400),
    mode: z.enum(["transcript", "notes"]),
    deep: z.boolean().default(true),
    previous: z.string().max(2000).default(""),
    locale: z.enum(LOCALES).default("uz"),
  })
  .refine((v) => v.to > v.from && v.to - v.from <= 180, { message: "segment_length" });

export const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

export async function transcribeSegment(ctx: AppContext, raw: unknown) {
  const a = segmentInput.parse(raw);
  await gate(ctx, "listen");
  const facts = await resourceFacts(ctx, a.resourceId);
  const media: Part =
    a.source.kind === "youtube"
      ? {
          fileData: { fileUri: `https://www.youtube.com/watch?v=${a.source.id}` },
          videoMetadata: {
            startOffset: `${Math.floor(a.from)}s`,
            endOffset: `${Math.ceil(a.to)}s`,
            fps: 0.2,
          },
        }
      : { inlineData: { mimeType: a.source.mime.split(";")[0], data: a.source.data } };
  const range =
    a.source.kind === "youtube"
      ? `the clip (${clock(a.from)}–${clock(a.to)} of the recording)`
      : `this recording (it is ${clock(a.from)}–${clock(a.to)} of the full recording)`;

  const common = [
    `You listen to ${range} of the work below and write it down for the user's study notes.`,
    "Understand the speech deeply before writing: use the topic, the work's facts, the previous text and the speaker's own vocabulary to resolve words that are hard to hear. Names, terms and quotations must be spelled correctly.",
    "Arabic, Persian or other foreign quotations: write them in the conventional Uzbek Latin transliteration (or the original language's usual Latin form for English output) as they are pronounced.",
    "Never invent words, facts or quotes. If a word stays truly unclear after thinking, write your best reading followed by [?]. If there is no speech, output nothing.",
    "Do not repeat text that is already in PREVIOUS; continue from where it ends. A sentence cut off at the clip start or end may be completed only if it is clearly audible.",
  ];
  const system =
    a.mode === "transcript"
      ? [
          ...common,
          "Write a faithful transcript in the language that is spoken — NEVER translate and never summarize; every sentence said must be there (Uzbek: the new Latin alphabet of the 2026 law — ö, ğ, ş, ç, ʼ). On-screen text may only help to spell names; do not read it out.",
          "Keep the speaker's words, word order and style. Fix only spelling, punctuation, capitalization and sentence boundaries according to the language's grammar; drop filler sounds (eee, hmm), stutters and false starts.",
          "One paragraph per thought, separated by a blank line. Output only the transcript text: no timestamps, no headings, no comments.",
        ].join("\n")
      : [
          ...common,
          "Write a konspekt (structured study notes) of what is said, not a transcript.",
          "Capture every substantive idea, argument, example, definition, number, name and recommendation, in the speaker's order. Skip greetings and filler.",
          "Format: '- ' bullets (one idea each, a full clear sentence), nested '  - ' for details, **bold** for key terms, exact quotations in «…». No headings.",
          langRule(a.locale),
        ].join("\n");

  const material = [
    `WORK\n${factsText(facts)}`,
    a.previous ? `PREVIOUS (already written)\n…${a.previous.slice(-1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const ask = (extra: string) =>
    generate(
      [{ role: "user", parts: [media, { text: material }] }],
      {
        systemInstruction: system + extra,
        temperature: 0,
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
        thinkingConfig: { thinkingBudget: a.deep ? 4096 : 512 },
      },
      { timeoutMs: 75_000 },
    );
  let res = await ask("");
  // Verbatim text matching published captions is refused ("recitation"):
  // retry once as a lightly smoothed text, else leave an honest gap marker.
  if (res.candidates?.[0]?.finishReason === "RECITATION")
    res = await ask(
      "\nWrite it as a clean, readable text: keep the content and order of every sentence; you may lightly smooth the wording.",
    );
  const blocked = res.candidates?.[0]?.finishReason === "RECITATION";
  return {
    text: blocked ? `[${clock(a.from)}–${clock(a.to)}: …]` : (res.text ?? "").trim(),
    from: a.from,
    to: a.to,
  };
}

// ── Help writing the taqriz ───────────────────────────────────────────────

export const writeInput = z.object({
  resourceId: z.string().uuid(),
  action: z.enum([
    "outline",
    "intro",
    "continue",
    "conclusion",
    "improve",
    "custom",
    // Own books ("Kitob yozish"):
    "nextChapter",
    "polish",
    "interviewQuestion",
    "interviewWrite",
    "proofread",
  ]),
  /** "book" = the user's own book (memoir, family history…), not a review. */
  mode: z.enum(["taqriz", "book"]).default("taqriz"),
  instruction: z.string().trim().max(2000).default(""),
  /** Interview: the question asked and the author's spoken / typed answer. */
  question: z.string().trim().max(1000).default(""),
  answer: z.string().trim().max(12_000).default(""),
  /** The taqriz so far (plain text, Markdown headings). */
  doc: z.string().max(20_000).default(""),
  selection: z.string().max(4000).default(""),
  locale: z.enum(LOCALES).default("uz"),
});

/**
 * Drafts part of the taqriz in the user's voice from what the user has:
 * the work's facts, their notes and quotes, a finished transcript / konspekt
 * of the video and their text so far. The draft is shown first; the user
 * decides whether it goes in.
 */
export async function writeHelp(ctx: AppContext, raw: unknown) {
  const p = await prepareWrite(ctx, raw);
  const res = await generate(p.contents, p.config, { timeoutMs: p.timeoutMs });
  const text = (res.text ?? "").trim();
  if (!text) throw new AppError("AI_UNAVAILABLE", "empty");
  return { text, used: p.meta.used as { notes: number; transcript: string | null } };
}

export async function prepareWrite(ctx: AppContext, raw: unknown): Promise<Prepared> {
  const a = writeInput.parse(raw);
  await gate(ctx, "ask");
  const facts = await resourceFacts(ctx, a.resourceId);
  const [notes, tr] = await withUser(db, ctx, (tx) =>
    Promise.all([
      tx.execute<{
        kind: string;
        quote_text: string | null;
        title: string | null;
        body: string | null;
        page_from: number | null;
      }>(sql`
        select n.kind::text as kind, n.quote_text, n.title, n.body, n.page_from
        from nodinest.notes n
        where n.user_id = ${ctx.userId} and n.resource_id = ${a.resourceId} and n.deleted_at is null
        order by n.page_from asc nulls last, n.created_at asc limit 40`),
      tx.execute<{ mode: string; text: string }>(sql`
        select mode, text from nodinest.transcripts
        where user_id = ${ctx.userId} and resource_id = ${a.resourceId} and status = 'done' and text is not null
        order by (mode = 'notes') desc, updated_at desc limit 1`),
    ]),
  );
  const notesText = notes
    .map((n) =>
      n.kind === "quote"
        ? `- QUOTE${n.page_from ? ` (p. ${n.page_from})` : ""}: «${n.quote_text}»${n.body ? ` — my comment: ${n.body}` : ""}`
        : `- NOTE: ${[n.title, n.body].filter(Boolean).join(": ").slice(0, 800)}`,
    )
    .join("\n")
    .slice(0, 12_000);
  const book = a.mode === "book";
  const task = book
    ? {
        outline:
          "Propose a plan for this book: 6–12 chapter headings ('## ') in a natural order, each with one line on what it will tell, based on the title, the description and what is written.",
        intro:
          "Write the opening of the book (a preface of 2–3 paragraphs): why the author writes it and for whom, in their warm personal voice.",
        continue:
          "Continue the book from where the text ends (2–4 paragraphs), in the same voice, tense and style.",
        conclusion:
          "Write a closing chapter / afterword (2–3 paragraphs) that gathers the book's thread and the author's message.",
        nextChapter:
          "Suggest the next chapter: its heading ('## ') and a first draft of 3–5 paragraphs that follows naturally from the book so far. Where facts about the author's life are needed and unknown, write [ … ] placeholders instead of inventing them.",
        polish:
          "Rewrite the SELECTED passage as good book prose: vivid, clear, grammatically correct, in the author's own voice; keep every fact and meaning, add nothing invented. Output only the new passage.",
        improve:
          "Rewrite the SELECTED passage so it reads better (clear, correct, well structured) without changing its meaning or adding facts. Output only the new passage.",
        interviewQuestion: `You are a gentle, curious biographer interviewing the author for this book. Ask ONE warm, specific question that brings out a concrete memory, scene, person or feeling for the chapter being written (${a.instruction || "the first chapter that is still empty"}); build on what is already told there and never repeat what is answered. Lines in the book that are questions are only guiding prompts, not the author's answers. Output only the question.`,
        interviewWrite: `Turn the author's ANSWER into book prose for the current chapter: first person, their own words and voice kept, ordered and readable, with natural paragraphs; keep every fact, add no invented facts, names or dates. The QUESTION is only context: do not repeat or paraphrase it, add no heading — output only the paragraphs that go into the chapter.\nQUESTION: ${a.question}\nANSWER: ${a.answer}`,
        proofread:
          "Proofread the SELECTED text: correct ONLY spelling, grammar, punctuation, agreement and obvious typos in the language it is written in. Keep the author's words, style, sentence order and alphabet / orthography exactly (do not modernise the spelling, do not rewrite, add or remove content). Keep paragraph breaks. Output only the corrected text.",
        custom: a.instruction || "Help write the book.",
      }[a.action]
    : {
        outline:
          "Propose an outline for this taqriz: 4–7 chapter headings ('## ') each with 1–2 bullets of what to write there, based on the material.",
        intro:
          "Write an introduction (1–2 paragraphs): what the work is, who made it, why it matters and what this taqriz will discuss.",
        continue:
          "Continue the taqriz from where it ends (1–3 paragraphs), in the same voice and structure, developing the next point.",
        conclusion:
          "Write a conclusion (1–2 paragraphs): the main takeaways and the author's personal assessment, consistent with the text so far.",
        improve:
          "Rewrite the SELECTED passage so it reads better (clear, correct, well structured) without changing its meaning or adding facts. Output only the new passage.",
        proofread:
          "Proofread the SELECTED text: correct ONLY spelling, grammar, punctuation, agreement and obvious typos in the language it is written in. Keep the author's words, style, sentence order and alphabet / orthography exactly (do not modernise the spelling, do not rewrite, add or remove content). Keep paragraph breaks. Output only the corrected text.",
        custom: a.instruction || "Help with the taqriz.",
        nextChapter: "Continue the taqriz with its next chapter.",
        polish:
          "Rewrite the SELECTED passage so it reads better without changing its meaning. Output only the new passage.",
        interviewQuestion: "Ask one question that helps the user think about the work.",
        interviewWrite: `Turn this answer into a taqriz paragraph: ${a.answer}`,
      }[a.action];
  const system = [
    book
      ? "You help the user write THEIR OWN BOOK (often a memoir, a family history or a book of what they know). Write as the author, in their voice and language, as part of the book itself — never as an assistant talking to them. Their life facts come only from what they wrote or said: never invent events, people, places or dates; use [ … ] where a fact is missing."
      : "You help the user write their own taqriz (a review / study essay) about a work. Write in their voice, first person where natural, as part of their essay — not as an assistant talking to them.",
    "Base everything on the MATERIAL: the work's facts, the user's notes and quotes, the transcript or konspekt of the recording and their text so far. Quote only from the quotes / transcript given, exactly, in «…». General knowledge is fine for well-known context, but never invent quotes, page numbers, dates or facts; leave out what you are not sure of.",
    "Format: Markdown — '## ' for chapter headings only when the task asks for structure, short paragraphs, '- ' bullets when useful, **bold** sparingly. No preamble, no comments about the task.",
    langRule(a.locale),
  ].join("\n");
  const material = [
    `WORK\n${factsText(facts)}`,
    notesText ? `MY NOTES AND QUOTES\n${notesText}` : "",
    tr[0]
      ? `${tr[0].mode === "notes" ? "KONSPEKT" : "TRANSCRIPT"} OF THE RECORDING\n${tr[0].text.slice(0, 30_000)}`
      : "",
    a.doc
      ? `${book ? "MY BOOK SO FAR" : "MY TAQRIZ SO FAR"}\n${a.doc.slice(-15_000)}`
      : `${book ? "MY BOOK SO FAR" : "MY TAQRIZ SO FAR"}\n(empty)`,
    a.selection ? `SELECTED\n${a.selection}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    contents: [{ role: "user", parts: [{ text: material }, { text: `TASK\n${task}` }] }],
    config: {
      systemInstruction: system,
      temperature: 0.6,
      thinkingConfig: { thinkingBudget: 2048 },
    },
    timeoutMs: 80_000,
    meta: { used: { notes: notes.length, transcript: tr[0]?.mode ?? null } },
  };
}

// ── Dictation: a short spoken answer → text ───────────────────────────────

export const clipInput = z.object({
  mime: z.string().regex(/^audio\/(webm|ogg|mp4|mpeg|wav)(;.*)?$/),
  // ≈ 4 minutes of speech at 48 kbit/s; server actions accept 2 MB.
  data: z.string().max(1_900_000),
  locale: z.enum(LOCALES).default("uz"),
});

/** Writes down what the user said (interview answers, dictation). */
export async function transcribeClip(ctx: AppContext, raw: unknown) {
  const a = clipInput.parse(raw);
  await gate(ctx, "listen");
  const res = await generate(
    [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: a.mime.split(";")[0], data: a.data } },
          {
            text: "Write down exactly what is said, in the language spoken (Uzbek: the new Latin alphabet of the 2026 law — ö, ğ, ş, ç, ʼ). Fix only punctuation and obvious slips; drop filler sounds. Output only the text.",
          },
        ],
      },
    ],
    { temperature: 0, thinkingConfig: { thinkingBudget: 512 } },
    { timeoutMs: 60_000 },
  );
  return { text: (res.text ?? "").trim() };
}
