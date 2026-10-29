/**
 * The companion's memory of each user. After a few talk turns, the recent
 * conversation is folded into a small profile (interests, level, language and
 * vocabulary, goals, facts the user shared). It is given back to the AI in
 * that user's talks only; the superadmin sees all of it (Admin → Insights).
 */
import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { aiMemory, aiMessages, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generate } from "./gemini";

export const memorySchema = z.object({
  interests: z.array(z.string().max(60)).max(20).default([]),
  level: z.string().max(200).default(""),
  language: z.string().max(300).default(""),
  goals: z.array(z.string().max(160)).max(10).default([]),
  facts: z.array(z.string().max(200)).max(25).default([]),
  style: z.string().max(300).default(""),
});
export type Memory = z.infer<typeof memorySchema>;

/** Update after this many talk turns (one cheap AI request each time). */
const EVERY = 4;

export async function getMemory(userId: string): Promise<Memory | null> {
  const [r] = await db.select().from(aiMemory).where(eq(aiMemory.userId, userId));
  const p = memorySchema.safeParse(r?.memory ?? null);
  return p.success ? p.data : null;
}

/** The memory as lines for the prompt. */
export function memoryText(m: Memory | null) {
  if (!m) return "(nothing yet — this is how you get to know them)";
  return [
    m.interests.length && `Interests: ${m.interests.join(", ")}`,
    m.level && `Knowledge / level: ${m.level}`,
    m.language && `Language and vocabulary: ${m.language}`,
    m.style && `How they like to talk: ${m.style}`,
    m.goals.length && `Goals: ${m.goals.join("; ")}`,
    m.facts.length && `Things they told you: ${m.facts.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Counts a talk turn; every few turns folds the conversation into the memory. */
export async function noteTurn(ctx: AppContext, conversationId: string) {
  const [r] = await db
    .insert(aiMemory)
    .values({ userId: ctx.userId, memory: memorySchema.parse({}), pending: 1 })
    .onConflictDoUpdate({
      target: aiMemory.userId,
      set: { pending: sql`${aiMemory.pending} + 1` },
    })
    .returning({ pending: aiMemory.pending });
  if ((r?.pending ?? 0) < EVERY) return;
  await refreshMemory(ctx, conversationId).catch(() => {
    /* the next turns try again */
  });
}

async function refreshMemory(ctx: AppContext, conversationId: string) {
  const old = await getMemory(ctx.userId);
  const recent = await withUser(db, ctx, (tx) =>
    tx
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(desc(aiMessages.createdAt))
      .limit(16),
  );
  const talk = recent
    .reverse()
    .map((m) => `${m.role === "user" ? "USER" : "AI"}: ${m.content.slice(0, 1200)}`)
    .join("\n");
  const res = await generate(
    [
      {
        role: "user",
        parts: [
          {
            text: `CURRENT MEMORY (JSON):\n${JSON.stringify(old ?? memorySchema.parse({}))}\n\nRECENT CONVERSATION:\n${talk}`,
          },
        ],
      },
    ],
    {
      systemInstruction: `You keep a learning companion's memory of ONE user. Update the memory with what the recent conversation shows: their interests (topics, authors, genres), knowledge level, the language they speak and their vocabulary (simple / rich, dialect, favourite words), how they like to be talked to, their goals, and lasting facts they told about themselves (work, studies, city, family — only what they said). Keep what is still true, merge duplicates, drop trivia and anything said only by the AI. Never store passwords, card numbers, health or other sensitive details. Short phrases, in English. Return JSON only.`,
      temperature: 0.2,
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
    },
    { timeoutMs: 60_000 },
  );
  let next: Memory;
  try {
    next = memorySchema.parse(JSON.parse(res.text ?? "{}"));
  } catch {
    return;
  }
  await db
    .update(aiMemory)
    .set({ memory: next, pending: 0, updatedAt: new Date() })
    .where(eq(aiMemory.userId, ctx.userId));
}

/** Admin → Insights: every user's memory and the interests most people share. */
export async function memoryInsights(ctx: AppContext) {
  if (ctx.role !== "superadmin") throw new AppError("FORBIDDEN");
  const rows = await db
    .select({
      userId: aiMemory.userId,
      memory: aiMemory.memory,
      updatedAt: aiMemory.updatedAt,
      name: user.name,
      username: user.username,
    })
    .from(aiMemory)
    .innerJoin(user, eq(user.id, aiMemory.userId))
    .orderBy(desc(aiMemory.updatedAt))
    .limit(500);
  const people = rows
    .map((r) => ({ ...r, memory: memorySchema.safeParse(r.memory) }))
    .filter((r) => r.memory.success)
    .map((r) => ({ ...r, memory: (r.memory as { data: Memory }).data }));
  const count = new Map<string, number>();
  for (const p of people)
    for (const i of new Set(p.memory.interests.map((x) => x.toLowerCase().trim())))
      count.set(i, (count.get(i) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  return { people, top };
}
