/**
 * Audiokitob: the user's PDF read aloud like a professional audiobook.
 *
 *  1. analyze  — the AI reads the WHOLE book once (its text, or the page images
 *     of a scanned PDF): genre, tone, setting, a summary, themes, the
 *     characters (gender, age, manner of speech) with a voice each, words that
 *     need a special pronunciation, chapters and where the real text starts.
 *     The text is split into ~1.5-minute segments (`plan`).
 *  2. script   — per segment, a "director" pass turns the page text into lines
 *     by speaker (narrator / character), keeping the author's words exactly,
 *     fixing only PDF artefacts and spelling numbers / abbreviations out as
 *     they are said. Scripts are cached.
 *  3. voice    — lines are spoken by Gemini speech models (≤ 2 voices per
 *     request, so runs are grouped), joined and encoded as MP3. The browser
 *     caches the audio; nothing large is stored on the server.
 */
import "server-only";
import { Mp3Encoder } from "@breezystack/lamejs";
import { Type } from "@google/genai";
import { and, desc, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { audiobooks, audiobookScripts, bookTextSources } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generate, speak, uploadToGemini } from "./ai/gemini";
import { factsText, gate, langRule, resourceFacts } from "./ai/study";
import { findStructure, getStructure } from "./book-structure";
import { loadBookPages } from "./booktext";
import { readFileBytes } from "./storage";
import { stretchPauses } from "@/lib/audio-pauses";
import {
  cleanLines,
  cleanPages,
  faithfulness,
  withPictureTitles,
  joinPages,
  locateHeading,
  planText,
  runs,
  type ScriptLine,
} from "@/lib/audiobook-plan";

// ─── Voices ──────────────────────────────────────────────────────────────────

/** Gemini's prebuilt voices: gender + character of the voice. */
export const VOICES = {
  Charon: { g: "m", d: "informative, calm" },
  Puck: { g: "m", d: "upbeat" },
  Fenrir: { g: "m", d: "excitable" },
  Orus: { g: "m", d: "firm" },
  Enceladus: { g: "m", d: "breathy" },
  Iapetus: { g: "m", d: "clear" },
  Umbriel: { g: "m", d: "easy-going" },
  Algieba: { g: "m", d: "smooth" },
  Algenib: { g: "m", d: "gravelly" },
  Rasalgethi: { g: "m", d: "informative" },
  Alnilam: { g: "m", d: "firm" },
  Schedar: { g: "m", d: "even" },
  Achird: { g: "m", d: "friendly" },
  Zubenelgenubi: { g: "m", d: "casual" },
  Sadachbia: { g: "m", d: "lively" },
  Sadaltager: { g: "m", d: "knowledgeable" },
  Zephyr: { g: "f", d: "bright" },
  Kore: { g: "f", d: "firm" },
  Leda: { g: "f", d: "youthful" },
  Aoede: { g: "f", d: "breezy" },
  Callirrhoe: { g: "f", d: "easy-going" },
  Autonoe: { g: "f", d: "bright" },
  Despina: { g: "f", d: "smooth" },
  Erinome: { g: "f", d: "clear" },
  Laomedeia: { g: "f", d: "upbeat" },
  Achernar: { g: "f", d: "soft" },
  Gacrux: { g: "f", d: "mature" },
  Pulcherrima: { g: "f", d: "forward" },
  Vindemiatrix: { g: "f", d: "gentle" },
  Sulafat: { g: "f", d: "warm" },
} as const;
export type VoiceName = keyof typeof VOICES;
const isVoice = (v: unknown): v is VoiceName => typeof v === "string" && v in VOICES;
const VOICE_LIST = Object.entries(VOICES)
  .map(([n, v]) => `${n} (${v.g === "m" ? "male" : "female"}, ${v.d})`)
  .join("; ");

// ─── Analysis ────────────────────────────────────────────────────────────────

export type Character = {
  name: string;
  aliases: string[];
  gender: "male" | "female" | "unknown";
  age: "child" | "young" | "adult" | "elderly" | "unknown";
  role: string;
  description: string;
  speech: string;
  voice: VoiceName;
};
export type Analysis = {
  language: string;
  genre: string;
  setting: string;
  summary: string;
  themes: string[];
  tone: string;
  narration: { style: string; voice: VoiceName };
  characters: Character[];
  pronunciation: { written: string; spoken: string }[];
  /** `at`: offset of the title in the book text (exact start, even mid-page). */
  chapters: {
    title: string;
    subtitle?: string;
    page: number;
    at?: number | null;
    /** 0 = a group (part, "Maps"), 1 = an entry. */
    level?: number;
  }[];
  startPage: number;
  /** Bumped when a voice is changed: cached audio is then made again. */
  voiceRev: number;
  /** New for every analysis: audio URLs (and browser caches) follow it. */
  rev: string;
};

/** Text segments: [start, end, page] in the joined text; scanned: [page, page, page]. */
type Plan = {
  kind: "text" | "scan";
  segs: [number, number, number][];
  pages: number;
  /** Running lines removed from the text the offsets refer to. */
  noise?: string[];
  /** Picture-only pages read as their titles (maps, plates). */
  pictures?: { page: number; text: string }[];
};

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    language: {
      type: Type.STRING,
      description:
        "The language the BOOK TEXT itself is written in (e.g. English, Uzbek Latin, Russian) — not the language of this answer",
    },
    genre: { type: Type.STRING },
    setting: { type: Type.STRING, description: "Time and place" },
    summary: { type: Type.STRING, description: "6–10 sentences, no spoilers beyond the premise" },
    themes: { type: Type.ARRAY, items: { type: Type.STRING } },
    tone: { type: Type.STRING },
    narration: {
      type: Type.OBJECT,
      properties: {
        style: { type: Type.STRING, description: "How a professional narrator should read it" },
        voice: { type: Type.STRING },
      },
      required: ["style", "voice"],
    },
    characters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
          gender: { type: Type.STRING, enum: ["male", "female", "unknown"] },
          age: { type: Type.STRING, enum: ["child", "young", "adult", "elderly", "unknown"] },
          role: { type: Type.STRING },
          description: { type: Type.STRING },
          speech: { type: Type.STRING, description: "Manner of speech" },
          voice: { type: Type.STRING },
        },
        required: ["name", "gender", "age", "role", "description", "speech", "voice"],
      },
    },
    pronunciation: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { written: { type: Type.STRING }, spoken: { type: Type.STRING } },
        required: ["written", "spoken"],
      },
    },
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, page: { type: Type.INTEGER } },
        required: ["title", "page"],
      },
    },
    startPage: { type: Type.INTEGER, description: "First page of the actual text" },
  },
  required: ["language", "genre", "summary", "narration", "characters", "chapters", "startPage"],
};

const ANALYSIS_SYSTEM = (locale: string) =>
  [
    "You are the casting director and dramaturg of a top audiobook studio. Read the WHOLE book deeply and prepare it to be performed aloud.",
    "- language, genre, setting (time, place), tone; a faithful summary of the premise; the main themes.",
    "- narration.style: how a professional narrator should read this book (pace, warmth, gravity, where to slow down).",
    "- characters: every character who SPEAKS in direct speech, with gender, age group, role in the story, a short description and their manner of speech. Include aliases / forms of address used in the text (e.g. 'Otabek', 'bek', 'o‘g‘lim') so dialogue can be attributed.",
    `- Choose a voice for the narrator and for each character from this list, matching gender, age and temperament, all different where possible: ${VOICE_LIST}.`,
    "- pronunciation: names and words a reader could say wrongly — Arabic, Persian, Russian or other foreign names and terms, abbreviations, Roman numerals, units — written as in the book and how to say them in the book's language (e.g. 'XIX asr' → 'o‘n to‘qqizinchi asr', 'h.k.' → 'hokazo').",
    "- For an English (or other non-Uzbek) book the narration stays in the book's language; keep names exactly as written (the voices read them well) and list in pronunciation only abbreviations or symbols that must be spoken out.",
    "- chapters: the real chapters / parts with the PDF page they start on (page numbers are given as [p. N]).",
    "- startPage: the first page of the actual text (skip cover, copyright, contents, forewords by publishers if they are not part of the work).",
    "Be exact: never invent characters, names or chapters that are not in the book.",
    langRule(locale),
    "Keep character names, aliases, chapter titles and the pronunciation 'written' forms exactly as in the book.",
  ].join("\n");

// ~75k tokens per request: the free tier allows ~250k tokens a minute.
const PART = 300_000;
const MAX_PARTS = 4;

/** The book text as up to four parts of ~450k characters (spread over the whole book). */
function bookParts(pages: { page: number; content: string }[]) {
  const parts: string[] = [];
  let cur = "";
  for (const p of pages) {
    const chunk = `\n[p. ${p.page}] ${p.content}`;
    if (cur && cur.length + chunk.length > PART) {
      parts.push(cur);
      cur = "";
    }
    cur += chunk;
  }
  if (cur) parts.push(cur);
  if (parts.length <= MAX_PARTS) return parts;
  // Very long: the first part and others spread evenly to the end.
  const step = (parts.length - 1) / (MAX_PARTS - 1);
  return Array.from({ length: MAX_PARTS }, (_, i) => parts[Math.round(i * step)]);
}

const CAST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    characters: ANALYSIS_SCHEMA.properties.characters,
    pronunciation: ANALYSIS_SCHEMA.properties.pronunciation,
  },
  required: ["characters"],
};

/** Characters who speak in a later part of a long book (and words to pronounce). */
async function moreCast(
  facts: Awaited<ReturnType<typeof resourceFacts>>,
  body: string,
  n: number,
  total: number,
  locale: "uz" | "en",
) {
  const res = await generate(
    [
      {
        role: "user",
        parts: [{ text: `${factsText(facts)}\n\nBOOK TEXT (part ${n} of ${total})${body}` }],
      },
    ],
    {
      systemInstruction: [
        "You are the casting director of an audiobook. This is a later part of the book.",
        "List every character who SPEAKS in direct speech in this part — gender, age group, role, a short description, manner of speech and the aliases / forms of address used for them — and names or words here that need a pronunciation note.",
        `Choose a voice for each from: ${VOICE_LIST}.`,
        "Never invent characters.",
        langRule(locale),
        "Keep names, aliases and the pronunciation 'written' forms exactly as in the book.",
      ].join("\n"),
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: CAST_SCHEMA,
      thinkingConfig: { thinkingBudget: 1024 },
    },
    { timeoutMs: 180_000, patient: true },
  );
  return JSON.parse(res.text ?? "{}") as { characters?: unknown[]; pronunciation?: unknown[] };
}

/** "Lord Eddard Stark" = "Eddard Stark": titles do not make another person. */
const personKey = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(
      /^(lord|lady|ser|sir|king|queen|prince|princess|maester|septa|septon|khal|magister|master|mister|mr\.?|mrs\.?|miss|dr\.?|domla|mulla|hoji|bek|xon)\s+/,
      "",
    );

/** Adds later parts' characters and pronunciations (same name = same person). */
function mergeCast(
  raw: Record<string, unknown>,
  extra: ({ characters?: unknown[]; pronunciation?: unknown[] } | null)[],
) {
  const chars = (Array.isArray(raw.characters) ? raw.characters : []) as Record<string, unknown>[];
  const pron = (Array.isArray(raw.pronunciation) ? raw.pronunciation : []) as Record<
    string,
    unknown
  >[];
  const key = personKey;
  for (const e of extra) {
    for (const c of (e?.characters ?? []) as Record<string, unknown>[]) {
      const same = chars.find(
        (x) =>
          key(x.name) === key(c.name) ||
          (Array.isArray(x.aliases) && x.aliases.some((a) => key(a) === key(c.name))),
      );
      if (!same) chars.push(c);
      else if (Array.isArray(c.aliases))
        same.aliases = [...new Set([...((same.aliases as unknown[]) ?? []), ...c.aliases])];
    }
    for (const p of (e?.pronunciation ?? []) as Record<string, unknown>[])
      if (!pron.some((x) => key(x.written) === key(p.written))) pron.push(p);
  }
  raw.characters = chars;
  raw.pronunciation = pron;
}

/** The PDF behind the book text, if it was an uploaded file. */
async function sourceFile(ctx: AppContext, resourceId: string) {
  const [s] = await withUser(db, ctx, (tx) =>
    tx
      .select({ fileId: bookTextSources.fileId, pages: bookTextSources.pages })
      .from(bookTextSources)
      .where(
        and(
          eq(bookTextSources.userId, ctx.userId),
          eq(bookTextSources.resourceId, resourceId),
          eq(bookTextSources.status, "ready"),
        ),
      )
      .orderBy(desc(bookTextSources.createdAt))
      .limit(1),
  );
  return s ?? null;
}

function cleanAnalysis(raw: Record<string, unknown>, pages: number): Analysis {
  const str = (v: unknown, n = 2000) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const used = new Set<string>();
  const uses = new Map<VoiceName, number>();
  /**
   * The AI's choice when it fits the character's gender and is still free;
   * else a free voice of that gender; when a big cast has used them all, the
   * least used one of that gender (never the narrator's).
   */
  const pick = (v: unknown, g: string, narratorVoice?: VoiceName): VoiceName => {
    const want = g === "female" ? "f" : g === "male" ? "m" : null;
    const fits = (n: VoiceName) => !want || VOICES[n].g === want;
    let out: VoiceName | undefined = isVoice(v) && fits(v) && !used.has(v) ? v : undefined;
    out ??= (Object.keys(VOICES) as VoiceName[]).find((n) => fits(n) && !used.has(n));
    out ??= (Object.keys(VOICES) as VoiceName[])
      .filter((n) => fits(n) && n !== narratorVoice)
      .sort((a, b) => (uses.get(a) ?? 0) - (uses.get(b) ?? 0))[0];
    out ??= want === "f" ? "Sulafat" : "Charon";
    used.add(out);
    uses.set(out, (uses.get(out) ?? 0) + 1);
    return out;
  };
  const narr = (raw.narration ?? {}) as Record<string, unknown>;
  const narrator = pick(narr.voice ?? "Charon", "any");
  const characters = (Array.isArray(raw.characters) ? raw.characters : [])
    .slice(0, 60)
    .map((c: Record<string, unknown>) => {
      const gender: Character["gender"] = ["male", "female"].includes(String(c.gender))
        ? (c.gender as "male" | "female")
        : "unknown";
      return {
        name: str(c.name, 120),
        aliases: (Array.isArray(c.aliases) ? c.aliases : []).map((a) => str(a, 80)).filter(Boolean),
        gender,
        age: (["child", "young", "adult", "elderly"].includes(String(c.age))
          ? c.age
          : "unknown") as Character["age"],
        role: str(c.role, 300),
        description: str(c.description, 600),
        speech: str(c.speech, 300),
        voice: pick(c.voice, gender, narrator),
      };
    })
    .filter((c) => c.name && c.name.toLowerCase() !== "narrator")
    .filter((c, i, all) => all.findIndex((x) => personKey(x.name) === personKey(c.name)) === i);
  const startPage = Math.min(Math.max(1, Number(raw.startPage) || 1), Math.max(1, pages));
  return {
    language: str(raw.language, 80),
    genre: str(raw.genre, 200),
    setting: str(raw.setting, 400),
    summary: str(raw.summary, 3000),
    themes: (Array.isArray(raw.themes) ? raw.themes : []).map((t) => str(t, 120)).filter(Boolean),
    tone: str(raw.tone, 300),
    narration: { style: str(narr.style, 600), voice: narrator },
    characters,
    pronunciation: (Array.isArray(raw.pronunciation) ? raw.pronunciation : [])
      .slice(0, 200)
      .map((p: Record<string, unknown>) => ({
        written: str(p.written, 80),
        spoken: str(p.spoken, 120),
      }))
      .filter((p) => p.written && p.spoken),
    chapters: (Array.isArray(raw.chapters) ? raw.chapters : [])
      .slice(0, 300)
      .map((c: Record<string, unknown>) => ({
        title: str(c.title, 200),
        page: Number(c.page) || 1,
      }))
      .filter((c) => c.title),
    startPage,
    voiceRev: 1,
    rev: Date.now().toString(36),
  };
}

/**
 * Reads the whole book and prepares it for narration. Re-running replaces the
 * analysis (and the cached scripts).
 */
export async function analyzeAudiobook(ctx: AppContext, resourceId: string, locale: "uz" | "en") {
  await gate(ctx, "ask");
  const started = Date.now();
  const facts = await resourceFacts(ctx, resourceId);
  const [pages, src] = await Promise.all([
    loadBookPages(ctx, resourceId),
    sourceFile(ctx, resourceId),
  ]);
  const totalPages = Math.max(src?.pages ?? 0, pages.at(-1)?.page ?? 0);
  if (!pages.length && !src?.fileId) throw new AppError("NOT_FOUND", "no_book_text");
  // Scanned: most pages have (almost) no text layer.
  const texty = pages.filter((p) => p.content.replace(/\s/g, "").length > 80).length;
  const scanned = !!src?.fileId && texty < Math.max(1, totalPages) * 0.4;

  const [row] = await withUser(db, ctx, (tx) =>
    tx
      .insert(audiobooks)
      .values({
        userId: ctx.userId,
        resourceId,
        fileId: src?.fileId ?? null,
        status: "analyzing",
        scanned,
      })
      .onConflictDoUpdate({
        target: [audiobooks.userId, audiobooks.resourceId],
        set: {
          status: "analyzing",
          error: null,
          scanned,
          fileId: src?.fileId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: audiobooks.id }),
  );
  try {
    // Text books: the chapters were found once for the whole book (bookmarks + headings).
    const structure = scanned
      ? null
      : await (async () => {
          const st = await getStructure(ctx, resourceId);
          return st && st.source !== "pending" ? st : findStructure(ctx, resourceId, locale);
        })();
    let parts;
    let bodies: string[] = [];
    if (scanned) {
      const f = await readFileBytes(ctx, src!.fileId!);
      if (!f) throw new AppError("NOT_FOUND");
      const uri = await uploadToGemini(f.bytes, "application/pdf");
      parts = [
        { fileData: { mimeType: "application/pdf", fileUri: uri } },
        { text: `${factsText(facts)}\nThe PDF pages are numbered from 1 in order.` },
      ];
    } else {
      bodies = bookParts(cleanPages(pages, structure?.noise));
      parts = [
        { text: `${factsText(facts)}\n\nBOOK TEXT (part 1 of ${bodies.length})${bodies[0]}` },
      ];
    }
    const resP = generate(
      [{ role: "user", parts }],
      {
        systemInstruction: ANALYSIS_SYSTEM(locale),
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA,
        thinkingConfig: { thinkingBudget: 4096 },
      },
      { timeoutMs: 180_000, patient: true },
    );
    // Long books: the other parts are read (one after another, to stay within
    // the per-minute token limit) for the characters who appear later.
    const res = await resP;
    const extra: (Awaited<ReturnType<typeof moreCast>> | null)[] = [];
    for (const [i, b] of bodies.slice(1).entries()) {
      // Stay well inside the function's 5 minutes; the first part has the main cast.
      if (Date.now() - started > 190_000) break;
      extra.push(await moreCast(facts, b, i + 2, bodies.length, locale).catch(() => null));
    }
    const raw = JSON.parse(res.text ?? "{}") as Record<string, unknown>;
    mergeCast(raw, extra);
    const analysis = cleanAnalysis(raw, totalPages || 1);
    if (structure?.chapters.length) {
      analysis.chapters = structure.chapters.map((c) => ({
        title: c.title,
        level: c.level,
        ...(c.subtitle ? { subtitle: c.subtitle } : {}),
        page: c.page,
        at: c.at,
      }));
      analysis.startPage = structure.startPage;
    }
    let plan: Plan;
    if (scanned) {
      const segs: Plan["segs"] = [];
      for (let p = 1; p <= totalPages; p++) segs.push([p, p, p]);
      plan = { kind: "scan", segs, pages: totalPages };
    } else {
      // Picture-only pages (maps, plates): the narrator says their titles.
      const pictures = (structure?.images ?? [])
        .filter((i) => i.textless)
        .map((i) => ({
          page: i.page,
          text: (structure?.chapters ?? [])
            .filter((c) => c.page === i.page)
            .map((c) => c.title)
            .join("\n"),
        }))
        .filter((x) => x.text);
      const plain = cleanPages(pages, structure?.noise);
      const clean = withPictureTitles(plain, pictures);
      const { text, starts } = joinPages(clean);
      // Chapter offsets were found on the text without the picture titles: move
      // them to the same place (page + position on it) in this text.
      const before = joinPages(plain).starts;
      const move = (at: number) => {
        let k = 0;
        for (let i = 0; i < before.length; i++) if (before[i].at <= at) k = i;
        const to = starts.find((x) => x.page === before[k]?.page);
        return to ? to.at + (at - before[k].at) : at;
      };
      analysis.chapters = analysis.chapters.map((c) => ({
        ...c,
        at: c.at != null ? move(c.at) : (locateHeading(clean, starts, c.page, c.title) ?? null),
      }));
      // Break exactly where each chapter title stands (even mid-page).
      // A group title and its first entry on the same page ("Maps" / "The North")
      // make one piece.
      const breaks = [
        starts.find((x) => x.page >= analysis.startPage)?.at ?? 0,
        ...analysis.chapters
          .filter((c, i, all) => !(i > 0 && all[i - 1].level === 0 && all[i - 1].page === c.page))
          .map((c) => c.at ?? 0),
      ];
      plan = {
        kind: "text",
        segs: planText(text, starts, breaks),
        pages: totalPages,
        noise: structure?.noise,
        pictures,
      };
    }
    const start = Math.max(
      0,
      plan.segs.findIndex((s) => s[2] >= analysis.startPage),
    );
    await withUser(db, ctx, async (tx) => {
      await tx.delete(audiobookScripts).where(eq(audiobookScripts.audiobookId, row.id));
      await tx
        .update(audiobooks)
        .set({
          status: "ready",
          analysis,
          plan,
          positionIdx: start,
          positionSec: 0,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, row.id));
    });
    return { id: row.id, segments: plan.segs.length };
  } catch (err) {
    await withUser(db, ctx, (tx) =>
      tx
        .update(audiobooks)
        .set({ status: "failed", error: err instanceof AppError ? err.code : "failed" })
        .where(eq(audiobooks.id, row.id)),
    );
    throw err;
  }
}

// ─── Reading ────────────────────────────────────────────────────────────────

export type AudiobookView = {
  status: string;
  error: string | null;
  scanned: boolean;
  analysis: Analysis | null;
  segments: number;
  /** Segment index where each chapter starts. */
  chapterAt: number[];
  pageOf: number[];
  position: { idx: number; sec: number };
  /** The PDF (to show picture pages) and its picture-only pages. */
  fileId: string | null;
  pictures: number[];
};

async function getRow(ctx: AppContext, resourceId: string) {
  const [r] = await withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(audiobooks)
      .where(and(eq(audiobooks.userId, ctx.userId), eq(audiobooks.resourceId, resourceId))),
  );
  return r ?? null;
}

export async function getAudiobook(
  ctx: AppContext,
  resourceId: string,
): Promise<AudiobookView | null> {
  const r = await getRow(ctx, resourceId);
  if (!r) return null;
  const plan = r.plan as Plan | null;
  const analysis = r.analysis as Analysis | null;
  const segs = plan?.segs ?? [];
  return {
    status: r.status,
    error: r.error,
    scanned: r.scanned,
    analysis,
    segments: segs.length,
    chapterAt: (analysis?.chapters ?? []).map((c) =>
      Math.max(
        0,
        plan?.kind === "text" && c.at != null
          ? // the piece the title is in (it starts there, or right above for a group)
            segs.findLastIndex((s) => s[0] <= c.at!)
          : segs.findIndex((s) => s[2] >= c.page),
      ),
    ),
    pageOf: segs.map((s) => s[2]),
    position: { idx: r.positionIdx, sec: r.positionSec },
    fileId: r.fileId,
    pictures: (plan?.pictures ?? []).map((x) => x.page),
  };
}

/** Does this resource have book text (or a PDF) that can become an audiobook? */
export async function hasBookText(ctx: AppContext, resourceId: string) {
  return !!(await sourceFile(ctx, resourceId));
}

export type { ScriptLine };

const SCRIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    lines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING },
          text: { type: Type.STRING },
          heading: { type: Type.BOOLEAN, description: "A chapter / section title" },
        },
        required: ["speaker", "text"],
      },
    },
  },
  required: ["lines"],
};

const SCRIPT_SYSTEM = (a: Analysis) =>
  [
    "You prepare the script for a professional audiobook recording of this passage.",
    `Book: ${a.genre}; tone: ${a.tone}. Narration: ${a.narration.style}`,
    `Characters (speaker names): ${a.characters.map((c) => `${c.name}${c.aliases.length ? ` (also: ${c.aliases.join(", ")})` : ""} — ${c.gender}, ${c.age}`).join("; ") || "none"}.`,
    a.pronunciation.length
      ? `Pronunciation: ${a.pronunciation.map((p) => `"${p.written}" → "${p.spoken}"`).join("; ")}.`
      : "",
    "Rules:",
    "- Output the passage as lines with a speaker: 'narrator' for the author's text, or a character's name (exactly as listed) for that character's direct speech. If unsure who speaks, use 'narrator'.",
    "- The words around a quote belong to the narrator line COMPLETE, with the speaker's name: “We should start back,” Gared urged as the woods… → Gared: 'We should start back,' / narrator: 'Gared urged as the woods…'. Likewise '— dedi Otabek' → narrator: 'dedi Otabek'.",
    "- A chapter or section title is its own narrator line with heading: true (written normally, not in capitals).",
    "- Do not put the dialogue dashes (—) into the text: they only show who speaks. Keep ALL other punctuation exactly (, . ! ? … : ;) — it carries the intonation; a character's line keeps its own final comma, '!' or '?'.",
    "- Keep EVERY word of the author in order. Never summarise, shorten, explain, translate or add anything.",
    "- Fix only PDF artefacts: words broken by hyphens at line ends, broken lines inside sentences, running headers / footers, page numbers, footnote markers.",
    "- Write numbers, dates, Roman numerals, abbreviations and symbols as they are SAID (in words) and apply the pronunciation list.",
    "- Keep the book's language. If the text is Uzbek in Cyrillic script, write it in Uzbek Latin script (o‘, g‘, sh, ch).",
    "- The passage may start or end mid-sentence: keep it so. Skip nothing but artefacts.",
  ]
    .filter(Boolean)
    .join("\n");

/** One page of the PDF as its own small PDF (scanned books). */
async function onePage(bytes: Uint8Array, page: number) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (page < 1 || page > src.getPageCount()) throw new AppError("NOT_FOUND");
  const out = await PDFDocument.create();
  const [p] = await out.copyPages(src, [page - 1]);
  out.addPage(p);
  return out.save();
}

/** The voiced script of segment `idx` (cached). */
export async function segmentScript(ctx: AppContext, resourceId: string, idx: number) {
  const r = await getRow(ctx, resourceId);
  if (!r || r.status !== "ready") throw new AppError("NOT_FOUND", "not_ready");
  const plan = r.plan as Plan;
  const a = r.analysis as Analysis;
  const seg = plan.segs[idx];
  if (!seg) throw new AppError("NOT_FOUND");
  const [cached] = await withUser(db, ctx, (tx) =>
    tx
      .select({ script: audiobookScripts.script })
      .from(audiobookScripts)
      .where(and(eq(audiobookScripts.audiobookId, r.id), eq(audiobookScripts.idx, idx))),
  );
  if (cached) return { lines: cached.script as ScriptLine[], page: seg[2], row: r, analysis: a };

  let parts;
  let source = "";
  if (plan.kind === "scan") {
    if (!r.fileId) throw new AppError("NOT_FOUND");
    const f = await readFileBytes(ctx, r.fileId);
    if (!f) throw new AppError("NOT_FOUND");
    const pdf = await onePage(f.bytes, seg[0]);
    parts = [
      { inlineData: { mimeType: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
      { text: "Read the text of this book page exactly and make the script of it." },
    ];
  } else {
    const { text } = joinPages(
      withPictureTitles(
        cleanPages(await loadBookPages(ctx, resourceId), plan.noise),
        plan.pictures,
      ),
    );
    source = text.slice(seg[0], seg[1]);
    const before = text.slice(Math.max(0, seg[0] - 400), seg[0]);
    parts = [
      {
        text: `${before ? `CONTEXT BEFORE (do not include it): …${before}\n\n` : ""}PASSAGE\n${source}`,
      },
    ];
  }
  let lines: ScriptLine[] = [];
  let best = -1;
  let note = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await generate(
      [{ role: "user", parts }],
      {
        systemInstruction: SCRIPT_SYSTEM(a) + note,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: SCRIPT_SCHEMA,
        thinkingConfig: { thinkingBudget: 1024 },
      },
      { timeoutMs: 90_000 },
    );
    let got: ScriptLine[] = [];
    try {
      got = cleanLines((JSON.parse(res.text ?? "{}") as { lines?: unknown }).lines, a);
    } catch {
      got = [];
    }
    if (!got.length) continue;
    // Faithfulness: the author's words, in order. Scanned pages have no source to compare.
    const f = source
      ? faithfulness(source, got.map((l) => l.text).join(" "))
      : { coverage: 1, missing: [] };
    if (f.coverage > best) {
      best = f.coverage;
      lines = got;
    }
    if (f.coverage >= 0.97) break;
    note = `\nIMPORTANT: your previous script left out words of the author (e.g. ${f.missing
      .slice(0, 15)
      .map((w) => `"${w}"`)
      .join(
        ", ",
      )}). Every word must be there, including the speaker's name in "— said Gared" / "Gared urged" — such words belong to the narrator line.`;
  }
  if (!lines.length) throw new AppError("AI_UNAVAILABLE", "empty_script");
  await withUser(db, ctx, (tx) =>
    tx
      .insert(audiobookScripts)
      .values({ audiobookId: r.id, idx, userId: ctx.userId, script: lines })
      .onConflictDoNothing(),
  );
  return { lines, page: seg[2], row: r, analysis: a };
}

function encodeMp3(pcm: Int16Array, rate: number) {
  const enc = new Mp3Encoder(1, rate, 48);
  const out: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) out.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)));
  out.push(enc.flush());
  return Buffer.concat(out.map((b) => Buffer.from(b.buffer, b.byteOffset, b.byteLength)));
}

/** MP3 of segment `idx`, voiced with the book's cast. */
export async function segmentAudio(ctx: AppContext, resourceId: string, idx: number) {
  await gate(ctx, "audiobook");
  const { lines, analysis: a } = await segmentScript(ctx, resourceId, idx);
  const voice = new Map<string, string>([["narrator", a.narration.voice]]);
  for (const c of a.characters) voice.set(c.name, c.voice);
  const voiceOf = (s: string) => voice.get(s) ?? a.narration.voice;
  const groups = runs(lines);
  const style =
    `Read this as a professional audiobook narrator: unhurried, warm and expressive, with natural pauses between sentences and a longer pause between paragraphs; give each character their own feeling. ${a.narration.style ?? ""}`.trim();
  // A few requests at once; the order of the pieces is kept.
  const pieces: { pcm: Int16Array; rate: number }[] = new Array(groups.length);
  for (let i = 0; i < groups.length; i += 3)
    await Promise.all(
      groups.slice(i, i + 3).map(async (g, j) => {
        pieces[i + j] = await speak(g, voiceOf, { style });
      }),
    );
  const rate = pieces[0]?.rate ?? 24000;
  // A breath between the pieces of the recording.
  const gap = new Int16Array(Math.round(rate * 0.55));
  const total = pieces.reduce((n, p) => n + p.pcm.length + gap.length, 0);
  const pcm = new Int16Array(total);
  let at = 0;
  for (const p of pieces) {
    pcm.set(p.pcm, at);
    at += p.pcm.length + gap.length;
  }
  // A human narrator's pacing: the model's own pauses at sentence ends and
  // commas are lengthened (no extra request, nothing re-spoken).
  const paced = stretchPauses(pcm, rate);
  return { mp3: encodeMp3(paced, rate), seconds: paced.length / rate };
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function savePosition(ctx: AppContext, resourceId: string, idx: number, sec: number) {
  const p = z
    .object({ idx: z.number().int().min(0).max(100_000), sec: z.number().min(0).max(36_000) })
    .parse({ idx, sec });
  await withUser(db, ctx, (tx) =>
    tx
      .update(audiobooks)
      .set({ positionIdx: p.idx, positionSec: p.sec, updatedAt: new Date() })
      .where(and(eq(audiobooks.userId, ctx.userId), eq(audiobooks.resourceId, resourceId))),
  );
}

/** Gives the narrator or a character another voice (audio is then made again). */
export async function setVoice(
  ctx: AppContext,
  resourceId: string,
  speaker: string,
  voice: string,
) {
  if (!isVoice(voice)) throw new AppError("VALIDATION", "voice");
  const r = await getRow(ctx, resourceId);
  if (!r?.analysis) throw new AppError("NOT_FOUND");
  const a = r.analysis as Analysis;
  const next: Analysis = {
    ...a,
    narration: speaker === "narrator" ? { ...a.narration, voice } : a.narration,
    characters: a.characters.map((c) => (c.name === speaker ? { ...c, voice } : c)),
    voiceRev: (a.voiceRev ?? 1) + 1,
  };
  await withUser(db, ctx, (tx) =>
    tx
      .update(audiobooks)
      .set({ analysis: next, updatedAt: new Date() })
      .where(eq(audiobooks.id, r.id)),
  );
  return next.voiceRev;
}

/** The text was indexed again: the old plan no longer matches it. */
export async function resetAudiobook(ctx: AppContext, resourceId: string) {
  await withUser(db, ctx, (tx) =>
    tx
      .delete(audiobooks)
      .where(and(eq(audiobooks.userId, ctx.userId), eq(audiobooks.resourceId, resourceId))),
  );
}
