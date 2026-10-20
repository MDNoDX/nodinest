/**
 * Full transcripts / konspekts of a whole video or audio, prepared ahead of
 * time and downloadable (PDF, Word, Markdown, text).
 *
 * Quality comes from understanding before writing:
 *  1. Study: the AI watches / hears the whole recording once (cheaply: low
 *     resolution, few frames) and writes a brief — topic, speakers, language,
 *     the correct spelling of every name and term, and a timed outline.
 *  2. Segments of 5 minutes are written with that brief, the text before them
 *     and the outline headings that fall inside them, so names stay consistent
 *     and unclear words are resolved from the whole talk's context.
 *  3. Finish: transcripts are joined; konspekts get a final pass that merges the
 *     segment notes into one structured konspekt with a short conclusion.
 * Each call to stepTranscript does one unit of work, so a long recording is
 * processed while the page is open and can be resumed at any time.
 */
import "server-only";
import { MediaResolution, Type, type Part } from "@google/genai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { transcripts } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { readFileBytes } from "../storage";
import { describeFiles } from "./media";
import { generate, uploadToGemini } from "./gemini";
import { clock, factsText, gate, langRule, resourceFacts } from "./study";

/** Short clips keep transcripts verbatim (long ones get summarised or blocked). */
const SEGMENT = { transcript: 90, notes: 300 } as const;
const MAX_DURATION = 6 * 3600;
/** The study pass hears at most this much (free-tier token limits). */
const BRIEF_SPAN = 45 * 60;

type Source = { kind: "youtube"; id: string } | { kind: "file"; fileId: string };
type Segment = { from: number; to: number; text: string };
type Brief = {
  language: string;
  topic: string;
  speakers: string[];
  glossary: { term: string; note?: string }[];
  outline: { start: number; title: string }[];
};

export const startInput = z.object({
  resourceId: z.string().uuid(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("youtube"), id: z.string().regex(/^[\w-]{11}$/) }),
    z.object({ kind: z.literal("file"), fileId: z.string().uuid() }),
  ]),
  mode: z.enum(["transcript", "notes"]),
  deep: z.boolean().default(true),
  durationSeconds: z.number().int().min(5).max(MAX_DURATION),
});

export type TranscriptInfo = {
  id: string;
  mode: "transcript" | "notes";
  status: "running" | "done" | "error";
  durationSeconds: number;
  done: number;
  studied: boolean;
  error: string | null;
  createdAt: string;
};

const info = (r: typeof transcripts.$inferSelect): TranscriptInfo => {
  const segs = r.segments as Segment[];
  return {
    id: r.id,
    mode: r.mode as TranscriptInfo["mode"],
    status: r.status as TranscriptInfo["status"],
    durationSeconds: r.durationSeconds,
    done: segs.at(-1)?.to ?? 0,
    studied: !!r.brief,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  };
};

async function load(ctx: AppContext, id: string) {
  const [r] = await withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.id, id), eq(transcripts.userId, ctx.userId))),
  );
  if (!r) throw new AppError("NOT_FOUND");
  return r;
}

async function save(ctx: AppContext, id: string, patch: Partial<typeof transcripts.$inferInsert>) {
  await withUser(db, ctx, (tx) =>
    tx
      .update(transcripts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(transcripts.id, id), eq(transcripts.userId, ctx.userId))),
  );
}

export async function startTranscript(ctx: AppContext, raw: unknown): Promise<TranscriptInfo> {
  const a = startInput.parse(raw);
  await resourceFacts(ctx, a.resourceId); // exists and visible
  if (a.source.kind === "file") {
    const [f] = await describeFiles(ctx, [a.source.fileId]);
    if (!f || !/^(audio|video)\//.test(f.mime)) throw new AppError("NOT_FOUND");
  }
  const [row] = await withUser(db, ctx, (tx) =>
    tx
      .insert(transcripts)
      .values({
        userId: ctx.userId,
        resourceId: a.resourceId,
        source: a.source,
        mode: a.mode,
        deep: a.deep,
        durationSeconds: a.durationSeconds,
      })
      .returning(),
  );
  return info(row);
}

export async function listTranscripts(ctx: AppContext, resourceId: string) {
  const rows = await withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.userId, ctx.userId), eq(transcripts.resourceId, resourceId)))
      .orderBy(desc(transcripts.createdAt))
      .limit(20),
  );
  return rows.map(info);
}

export async function deleteTranscript(ctx: AppContext, id: string) {
  await withUser(db, ctx, (tx) =>
    tx.delete(transcripts).where(and(eq(transcripts.id, id), eq(transcripts.userId, ctx.userId))),
  );
}

/** Final text (Markdown) of a finished transcript, for export or the taqriz. */
export async function transcriptText(ctx: AppContext, id: string) {
  const r = await load(ctx, id);
  if (r.status !== "done" || !r.text) throw new AppError("NOT_FOUND", "not_ready");
  return { text: r.text, mode: r.mode as "transcript" | "notes", resourceId: r.resourceId };
}

/** The recording as a Gemini part, clipped to [from, to] where possible. */
async function mediaPart(
  ctx: AppContext,
  r: typeof transcripts.$inferSelect,
  from: number,
  to: number,
  fps: number,
): Promise<{ part: Part; clipped: boolean }> {
  const src = r.source as Source;
  const clip = { startOffset: `${Math.floor(from)}s`, endOffset: `${Math.ceil(to)}s`, fps };
  if (src.kind === "youtube")
    return {
      part: {
        fileData: { fileUri: `https://www.youtube.com/watch?v=${src.id}` },
        videoMetadata: clip,
      },
      clipped: true,
    };
  const [f] = await describeFiles(ctx, [src.fileId]);
  if (!f) throw new AppError("NOT_FOUND");
  let uri = r.geminiFile;
  if (!uri) {
    const bytes = await readFileBytes(ctx, src.fileId);
    if (!bytes) throw new AppError("NOT_FOUND");
    uri = await uploadToGemini(bytes.bytes, f.mime);
    await save(ctx, r.id, { geminiFile: uri });
  }
  const video = f.mime.startsWith("video/");
  return {
    part: video
      ? { fileData: { fileUri: uri, mimeType: f.mime }, videoMetadata: clip }
      : { fileData: { fileUri: uri, mimeType: f.mime } },
    clipped: video,
  };
}

const briefText = (b: Brief | null) =>
  b
    ? [
        `Language: ${b.language}`,
        `Topic: ${b.topic}`,
        b.speakers.length ? `Speakers: ${b.speakers.join("; ")}` : "",
        b.glossary.length
          ? `Names and terms (use exactly this spelling):\n${b.glossary
              .map((g) => `- ${g.term}${g.note ? ` — ${g.note}` : ""}`)
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

async function study(ctx: AppContext, r: typeof transcripts.$inferSelect, locale: string) {
  const facts = await resourceFacts(ctx, r.resourceId);
  const span = Math.min(r.durationSeconds, BRIEF_SPAN);
  const { part } = await mediaPart(ctx, r, 0, span, 0.05);
  const res = await generate(
    [
      {
        role: "user",
        parts: [
          part,
          {
            text: `WORK\n${factsText(facts)}\n\nThe recording is ${clock(r.durationSeconds)} long${
              span < r.durationSeconds ? ` (you hear the first ${clock(span)})` : ""
            }.`,
          },
        ],
      },
    ],
    {
      systemInstruction: [
        "Study this recording before it is transcribed. Listen to all of it and understand what it is about.",
        "Return: the main spoken language; the topic in 1–2 sentences; the speakers (name or role, only if clear);",
        "a glossary of every proper name, place, book, technical or religious term and foreign (Arabic, Persian, …) phrase that is spoken, written the way it should be spelled in a careful text (Uzbek: standard modern Latin orthography with o‘, g‘, ʼ; Arabic phrases in conventional Uzbek Latin transliteration), with a short note when useful;",
        `and an outline of the talk's main sections: the second (from the start of the recording, at most ${Math.floor(span)}) where each begins and a short title ${
          r.mode === "notes"
            ? locale === "en"
              ? "in English"
              : "in Uzbek (Latin)"
            : "in the language that is spoken"
        }.`,
        "Never invent anything that is not in the recording.",
        `Write the topic and glossary notes ${locale === "en" ? "in English" : "in Uzbek (Latin)"}; keep glossary terms in their proper spelling.`,
      ].join("\n"),
      temperature: 0,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          language: { type: Type.STRING, description: "Spoken language, in English (e.g. Uzbek)" },
          topic: { type: Type.STRING },
          speakers: { type: Type.ARRAY, items: { type: Type.STRING } },
          glossary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { term: { type: Type.STRING }, note: { type: Type.STRING } },
              required: ["term"],
            },
          },
          outline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start: { type: Type.NUMBER, description: "Seconds from the start" },
                title: {
                  type: Type.STRING,
                  description:
                    r.mode === "notes"
                      ? `Short title in ${locale === "en" ? "English" : "Uzbek (Latin)"}`
                      : "Short title in the spoken language",
                },
              },
              required: ["start", "title"],
            },
          },
        },
        required: ["language", "topic", "speakers", "glossary", "outline"],
      },
      thinkingConfig: { thinkingBudget: r.deep ? 2048 : 512 },
    },
    { timeoutMs: 110_000 },
  );
  let brief: Brief;
  try {
    const j = JSON.parse(res.text ?? "{}") as Partial<Brief>;
    brief = {
      language: String(j.language ?? ""),
      topic: String(j.topic ?? ""),
      speakers: (j.speakers ?? []).map(String).slice(0, 12),
      glossary: (j.glossary ?? []).slice(0, 150),
      outline: (j.outline ?? [])
        .filter((o) => Number.isFinite(o.start) && o.start < span && o.title)
        .map((o) => ({ start: Math.max(0, Math.round(o.start)), title: String(o.title) }))
        .sort((a, b) => a.start - b.start)
        .slice(0, 40),
    };
  } catch {
    brief = { language: "", topic: "", speakers: [], glossary: [], outline: [] };
  }
  await save(ctx, r.id, { brief });
}

async function writeSegment(
  ctx: AppContext,
  r: typeof transcripts.$inferSelect,
  from: number,
  to: number,
  locale: string,
) {
  const facts = await resourceFacts(ctx, r.resourceId);
  const brief = r.brief as Brief | null;
  const segs = r.segments as Segment[];
  const previous = segs
    .map((s) => s.text)
    .join("\n\n")
    .slice(-1800);
  const material = [
    `WORK\n${factsText(facts)}`,
    brief ? `BRIEF\n${briefText(brief)}` : "",
    previous ? `PREVIOUS (already written)\n…${previous}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const spoken = brief?.language || "the language that is spoken";
  const several = (brief?.speakers.length ?? 0) > 1;

  /** One request; `loose` = allowed to lightly rephrase (after a recitation block). */
  const attempt = async (a: number, b: number, loose: boolean) => {
    const headings = (brief?.outline ?? []).filter(
      (o) => o.start >= a - 3 && o.start < b - 3 && (a > 0 || o.start > 20),
    );
    const { part, clipped } = await mediaPart(ctx, r, a, b, 0.05);
    const range = clipped
      ? `the clip (${clock(a)}–${clock(b)} of the recording)`
      : `ONLY the part from ${clock(a)} to ${clock(b)} of this recording (ignore the rest)`;
    const rules = [
      `Write down ${range} of the work below.`,
      "You know the whole recording from the BRIEF: use its topic, speakers and glossary to understand every word and to spell names and terms exactly as listed. Resolve words that are hard to hear from that context and from the previous text. On-screen text may only help to spell names and terms; do not read it out.",
      "Never invent words, facts or quotes. If a word stays truly unclear after thinking, write your best reading followed by [?]. If there is no speech, output nothing.",
      "Continue exactly from where PREVIOUS ends; do not repeat it. A sentence cut at the clip edge may be completed only if clearly audible.",
      headings.length
        ? `These sections begin in this part: ${headings
            .map((h) => `"${h.title}" (~${clock(h.start)})`)
            .join(
              ", ",
            )}. Right before each one's first sentence put a heading line "## <short title>" written in ${
            r.mode === "notes" ? (locale === "en" ? "English" : "Uzbek (Latin)") : spoken
          } (translate the title if needed); no other headings.`
        : "Do not add headings.",
    ];
    const system =
      r.mode === "transcript"
        ? [
            ...rules,
            `Write in ${spoken}, exactly as spoken. NEVER translate and NEVER summarize: every sentence that is said must be in the text, in order. (Uzbek: standard modern Latin orthography — o‘, g‘, sh, ch, ʼ.)`,
            loose
              ? "Write it as a clean, readable text: keep the content and order of every sentence; you may lightly smooth the wording where speech is messy."
              : "Keep the speaker's words, word order and style. Correct only spelling, punctuation, capitalization and sentence boundaries by the language's grammar; drop filler sounds (uh, um, eee), stutters, false starts and accidental repetitions.",
            "Quran verses, hadith and other quotations: put them in «…» as spoken (Arabic in transliteration), followed by the speaker's translation if given.",
            several
              ? "One paragraph per thought, blank line between paragraphs. When the speaker changes (and it is clear who), start the paragraph with **Name:**. No timestamps, no comments."
              : "One paragraph per thought, blank line between paragraphs. No speaker labels, no timestamps, no comments.",
          ].join("\n")
        : [
            ...rules,
            "Write konspekt notes (not a transcript): every substantive idea, argument, evidence, example, definition, number, name and recommendation in the speaker's order; skip greetings and filler.",
            "Format: '- ' bullets with full, clear sentences, nested '  - ' for details, **bold** key terms, exact quotations in «…».",
            langRule(locale),
          ].join("\n");
    const res = await generate(
      [{ role: "user", parts: [part, { text: material }] }],
      {
        systemInstruction: system,
        temperature: 0,
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
        // Most care for transcripts: hard words are worked out from context.
        thinkingConfig: { thinkingBudget: r.deep ? (r.mode === "transcript" ? 4096 : 2048) : 512 },
      },
      { timeoutMs: 100_000 },
    );
    const blocked = res.candidates?.[0]?.finishReason === "RECITATION";
    return { text: blocked ? "" : (res.text ?? "").trim(), blocked };
  };

  // Gemini refuses verbatim text that matches published captions ("recitation").
  // Then the piece is halved (down to ~20 s, shorter matches pass), then a
  // lightly smoothed version is tried, and only then an honest gap marker.
  const piece = async (a: number, b: number): Promise<string> => {
    const out = await attempt(a, b, false);
    if (!out.blocked) return out.text;
    if (b - a > 40) {
      const mid = Math.round((a + b) / 2);
      return [await piece(a, mid), await piece(mid, b)].filter(Boolean).join(" ");
    }
    const loose = await attempt(a, b, true);
    return loose.blocked ? `[${clock(a)}–${clock(b)}: …]` : loose.text;
  };
  const text = await piece(from, to);
  await save(ctx, r.id, { segments: [...segs, { from, to, text }] });
}

/** Drops a heading that repeats the previous one (segments meeting at a section start). */
function tidy(md: string) {
  const out: string[] = [];
  let lastHeading = "";
  for (const line of md.split("\n")) {
    const h = /^##\s+(.+)$/.exec(line.trim());
    if (h) {
      if (h[1].trim() === lastHeading) continue;
      lastHeading = h[1].trim();
    } else if (line.trim()) lastHeading = "";
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function finish(ctx: AppContext, r: typeof transcripts.$inferSelect, locale: string) {
  const segs = r.segments as Segment[];
  // A sentence cut at a segment edge continues in the next one: glue it back.
  const joined = segs
    .map((s) => s.text.trim())
    .filter(Boolean)
    .reduce((acc, t) => {
      if (!acc) return t;
      const open = !/[.!?…»"”:)\]]$/.test(acc);
      const cont = /^[a-zа-яёʼ‘'(]/.test(t) || (/^[a-z]/i.test(t) && open && !/^#/.test(t));
      return open && cont ? `${acc} ${t}` : `${acc}\n\n${t}`;
    }, "");
  let text = tidy(joined);
  if (r.mode === "notes" && joined) {
    // Merge the per-segment notes into one konspekt (text only: cheap and fast).
    const brief = r.brief as Brief | null;
    try {
      const res = await generate(
        [
          {
            role: "user",
            parts: [
              {
                text: [
                  brief ? `BRIEF\n${briefText(brief)}` : "",
                  brief?.outline.length
                    ? `OUTLINE\n${brief.outline.map((o) => `- ${o.title}`).join("\n")}`
                    : "",
                  `NOTES (in order)\n${joined}`,
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
            ],
          },
        ],
        {
          systemInstruction: [
            "Turn these notes of one talk into a single, well-organised konspekt.",
            "Keep every substantive point, example, quotation and number; merge duplicates; keep the speaker's order.",
            "Structure: '## ' section headings (follow the OUTLINE when given), '- ' bullets with full sentences, nested details, **bold** key terms, quotations in «…».",
            "Start with a 2–3 sentence summary paragraph; end with '## ' + a heading for the key takeaways (3–7 bullets).",
            "Add nothing that is not in the notes. Spell names and terms as in the BRIEF.",
            langRule(locale),
          ].join("\n"),
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 1024 },
        },
        { timeoutMs: 110_000 },
      );
      text = tidy((res.text ?? "").trim()) || text;
    } catch {
      text = joined;
    }
  }
  await save(ctx, r.id, { text, status: "done", error: null });
}

/** One unit of work (study, one segment or the finish). Returns the new state. */
export async function stepTranscript(ctx: AppContext, id: string, locale: string) {
  const r = await load(ctx, id);
  if (r.status === "done") return info(r);
  await gate(ctx, "listen");
  try {
    if (!r.brief) {
      try {
        await study(ctx, r, locale);
      } catch (err) {
        // Limits stop the job; any other failure only costs the extra context:
        // carry on writing without a brief rather than getting stuck here.
        if (err instanceof AppError && (err.code === "AI_QUOTA" || err.code === "RATE_LIMITED"))
          throw err;
        await save(ctx, id, {
          brief: { language: "", topic: "", speakers: [], glossary: [], outline: [] },
        });
      }
    } else {
      const segs = r.segments as Segment[];
      const from = segs.at(-1)?.to ?? 0;
      if (from >= r.durationSeconds - 1) await finish(ctx, r, locale);
      else
        await writeSegment(
          ctx,
          r,
          from,
          Math.min(from + SEGMENT[r.mode as "transcript" | "notes"], r.durationSeconds),
          locale,
        );
    }
  } catch (err) {
    // Quota / limits: keep the work done so far; the user can resume later.
    if (err instanceof AppError) {
      await save(ctx, id, { error: err.code });
      throw err;
    }
    throw err;
  }
  const next = await load(ctx, id);
  if (next.error) await save(ctx, id, { error: null });
  return info({ ...next, error: null });
}
