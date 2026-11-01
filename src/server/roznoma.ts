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
import { GOAL_KINDS, guessIcon } from "@/lib/plan-icons";
import { PRAYERS, prayerTimes, type Prayer } from "@/lib/prayer";
import {
  amountTarget,
  type CheckStatus,
  dayPercent,
  dueOn,
  hijriDate,
  normalizeTime,
  productivePercent,
} from "@/lib/roznoma";
import { docToPlain, sanitizeDoc, type WriteupDoc } from "@/lib/writeup-doc";
import { createOwnBook } from "./own-books";
import { hitRateLimit } from "./rate-limit";
import { esc, tgTo } from "./monitor/telegram";

const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();

export const routineInput = z.object({
  title: z.string().trim().min(1).max(160),
  icon: z.string().trim().max(24).nullish(),
  note: z.string().trim().max(500).nullish(),
  amount: z.string().trim().max(60).nullish(),
  time: z.string().trim().max(5).nullish(),
  endTime: z.string().trim().max(5).nullish(),
  prayer: z.enum(PRAYERS).nullish(),
  repeat: z.enum(["daily", "weekly", "once"]).default("daily"),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  onDay: dayStr.nullish(),
  startsOn: dayStr.nullish(),
  endsOn: dayStr.nullish(),
  alarm: z.boolean().default(true),
  sound: z.string().trim().max(60).nullish(),
  inJournal: z.boolean().default(true),
  parentId: uuid.nullish(),
  /** Stored in the plans (archive), not on the day. */
  archived: z.boolean().default(false),
});

export type Routine = {
  id: string;
  title: string;
  icon: string | null;
  note: string | null;
  parentId: string | null;
  amount: string | null;
  time: string | null;
  endTime: string | null;
  prayer: Prayer | null;
  repeat: "daily" | "weekly" | "once";
  weekdays: number[];
  onDay: string | null;
  startsOn: string | null;
  endsOn: string | null;
  position: number;
  alarm: boolean;
  sound: string | null;
  inJournal: boolean;
  archived: boolean;
};

const cols = {
  id: routines.id,
  title: routines.title,
  icon: routines.icon,
  note: routines.note,
  parentId: routines.parentId,
  amount: routines.amount,
  time: routines.time,
  endTime: routines.endTime,
  prayer: routines.prayer,
  repeat: routines.repeat,
  weekdays: routines.weekdays,
  onDay: routines.onDay,
  startsOn: routines.startsOn,
  endsOn: routines.endsOn,
  position: routines.position,
  alarm: routines.alarm,
  sound: routines.sound,
  inJournal: routines.inJournal,
  archived: routines.archived,
};

async function loadRoutines(ctx: AppContext): Promise<Routine[]> {
  const rows = await withUser(db, ctx, (tx) =>
    tx
      .select(cols)
      .from(routines)
      .where(eq(routines.userId, ctx.userId))
      .orderBy(asc(routines.position), asc(routines.createdAt)),
  );
  return rows as Routine[];
}

/** Everything the user has: on the day and stored in the plans. */
export const listRoutines = loadRoutines;

const DEFAULTS: Record<"uz" | "ru" | "en", Record<string, string>> = {
  uz: {
    wake: "Uyğoniş",
    move: "Badan tarbiya",
    l1: "1-dars",
    l2: "2-dars",
    l3: "3-dars",
    rest: "Dam oliş",
    fajr: "Bomdod",
    dhikr: "Zikrlar",
    study: "Şuğullaniş",
    read: "Kitob öqiş",
    lang: "Til örganiş",
    water: "Suv içiş",
    review: "Kunlik tahlil",
    sleep: "Uyqu",
    walk: "Sayr",
  },
  ru: {
    wake: "Подъём",
    move: "Зарядка",
    l1: "1-й урок",
    l2: "2-й урок",
    l3: "3-й урок",
    rest: "Отдых",
    fajr: "Фаджр",
    dhikr: "Зикр",
    study: "Занятия",
    read: "Чтение",
    lang: "Изучение языка",
    water: "Вода",
    review: "Итоги дня",
    sleep: "Сон",
    walk: "Прогулка",
  },
  en: {
    wake: "Wake up",
    move: "Exercise",
    l1: "Lesson 1",
    l2: "Lesson 2",
    l3: "Lesson 3",
    rest: "Rest",
    fajr: "Fajr",
    dhikr: "Dhikr",
    study: "Study",
    read: "Reading",
    lang: "Language practice",
    water: "Water",
    review: "Daily review",
    sleep: "Sleep",
    walk: "Walk",
  },
};
const UNIT_WORDS: Record<"uz" | "ru" | "en", Record<string, string>> = {
  uz: { min: "daqiqa", page: "bet", piece: "ta", hour: "soat" },
  ru: { min: "минут", page: "страниц", piece: "", hour: "часов" },
  en: { min: "minutes", page: "pages", piece: "", hour: "hours" },
};

/** A new account starts with an ordinary day and ten ready plans (once only). */
export async function ensureDefaults(ctx: AppContext, locale: string) {
  const [u] = await db
    .select({ seeded: user.plansSeeded })
    .from(user)
    .where(eq(user.id, ctx.userId));
  if (!u || u.seeded) return;
  const l = locale === "ru" ? "ru" : locale === "en" ? "en" : "uz";
  const T = DEFAULTS[l];
  const U = UNIT_WORDS[l];
  const amount = (n: number, k: string) => `${n} ${U[k]}`.trim();
  type Seed = Partial<Routine> & { title: string };
  const day: Seed[] = [
    { title: T.wake, icon: "sunrise", prayer: "fajr" },
    { title: T.move, icon: "dumbbell", amount: amount(20, "min"), time: "07:00" },
    { title: T.l1, icon: "grad", time: "09:00" },
    { title: T.l2, icon: "grad", time: "11:00" },
    { title: T.l3, icon: "grad", time: "15:00" },
    { title: T.rest, icon: "rest", time: "21:30", alarm: false },
  ];
  const stored: Seed[] = [
    { title: T.fajr, icon: "hand", prayer: "fajr" },
    { title: T.dhikr, icon: "sparkles", amount: amount(100, "piece") },
    { title: T.study, icon: "bulb", amount: amount(1, "hour") },
    { title: T.read, icon: "book", amount: amount(20, "page"), time: "21:00" },
    { title: T.lang, icon: "languages", amount: amount(30, "min"), time: "18:00" },
    { title: T.water, icon: "waves", amount: amount(8, "piece") },
    { title: T.walk, icon: "footprints", amount: amount(30, "min") },
    { title: T.review, icon: "notebook", amount: amount(10, "min"), time: "22:00" },
    { title: T.sleep, icon: "bed", time: "23:00" },
    { title: T.move, icon: "activity", amount: amount(20, "min") },
  ];
  await db.transaction(async (tx) => {
    // Only the first caller seeds, even with two tabs open at once.
    const won = await tx
      .update(user)
      .set({ plansSeeded: true })
      .where(and(eq(user.id, ctx.userId), eq(user.plansSeeded, false)))
      .returning({ id: user.id });
    if (!won.length) return;
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(routines)
      .where(eq(routines.userId, ctx.userId));
    // Someone who already planned keeps the list; only the ideas are added.
    await tx.insert(routines).values(
      [...(n ? [] : day), ...stored].map((r, i) => ({
        userId: ctx.userId,
        title: r.title,
        icon: r.icon ?? null,
        amount: r.amount ?? null,
        time: r.time ?? null,
        prayer: r.prayer ?? null,
        alarm: r.alarm ?? true,
        repeat: "daily" as const,
        position: n + i,
        archived: stored.includes(r),
      })),
    );
  });
}

export async function saveRoutine(ctx: AppContext, raw: unknown, id?: string) {
  const a = routineInput.parse(raw);
  if ([a.title, a.note].some((v) => moderationIssue(v))) throw new AppError("INDECENT");
  const v = {
    title: a.title,
    icon: a.icon || guessIcon(a.title),
    note: a.note || null,
    amount: a.amount || null,
    time: a.prayer ? null : normalizeTime(a.time),
    endTime: normalizeTime(a.endTime),
    prayer: a.prayer ?? null,
    repeat: a.repeat,
    weekdays: a.repeat === "weekly" ? [...new Set(a.weekdays)].sort() : [],
    onDay: a.repeat === "once" ? (a.onDay ?? null) : null,
    startsOn: a.startsOn ?? null,
    endsOn: a.endsOn ?? null,
    alarm: a.alarm,
    sound: a.sound || null,
    inJournal: a.inJournal,
    parentId: a.parentId ?? null,
    updatedAt: new Date(),
  };
  if (v.repeat === "weekly" && !v.weekdays.length) throw new AppError("VALIDATION", "weekdays");
  if (v.repeat === "once" && !v.onDay) throw new AppError("VALIDATION", "onDay");
  return withUser(db, ctx, async (tx) => {
    if (v.parentId) {
      const [p] = await tx
        .select({ id: routines.id, parent: routines.parentId })
        .from(routines)
        .where(and(eq(routines.id, v.parentId), eq(routines.userId, ctx.userId)));
      if (!p || p.parent) throw new AppError("VALIDATION", "parent");
    }
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
      .values({ ...v, archived: a.archived, userId: ctx.userId, position: n })
      .returning({ id: routines.id });
    return row.id;
  });
}

/** Taken off the day, or brought back with its amount and time intact. */
export async function setArchived(ctx: AppContext, ids: string[], archived: boolean, day?: string) {
  const list = z.array(uuid).min(1).max(200).parse(ids);
  await withUser(db, ctx, async (tx) => {
    await tx
      .update(routines)
      .set({ archived, updatedAt: new Date() })
      .where(and(inArray(routines.id, list), eq(routines.userId, ctx.userId)));
    // A one-day item brought back lands on the day it was added to.
    if (!archived && day)
      await tx
        .update(routines)
        .set({ onDay: dayStr.parse(day) })
        .where(
          and(
            inArray(routines.id, list),
            eq(routines.userId, ctx.userId),
            eq(routines.repeat, "once"),
          ),
        );
  });
}

/** For good (with its past ticks and inner items): only from the plans. */
export async function deleteRoutines(ctx: AppContext, ids: string[]) {
  const list = z.array(uuid).min(1).max(200).parse(ids);
  await withUser(db, ctx, async (tx) => {
    await tx
      .delete(routines)
      .where(and(inArray(routines.parentId, list), eq(routines.userId, ctx.userId)));
    await tx
      .delete(routines)
      .where(and(inArray(routines.id, list), eq(routines.userId, ctx.userId)));
  });
}

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

/**
 * A routine on a day: done, partly done (value = how much of the amount), or
 * not done (with a reason); null clears it. On an item with inner items it
 * applies to all of them.
 */
export async function checkRoutine(
  ctx: AppContext,
  id: string,
  day: string,
  state: { status: CheckStatus | null; value?: number | null; note?: string | null },
) {
  const rid = uuid.parse(id);
  const d = dayStr.parse(day);
  const st = z.enum(["done", "partial", "skipped"]).nullable().parse(state.status);
  const value = z.number().min(0).max(100_000).nullish().parse(state.value) ?? null;
  const note = z.string().trim().max(200).nullish().parse(state.note) || null;
  if (moderationIssue(note)) throw new AppError("INDECENT");
  await withUser(db, ctx, async (tx) => {
    const [r] = await tx
      .select({ id: routines.id })
      .from(routines)
      .where(and(eq(routines.id, rid), eq(routines.userId, ctx.userId)));
    if (!r) throw new AppError("NOT_FOUND");
    const subs = await tx
      .select({ id: routines.id })
      .from(routines)
      .where(and(eq(routines.parentId, rid), eq(routines.userId, ctx.userId)));
    for (const target of [rid, ...subs.map((x) => x.id)]) {
      if (!st) {
        await tx
          .delete(routineChecks)
          .where(and(eq(routineChecks.routineId, target), eq(routineChecks.day, d)));
        continue;
      }
      const v = { status: st, value: st === "partial" ? value : null, note };
      await tx
        .insert(routineChecks)
        .values({ routineId: target, day: d, userId: ctx.userId, ...v })
        .onConflictDoUpdate({ target: [routineChecks.routineId, routineChecks.day], set: v });
    }
  });
}

type Check = { id: string; day: string; note: string | null; status: string; value: number | null };

export type SubItem = Routine & {
  status: CheckStatus | null;
  value: number | null;
  note2: string | null;
};
export type DayItem = Routine & {
  done: boolean;
  status: CheckStatus | null;
  value: number | null;
  /** The note of the day's check (why it was skipped). */
  note2: string | null;
  /** Days in a row it was done up to this day. */
  streak: number;
  subs: SubItem[];
};
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

/** One day's list with its state; an item with inner items takes its state from them. */
function dayItems(all: Routine[], checks: Check[], day: string) {
  const of = new Map(checks.filter((c) => c.day === day).map((c) => [c.id, c]));
  const top = all.filter((r) => !r.parentId && dueOn(r, day));
  return top.map((r) => {
    const c = of.get(r.id);
    const subs: SubItem[] = all
      .filter((x) => x.parentId === r.id && !x.archived)
      .map((x) => {
        const sc = of.get(x.id);
        return {
          ...x,
          status: (sc?.status as CheckStatus | undefined) ?? null,
          value: sc?.value ?? null,
          note2: sc?.note ?? null,
        };
      });
    let status = (c?.status as CheckStatus | undefined) ?? null;
    let value = c?.value ?? null;
    if (subs.length) {
      const counted = subs.filter((x) => x.status !== "skipped");
      const pct = dayPercent(subs);
      status = !counted.length
        ? "skipped"
        : pct >= 100
          ? "done"
          : subs.some((x) => x.status)
            ? "partial"
            : null;
      value = status === "partial" ? pct : null;
    }
    return {
      ...r,
      amount: subs.length ? null : r.amount,
      status,
      value,
      note2: c?.note ?? null,
      subs,
    };
  });
}

/** Everything of one day: its list (with state), its page and the motto. */
export async function getDay(ctx: AppContext, day: string, locale: string) {
  const d = dayStr.parse(day);
  const [all, [place]] = await Promise.all([
    loadRoutines(ctx),
    db
      .select({ lat: user.lat, lng: user.lng, tz: user.timezone })
      .from(user)
      .where(eq(user.id, ctx.userId)),
  ]);
  const times = prayerTimes(d, place ?? { lat: null, lng: null }, place?.tz ?? "Asia/Tashkent");
  const [checks, logs, lastMotto] = await withUser(db, ctx, (tx) =>
    Promise.all([
      tx
        .select({
          id: routineChecks.routineId,
          day: routineChecks.day,
          note: routineChecks.note,
          status: routineChecks.status,
          value: routineChecks.value,
        })
        .from(routineChecks)
        .where(
          and(eq(routineChecks.userId, ctx.userId), between(routineChecks.day, addDays(d, -60), d)),
        ),
      tx
        .select()
        .from(dayLogs)
        .where(and(eq(dayLogs.userId, ctx.userId), eq(dayLogs.day, d))),
      // A motto stays until it is changed: the latest one up to this day.
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
  const doneOn = new Set(checks.filter((c) => c.status === "done").map((c) => `${c.id}|${c.day}`));
  const streakOf = (r: Routine) => {
    let n = 0;
    for (let k = 0, x = d; k < 60; k++, x = addDays(x, -1)) {
      if (!dueOn(r, x)) continue;
      if (doneOn.has(`${r.id}|${x}`)) n++;
      else if (x !== d) break;
    }
    return n;
  };
  const items: DayItem[] = dayItems(all, checks, d).map((r) => ({
    ...r,
    // A prayer-linked item shows that prayer's time at the user's place.
    time: r.prayer ? times[r.prayer] : r.time,
    done: r.status === "done",
    streak: r.repeat === "once" ? 0 : streakOf(r),
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
    percent: dayPercent(items),
    prayers: times,
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
  return syncDay(ctx, d, locale);
}

/** The day as it stands goes into the book (after ticks, or saving the page). */
export async function syncDay(ctx: AppContext, day: string, locale: string) {
  const page = await getDay(ctx, dayStr.parse(day), locale);
  const hasPage = !!(
    page.log.title ||
    page.log.story ||
    page.log.highlights.length ||
    page.log.lesson
  );
  if (!hasPage && !page.items.some((i) => i.status && i.inJournal)) return { bookId: null };
  return writeIntoBook(ctx, page, locale);
}

// ─── The year's book ──────────────────────────────────────────────────────────

type Node = WriteupDoc["content"][number];
const text = (s: string) => [{ type: "text", text: s }];
const para = (s: string): Node => ({ type: "paragraph", content: text(s) }) as Node;

const tagOf = (locale: string) =>
  locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "uz-Latn-UZ";
const dateOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

/** "29 · payşanba": a day inside its month's chapter (starts with the day's number). */
function dayHeading(day: string, locale: string) {
  const w = new Intl.DateTimeFormat(tagOf(locale), { weekday: "long", timeZone: "UTC" }).format(
    dateOf(day),
  );
  return `${Number(day.slice(8))} · ${w}`;
}

/** The month's chapter title. */
function monthHeading(day: string, locale: string) {
  const m = new Intl.DateTimeFormat(tagOf(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateOf(day));
  return (m.charAt(0).toUpperCase() + m.slice(1)).replace(",", "");
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
  const month = monthHeading(page.day, locale);
  const L = page.log;
  const ru = locale === "ru";
  const en = locale === "en";
  // Chapters are months (H2), days are their headings (H3).
  const section: Node[] = [
    {
      type: "heading",
      attrs: { level: 3 },
      content: text(
        `${heading}${page.hijri ? ` · ${page.hijri}` : ""}${L.title ? ` — ${L.title}` : ""}`,
      ),
    } as Node,
  ];
  const shown = page.items.filter((i) => i.inJournal && i.status);
  if (shown.length)
    section.push({
      type: "bulletList",
      content: shown.map((i) => ({
        type: "listItem",
        content: [
          para(
            `${i.time ? `${i.time} ` : ""}${i.title}${i.amount ? ` — ${i.amount}` : ""}${
              i.status === "partial" && i.value != null
                ? ` (${i.value}${amountTarget(i.amount) ? `/${amountTarget(i.amount)}` : "%"})`
                : ""
            }${i.note2 ? ` — ${i.note2}` : ""} ${i.done ? "✅" : i.status === "partial" ? "◐" : "✖️"}`,
          ),
        ],
      })),
    } as Node);
  if (L.story) for (const p of L.story.split(/\n+/).filter(Boolean)) section.push(para(p));
  if (L.highlights.length)
    section.push({
      type: "bulletList",
      content: L.highlights.map((h) => ({ type: "listItem", content: [para(h)] })),
    } as Node);
  if (L.lesson) section.push(para(`✍️ ${L.lesson}`));
  if (L.productiveMinutes != null)
    section.push(
      para(
        `⏳ ${ru ? "Продуктивно" : en ? "Productive" : "Unumli"}: ${Math.round((L.productiveMinutes / 60) * 10) / 10} ${ru ? "ч" : en ? "h" : "soat"} | ${productivePercent(L.productiveMinutes)}%`,
      ),
    );
  if (page.motto) section.push(para(`📕 «${page.motto}»`));

  const level = (n: Node) =>
    n.type === "heading" ? ((n as { attrs?: { level?: number } }).attrs?.level ?? 0) : 0;
  const titleOf = (n: Node) =>
    ((n as { content?: { text?: string }[] }).content ?? []).map((c) => c.text ?? "").join("");
  const isDay = (n: Node) => level(n) === 3 && /^\d{1,2} · /.test(titleOf(n));
  const dayNo = (n: Node) => Number(/^(\d{1,2}) · /.exec(titleOf(n))?.[1] ?? 0);

  await withUser(db, ctx, async (tx) => {
    const [w] = await tx
      .select({ doc: writeups.doc })
      .from(writeups)
      .where(and(eq(writeups.userId, ctx.userId), eq(writeups.resourceId, bookId)));
    const doc = (w?.doc as WriteupDoc | undefined) ?? { type: "doc", content: [] };
    // The blank template's first heading and empty paragraph go once there is a day.
    let nodes = doc.content.filter(
      (n) =>
        !(n.type === "paragraph" && !("content" in n && n.content)) &&
        !(level(n) === 2 && /^(1-bob|1-боб|Chapter 1|Глава 1)$/.test(titleOf(n))),
    );
    // The month's chapter (added when its first day is written).
    let m = nodes.findIndex((n) => level(n) === 2 && titleOf(n) === month);
    if (m < 0) {
      nodes = [...nodes, { type: "heading", attrs: { level: 2 }, content: text(month) } as Node];
      m = nodes.length - 1;
    }
    let end = nodes.findIndex((n, i) => i > m && level(n) === 2);
    if (end < 0) end = nodes.length;
    const inMonth = nodes.slice(m + 1, end);
    const at = inMonth.findIndex((n) => isDay(n) && titleOf(n).startsWith(heading));
    let out: Node[];
    if (at >= 0) {
      let stop = inMonth.findIndex((n, i) => i > at && isDay(n));
      if (stop < 0) stop = inMonth.length;
      out = [...inMonth.slice(0, at), ...section, ...inMonth.slice(stop)];
    } else {
      // Days stay in order, also when an earlier day is filled in later.
      const today = Number(page.day.slice(8));
      const next = inMonth.findIndex((n) => isDay(n) && dayNo(n) > today);
      out =
        next < 0
          ? [...inMonth, ...section]
          : [...inMonth.slice(0, next), ...section, ...inMonth.slice(next)];
    }
    const next = sanitizeDoc({
      type: "doc",
      content: [...nodes.slice(0, m + 1), ...out, ...nodes.slice(end)],
    });
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

/** The last month (kept 30 days): each day, and this week against the last. */
export async function history(ctx: AppContext, today: string, days = 30) {
  const from = addDays(today, -(days - 1));
  const [all, created] = await Promise.all([
    loadRoutines(ctx),
    withUser(db, ctx, (tx) =>
      tx
        .select({ id: routines.id, createdAt: routines.createdAt })
        .from(routines)
        .where(eq(routines.userId, ctx.userId)),
    ),
  ]);
  const born = new Map(created.map((r) => [r.id, dayKey(r.createdAt, "UTC")]));
  const [checks, logs] = await withUser(db, ctx, (tx) =>
    Promise.all([
      tx
        .select({
          id: routineChecks.routineId,
          day: routineChecks.day,
          note: routineChecks.note,
          status: routineChecks.status,
          value: routineChecks.value,
        })
        .from(routineChecks)
        .where(and(eq(routineChecks.userId, ctx.userId), between(routineChecks.day, from, today))),
      tx
        .select()
        .from(dayLogs)
        .where(and(eq(dayLogs.userId, ctx.userId), between(dayLogs.day, from, today))),
    ]),
  );
  const out = Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i);
    const checkedThatDay = new Set(checks.filter((c) => c.day === d).map((c) => c.id));
    // Archived items count for the days they were used; a plan counts from its first day.
    const list = all
      .map((r) => ({ ...r, archived: false }))
      .filter((r) => (born.get(r.id) ?? "") <= d || checkedThatDay.has(r.id));
    const items = dayItems(list, checks, d).filter(
      (r) => !all.find((x) => x.id === r.id)?.archived || r.status,
    );
    const l = logs.find((x) => x.day === d);
    return {
      day: d,
      done: items.filter((x) => x.status === "done").length,
      total: items.length,
      pct: dayPercent(items),
      productive: l?.productiveMinutes ?? null,
      better: l?.better ?? null,
    };
  });
  const avg = (xs: typeof out) => {
    const w = xs.filter((x) => x.total > 0);
    return w.length ? Math.round(w.reduce((a, x) => a + x.pct, 0) / w.length) : null;
  };
  const sum = (xs: typeof out) => xs.reduce((a, x) => a + (x.productive ?? 0), 0);
  const week = out.slice(-7);
  const prev = out.slice(-14, -7);
  let streak = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    const x = out[i];
    if (x.day === today && x.pct < 80) continue; // today is not over yet
    if (x.total > 0 && x.pct >= 80) streak++;
    else break;
  }
  return {
    days: out,
    average: avg(out) ?? 0,
    streak,
    week: { pct: avg(week), minutes: sum(week) },
    prev: { pct: avg(prev), minutes: sum(prev) },
    bestDay: [...week].filter((x) => x.total).sort((a, b) => b.pct - a.pct)[0] ?? null,
    today: out[out.length - 1],
    yesterday: out[out.length - 2],
  };
}

// ─── Goals ────────────────────────────────────────────────────────────────────

const stepInput = z.object({
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(300).nullish(),
});

/** A goal: a name, a deadline, a kind, and the steps it consists of. */
export async function createGoal(ctx: AppContext, raw: unknown) {
  const a = z
    .object({
      title: z.string().trim().min(1).max(200),
      note: z.string().trim().max(2000).nullish(),
      kind: z.enum(GOAL_KINDS).nullish(),
      dueOn: dayStr.nullish(),
      steps: z.array(stepInput).max(50).default([]),
    })
    .parse(raw);
  if (
    [a.title, a.note, ...a.steps.flatMap((s) => [s.title, s.note])].some((s) => moderationIssue(s))
  )
    throw new AppError("INDECENT");
  return withUser(db, ctx, async (tx) => {
    const [g] = await tx
      .insert(goals)
      .values({
        userId: ctx.userId,
        title: a.title,
        note: a.note || null,
        kind: a.kind ?? null,
        dueOn: a.dueOn ?? null,
        metric: "steps",
        period: "year",
        target: Math.max(1, a.steps.length),
      })
      .returning({ id: goals.id });
    if (a.steps.length)
      await tx.insert(goalSteps).values(
        a.steps.map((s, i) => ({
          goalId: g.id,
          userId: ctx.userId,
          title: s.title,
          note: s.note || null,
          position: i,
        })),
      );
    return g.id;
  });
}

export async function addGoalStep(ctx: AppContext, goalId: string, raw: unknown) {
  const s = stepInput.parse(raw);
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
    const [row] = await tx
      .insert(goalSteps)
      .values({
        goalId: gid,
        userId: ctx.userId,
        title: s.title,
        note: s.note || null,
        position: n,
      })
      .returning({ id: goalSteps.id });
    if (g.metric !== "steps")
      await tx.update(goals).set({ metric: "steps" }).where(eq(goals.id, gid));
    return row.id;
  });
}

/** Ticks a step; every step done = the goal reached. Returns whether it just was. */
export async function setGoalStep(ctx: AppContext, stepId: string, done: boolean | null) {
  const id = uuid.parse(stepId);
  return withUser(db, ctx, async (tx) => {
    const [s] = await tx
      .select({ goalId: goalSteps.goalId })
      .from(goalSteps)
      .where(and(eq(goalSteps.id, id), eq(goalSteps.userId, ctx.userId)));
    if (!s) throw new AppError("NOT_FOUND");
    if (done === null) await tx.delete(goalSteps).where(eq(goalSteps.id, id));
    else await tx.update(goalSteps).set({ done }).where(eq(goalSteps.id, id));
    const [c] = await tx.execute<{ all: number; done: number }>(sql`
      select count(*)::int as all, count(*) filter (where done)::int as done
      from nodinest.goal_steps where goal_id = ${s.goalId}`);
    const reached = c.all > 0 && c.done === c.all;
    await tx
      .update(goals)
      .set({ status: reached ? "achieved" : "active", missed: false })
      .where(
        and(
          eq(goals.id, s.goalId),
          eq(goals.userId, ctx.userId),
          sql`${goals.status} <> 'archived'`,
        ),
      );
    return { reached };
  });
}

/** The deadline came: reached, or not (either way it moves to the archive). */
export async function resolveGoal(ctx: AppContext, id: string, reached: boolean) {
  await withUser(db, ctx, (tx) =>
    tx
      .update(goals)
      .set({ status: reached ? "achieved" : "archived", missed: !reached })
      .where(and(eq(goals.id, uuid.parse(id)), eq(goals.userId, ctx.userId))),
  );
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
        `⏰ <b>${esc(i.time)}</b> — ${esc(i.title)}${i.amount ? ` · ${esc(i.amount)}` : ""}\n${uz ? "Bajarsangiz, Rejalar’da belgilab qöying ✅" : p.locale === "ru" ? "Когда сделаете, отметьте в Планах ✅" : "Tick it off in Plans when done ✅"}`,
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
