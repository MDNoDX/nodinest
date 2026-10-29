/**
 * Röznoma — the daily planner and journal: routines (every day / some
 * weekdays / one day) checked off each day, the day's page (motto, title,
 * story, highlights, lesson, productive time, better than yesterday?), the
 * numbers over time, and reminders. Every day's page is also written into the
 * user's own book "Röznoma <year>" (Kitob yozish), so the year becomes a book.
 */
import "server-only";
import { and, asc, between, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import {
  botUsers,
  dayLogs,
  goalSteps,
  goals,
  ownBooks,
  resources,
  routineChecks,
  routines,
  user,
  writeups,
} from "@/db/schema";
import { addDays, dayKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { moderationIssue } from "@/lib/moderation";
import { dueOn, hijriDate, normalizeTime, percent, productivePercent } from "@/lib/roznoma";
import { docToPlain, sanitizeDoc, type WriteupDoc } from "@/lib/writeup-doc";
import { createOwnBook } from "./own-books";
import { hitRateLimit } from "./rate-limit";
import { esc, tgTo } from "./monitor/telegram";

const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();

export const routineInput = z.object({
  title: z.string().trim().min(1).max(160),
  amount: z.string().trim().max(60).nullish(),
  time: z.string().trim().max(5).nullish(),
  repeat: z.enum(["daily", "weekly", "once"]).default("daily"),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  onDay: dayStr.nullish(),
  alarm: z.boolean().default(true),
});

export type Routine = {
  id: string;
  title: string;
  amount: string | null;
  time: string | null;
  repeat: "daily" | "weekly" | "once";
  weekdays: number[];
  onDay: string | null;
  position: number;
  alarm: boolean;
  archived: boolean;
};

const cols = {
  id: routines.id,
  title: routines.title,
  amount: routines.amount,
  time: routines.time,
  repeat: routines.repeat,
  weekdays: routines.weekdays,
  onDay: routines.onDay,
  position: routines.position,
  alarm: routines.alarm,
  archived: routines.archived,
};

export async function listRoutines(ctx: AppContext): Promise<Routine[]> {
  return withUser(db, ctx, (tx) =>
    tx
      .select(cols)
      .from(routines)
      .where(and(eq(routines.userId, ctx.userId), eq(routines.archived, false)))
      .orderBy(
        asc(routines.position),
        sql`${routines.time} asc nulls last`,
        asc(routines.createdAt),
      ),
  );
}

export async function saveRoutine(ctx: AppContext, raw: unknown, id?: string) {
  const a = routineInput.parse(raw);
  if (moderationIssue(a.title)) throw new AppError("INDECENT");
  const v = {
    title: a.title,
    amount: a.amount || null,
    time: normalizeTime(a.time),
    repeat: a.repeat,
    weekdays: a.repeat === "weekly" ? [...new Set(a.weekdays)].sort() : [],
    onDay: a.repeat === "once" ? (a.onDay ?? null) : null,
    alarm: a.alarm,
    updatedAt: new Date(),
  };
  if (v.repeat === "weekly" && !v.weekdays.length) throw new AppError("VALIDATION", "weekdays");
  if (v.repeat === "once" && !v.onDay) throw new AppError("VALIDATION", "onDay");
  return withUser(db, ctx, async (tx) => {
    if (id) {
      const r = await tx
        .update(routines)
        .set(v)
        .where(and(eq(routines.id, uuid.parse(id)), eq(routines.userId, ctx.userId)))
        .returning({ id: routines.id });
      if (!r.length) throw new AppError("NOT_FOUND");
      return id;
    }
    const [{ n }] = await tx
      .select({ n: sql<number>`coalesce(max(${routines.position}), -1)::int + 1` })
      .from(routines)
      .where(eq(routines.userId, ctx.userId));
    const [row] = await tx
      .insert(routines)
      .values({ ...v, userId: ctx.userId, position: n })
      .returning({ id: routines.id });
    return row.id;
  });
}

export async function deleteRoutine(ctx: AppContext, id: string) {
  await withUser(db, ctx, (tx) =>
    tx
      .delete(routines)
      .where(and(eq(routines.id, uuid.parse(id)), eq(routines.userId, ctx.userId))),
  );
}

/** The day's list in the order the user dragged it into. */
export async function reorderRoutines(ctx: AppContext, ids: string[]) {
  const list = z.array(uuid).max(300).parse(ids);
  await withUser(db, ctx, async (tx) => {
    for (const [i, id] of list.entries())
      await tx
        .update(routines)
        .set({ position: i })
        .where(and(eq(routines.id, id), eq(routines.userId, ctx.userId)));
  });
}

/** Check (or uncheck) a routine on a day; `note` = how much ("35%", "1 ta"). */
export async function checkRoutine(
  ctx: AppContext,
  id: string,
  day: string,
  done: boolean,
  note?: string | null,
) {
  const rid = uuid.parse(id);
  const d = dayStr.parse(day);
  const n = z.string().trim().max(60).nullish().parse(note) || null;
  await withUser(db, ctx, async (tx) => {
    const [r] = await tx
      .select({ id: routines.id })
      .from(routines)
      .where(and(eq(routines.id, rid), eq(routines.userId, ctx.userId)));
    if (!r) throw new AppError("NOT_FOUND");
    if (!done) {
      await tx
        .delete(routineChecks)
        .where(and(eq(routineChecks.routineId, rid), eq(routineChecks.day, d)));
      return;
    }
    await tx
      .insert(routineChecks)
      .values({ routineId: rid, day: d, userId: ctx.userId, note: n })
      .onConflictDoUpdate({
        target: [routineChecks.routineId, routineChecks.day],
        set: { note: n },
      });
  });
}

export type DayItem = Routine & { done: boolean; note: string | null };
export type DayLog = {
  motto: string | null;
  title: string | null;
  story: string | null;
  highlights: string[];
  lesson: string | null;
  productiveMinutes: number | null;
  better: boolean | null;
};
const EMPTY_LOG: DayLog = {
  motto: null,
  title: null,
  story: null,
  highlights: [],
  lesson: null,
  productiveMinutes: null,
  better: null,
};

/** Everything of one day: its list (checked or not), its page and the motto. */
export async function getDay(ctx: AppContext, day: string, locale: string) {
  const d = dayStr.parse(day);
  const all = await listRoutines(ctx);
  const due = all.filter((r) => dueOn(r, d));
  const [checks, logs, lastMotto] = await withUser(db, ctx, (tx) =>
    Promise.all([
      due.length
        ? tx
            .select({ id: routineChecks.routineId, note: routineChecks.note })
            .from(routineChecks)
            .where(
              and(
                eq(routineChecks.userId, ctx.userId),
                eq(routineChecks.day, d),
                inArray(
                  routineChecks.routineId,
                  due.map((r) => r.id),
                ),
              ),
            )
        : Promise.resolve([]),
      tx
        .select()
        .from(dayLogs)
        .where(and(eq(dayLogs.userId, ctx.userId), eq(dayLogs.day, d))),
      // A motto stays until it is changed: the latest one before this day.
      tx
        .select({ motto: dayLogs.motto })
        .from(dayLogs)
        .where(
          and(
            eq(dayLogs.userId, ctx.userId),
            sql`${dayLogs.day} <= ${d}`,
            sql`${dayLogs.motto} is not null`,
          ),
        )
        .orderBy(desc(dayLogs.day))
        .limit(1),
    ]),
  );
  const done = new Map(checks.map((c) => [c.id, c.note]));
  const items: DayItem[] = due.map((r) => ({
    ...r,
    done: done.has(r.id),
    note: done.get(r.id) ?? null,
  }));
  const l = logs[0];
  const log: DayLog = l
    ? {
        motto: l.motto,
        title: l.title,
        story: l.story,
        highlights: l.highlights,
        lesson: l.lesson,
        productiveMinutes: l.productiveMinutes,
        better: l.better,
      }
    : EMPTY_LOG;
  return {
    day: d,
    hijri: hijriDate(d, locale),
    items,
    log,
    motto: log.motto ?? lastMotto[0]?.motto ?? null,
    done: items.filter((i) => i.done).length,
    total: items.length,
  };
}

export const dayLogInput = z.object({
  motto: z.string().trim().max(300).nullish(),
  title: z.string().trim().max(200).nullish(),
  story: z.string().trim().max(20_000).nullish(),
  highlights: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  lesson: z.string().trim().max(1000).nullish(),
  productiveMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .nullish(),
  better: z.boolean().nullish(),
});

/** Saves the day's page and writes it into the year's Röznoma book. */
export async function saveDayLog(ctx: AppContext, day: string, raw: unknown, locale: string) {
  const d = dayStr.parse(day);
  const a = dayLogInput.parse(raw);
  const v = {
    motto: a.motto || null,
    title: a.title || null,
    story: a.story || null,
    highlights: a.highlights,
    lesson: a.lesson || null,
    productiveMinutes: a.productiveMinutes ?? null,
    better: a.better ?? null,
    updatedAt: new Date(),
  };
  await withUser(db, ctx, (tx) =>
    tx
      .insert(dayLogs)
      .values({ ...v, userId: ctx.userId, day: d })
      .onConflictDoUpdate({ target: [dayLogs.userId, dayLogs.day], set: v }),
  );
  const page = await getDay(ctx, d, locale);
  return writeIntoBook(ctx, page, locale);
}

// ─── The year's book ──────────────────────────────────────────────────────────

type Node = WriteupDoc["content"][number];
const text = (s: string) => [{ type: "text", text: s }];
const para = (s: string): Node => ({ type: "paragraph", content: text(s) }) as Node;

function dayHeading(day: string, locale: string) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const tag = locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "uz-Latn-UZ";
  const long = new Intl.DateTimeFormat(tag, {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
  return long;
}

/** The book "Röznoma 2026" (made on the first saved day of the year). */
async function yearBook(ctx: AppContext, year: string, locale: string) {
  const title = `Röznoma ${year}`;
  const [found] = await withUser(db, ctx, (tx) =>
    tx
      .select({ id: resources.id })
      .from(ownBooks)
      .innerJoin(resources, eq(resources.id, ownBooks.resourceId))
      .where(and(eq(ownBooks.userId, ctx.userId), eq(resources.title, title))),
  );
  if (found) return found.id;
  return createOwnBook(ctx, {
    title,
    subtitle:
      locale === "ru" ? "Дневник года" : locale === "en" ? "The year's journal" : "Yil kundaligi",
    template: "blank",
    locale: locale === "uz-Cyrl" ? "uz" : locale,
  });
}

async function writeIntoBook(
  ctx: AppContext,
  page: Awaited<ReturnType<typeof getDay>>,
  locale: string,
) {
  const year = page.day.slice(0, 4);
  const bookId = await yearBook(ctx, year, locale);
  const heading = dayHeading(page.day, locale);
  const L = page.log;
  const ru = locale === "ru";
  const en = locale === "en";
  const section: Node[] = [
    {
      type: "heading",
      attrs: { level: 2 },
      content: text(`${heading}${page.hijri ? ` · ${page.hijri}` : ""}`),
    } as Node,
  ];
  if (L.title)
    section.push({ type: "heading", attrs: { level: 3 }, content: text(L.title) } as Node);
  if (page.items.length)
    section.push({
      type: "bulletList",
      content: page.items.map((i) => ({
        type: "listItem",
        content: [
          para(
            `${i.time ? `${i.time} ` : ""}${i.title}${i.amount ? ` — ${i.amount}` : ""}${i.note ? ` (${i.note})` : ""} ${i.done ? "✅" : "▫️"}`,
          ),
        ],
      })),
    } as Node);
  if (L.story) for (const p of L.story.split(/\n{2,}|\n/).filter(Boolean)) section.push(para(p));
  if (L.highlights.length)
    section.push({
      type: "bulletList",
      content: L.highlights.map((h) => ({ type: "listItem", content: [para(h)] })),
    } as Node);
  if (L.lesson) section.push(para(`✍️ ${L.lesson}`));
  const pct = productivePercent(L.productiveMinutes);
  if (L.productiveMinutes != null)
    section.push(
      para(
        `⏳ ${ru ? "Продуктивно" : en ? "Productive" : "Unumli"}: ${Math.round((L.productiveMinutes / 60) * 10) / 10} ${ru ? "ч" : en ? "h" : "soat"} | ${pct}%`,
      ),
    );
  if (L.better != null)
    section.push(
      para(
        `${ru ? "Лучше, чем вчера" : en ? "Better than yesterday" : "Keçagidan yaxşi"}: ${L.better ? "✅" : "❌"}`,
      ),
    );
  if (page.motto) section.push(para(`📕 «${page.motto}»`));

  await withUser(db, ctx, async (tx) => {
    const [w] = await tx
      .select({ doc: writeups.doc })
      .from(writeups)
      .where(and(eq(writeups.userId, ctx.userId), eq(writeups.resourceId, bookId)));
    const doc = (w?.doc as WriteupDoc | undefined) ?? { type: "doc", content: [] };
    const nodes = doc.content.filter(
      // The blank template's empty paragraph goes once there is a day.
      (n, i) => !(i === 0 && n.type === "paragraph" && !("content" in n && n.content)),
    );
    const isDay = (n: Node) =>
      n.type === "heading" && (n as { attrs?: { level?: number } }).attrs?.level === 2;
    const titleOf = (n: Node) =>
      ((n as { content?: { text?: string }[] }).content ?? []).map((c) => c.text ?? "").join("");
    const start = nodes.findIndex((n) => isDay(n) && titleOf(n).startsWith(heading));
    let out: Node[];
    if (start >= 0) {
      let end = nodes.findIndex((n, i) => i > start && isDay(n));
      if (end < 0) end = nodes.length;
      out = [...nodes.slice(0, start), ...section, ...nodes.slice(end)];
    } else out = [...nodes, ...section];
    const next = sanitizeDoc({ type: "doc", content: out });
    const plain = docToPlain(next);
    const words = plain.split(/\s+/).filter(Boolean).length;
    if (w)
      await tx
        .update(writeups)
        .set({ doc: next, plain, words, updatedAt: new Date() })
        .where(and(eq(writeups.userId, ctx.userId), eq(writeups.resourceId, bookId)));
    else
      await tx
        .insert(writeups)
        .values({ userId: ctx.userId, resourceId: bookId, doc: next, plain, words });
  });
  return { bookId };
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

/** The last `days` days: how much of each list was done, productive time, mood. */
export async function history(ctx: AppContext, today: string, days = 30) {
  const from = addDays(today, -(days - 1));
  const all = await withUser(db, ctx, (tx) =>
    tx
      .select({ ...cols, createdAt: routines.createdAt })
      .from(routines)
      .where(eq(routines.userId, ctx.userId)),
  );
  const [checks, logs] = await withUser(db, ctx, (tx) =>
    Promise.all([
      tx
        .select({ id: routineChecks.routineId, day: routineChecks.day })
        .from(routineChecks)
        .where(and(eq(routineChecks.userId, ctx.userId), between(routineChecks.day, from, today))),
      tx
        .select()
        .from(dayLogs)
        .where(and(eq(dayLogs.userId, ctx.userId), between(dayLogs.day, from, today))),
    ]),
  );
  const checked = new Set(checks.map((c) => `${c.id}|${c.day}`));
  const out: {
    day: string;
    done: number;
    total: number;
    pct: number;
    productive: number | null;
    better: boolean | null;
  }[] = [];
  const missed = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    // A routine counts from the day it was made (and archived ones too, for the past).
    // A routine counts from the day it was made (or any day it was ticked).
    const due = all.filter(
      (r) =>
        dueOn({ ...r, archived: false }, d) &&
        (dayKey(r.createdAt, "UTC") <= d || checked.has(`${r.id}|${d}`)),
    );
    const done = due.filter((r) => checked.has(`${r.id}|${d}`)).length;
    for (const r of due)
      if (!checked.has(`${r.id}|${d}`) && d < today)
        missed.set(r.title, (missed.get(r.title) ?? 0) + 1);
    const l = logs.find((x) => x.day === d);
    out.push({
      day: d,
      done,
      total: due.length,
      pct: percent(done, due.length),
      productive: l?.productiveMinutes ?? null,
      better: l?.better ?? null,
    });
  }
  const withList = out.filter((x) => x.total > 0);
  let streak = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    const x = out[i];
    if (x.day === today && x.pct < 80) continue; // today is not over yet
    if (x.total > 0 && x.pct >= 80) streak++;
    else break;
  }
  return {
    days: out,
    average: withList.length
      ? Math.round(withList.reduce((a, x) => a + x.pct, 0) / withList.length)
      : 0,
    streak,
    productiveHours: Math.round((out.reduce((a, x) => a + (x.productive ?? 0), 0) / 60) * 10) / 10,
    better: out.filter((x) => x.better === true).length,
    worse: out.filter((x) => x.better === false).length,
    missed: [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

// ─── Goal steps ───────────────────────────────────────────────────────────────

/** A new goal made of steps ("Sertifikat olish": test → kurs → imtihon). */
export async function createStepGoal(
  ctx: AppContext,
  raw: { title: string; note?: string | null; steps: string[] },
) {
  const a = z
    .object({
      title: z.string().trim().min(1).max(200),
      note: z.string().trim().max(2000).nullish(),
      steps: z.array(z.string().trim().min(1).max(200)).max(50),
    })
    .parse(raw);
  if ([a.title, a.note, ...a.steps].some((s) => moderationIssue(s))) throw new AppError("INDECENT");
  return withUser(db, ctx, async (tx) => {
    const [g] = await tx
      .insert(goals)
      .values({
        userId: ctx.userId,
        title: a.title,
        note: a.note || null,
        metric: "steps",
        period: "year",
        target: Math.max(1, a.steps.length),
      })
      .returning({ id: goals.id });
    if (a.steps.length)
      await tx
        .insert(goalSteps)
        .values(
          a.steps.map((title, i) => ({ goalId: g.id, userId: ctx.userId, title, position: i })),
        );
    return g.id;
  });
}

export async function addGoalStep(ctx: AppContext, goalId: string, title: string) {
  const t = z.string().trim().min(1).max(200).parse(title);
  const gid = uuid.parse(goalId);
  return withUser(db, ctx, async (tx) => {
    const [g] = await tx
      .select({ id: goals.id, metric: goals.metric })
      .from(goals)
      .where(and(eq(goals.id, gid), eq(goals.userId, ctx.userId)));
    if (!g) throw new AppError("NOT_FOUND");
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(goalSteps)
      .where(eq(goalSteps.goalId, gid));
    const [s] = await tx
      .insert(goalSteps)
      .values({ goalId: gid, userId: ctx.userId, title: t, position: n })
      .returning({ id: goalSteps.id });
    if (g.metric !== "steps")
      await tx.update(goals).set({ metric: "steps" }).where(eq(goals.id, gid));
    return s.id;
  });
}

export async function setGoalStep(ctx: AppContext, stepId: string, done: boolean | null) {
  const id = uuid.parse(stepId);
  await withUser(db, ctx, async (tx) => {
    if (done === null)
      await tx.delete(goalSteps).where(and(eq(goalSteps.id, id), eq(goalSteps.userId, ctx.userId)));
    else
      await tx
        .update(goalSteps)
        .set({ done })
        .where(and(eq(goalSteps.id, id), eq(goalSteps.userId, ctx.userId)));
    // All steps done → the goal is achieved (and back to active when one is unchecked).
    const [s] = await tx
      .select({ goalId: goalSteps.goalId })
      .from(goalSteps)
      .where(eq(goalSteps.id, id));
    if (!s) return;
    const [c] = await tx.execute<{ all: number; done: number }>(sql`
      select count(*)::int as all, count(*) filter (where done)::int as done
      from nodinest.goal_steps where goal_id = ${s.goalId}`);
    await tx
      .update(goals)
      .set({ status: c.all > 0 && c.done === c.all ? "achieved" : "active" })
      .where(
        and(
          eq(goals.id, s.goalId),
          eq(goals.userId, ctx.userId),
          sql`${goals.status} <> 'archived'`,
        ),
      );
  });
}

// ─── Reminders (Telegram; the site itself rings while it is open) ──────────────

/**
 * Run every few minutes (cron): a Telegram message at each routine's time
 * (once a day per routine) and, at 21:30 local time, what is still undone.
 * Only for users who connected the bot.
 */
export async function sendReminders(now = new Date()) {
  const people = await db
    .select({ userId: user.id, tz: user.timezone, tg: botUsers.tgId, locale: user.locale })
    .from(botUsers)
    .innerJoin(user, eq(user.id, botUsers.userId))
    .where(and(eq(botUsers.blocked, false), eq(user.status, "active")));
  let sent = 0;
  for (const p of people) {
    const ctx: AppContext = { userId: p.userId, role: "user" };
    const today = dayKey(now, p.tz);
    const hm = new Intl.DateTimeFormat("en-GB", {
      timeZone: p.tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
    const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    const nowMin = mins(hm);
    const page = await getDay(ctx, today, p.locale);
    const uz = p.locale !== "ru" && p.locale !== "en";
    for (const i of page.items) {
      if (i.done || !i.alarm || !i.time) continue;
      const t = mins(i.time);
      if (nowMin < t || nowMin - t > 15) continue;
      if (!(await hitRateLimit(db, `remind:${i.id}:${today}`, 1, 86_400)).allowed) continue;
      await tgTo(
        p.tg,
        `⏰ <b>${esc(i.time)}</b> — ${esc(i.title)}${i.amount ? ` · ${esc(i.amount)}` : ""}\n${uz ? "Bajarsangiz, Röznoma’da belgilab qöying ✅" : p.locale === "ru" ? "Когда сделаете, отметьте в Рузнома ✅" : "Tick it off in your Röznoma when done ✅"}`,
      ).catch(() => null);
      sent++;
    }
    const left = page.items.filter((i) => !i.done);
    if (left.length && nowMin >= 21 * 60 + 30 && nowMin < 22 * 60 + 30) {
      if ((await hitRateLimit(db, `remind-eod:${p.userId}:${today}`, 1, 86_400)).allowed) {
        await tgTo(
          p.tg,
          `🌙 ${uz ? `Kun tugayapti: ${left.length} ta iş qoldi` : p.locale === "ru" ? `День заканчивается: осталось ${left.length}` : `The day is ending: ${left.length} left`}\n${left
            .slice(0, 8)
            .map((i) => `• ${esc(i.title)}`)
            .join("\n")}`,
        ).catch(() => null);
        sent++;
      }
    }
  }
  return sent;
}
