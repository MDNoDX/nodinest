/**
 * Messages between two people (Chatlar): text, photos, voice, video, PDFs and
 * shared items. Only the two people see a conversation (RLS on dm_threads /
 * dm_messages; the admin is not one of them). Anyone may write to a public
 * profile; a private one only to people it follows or who follow it, or who
 * already talk with it. A block stops both sides.
 */
import "server-only";
import { and, desc, eq, inArray, isNull, lt, gt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import {
  dmMessages,
  dmThreads,
  files,
  follows,
  notifications,
  resources,
  user,
  userBlocks,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { normalizeText } from "@/lib/normalize";
import { normalizeUsername } from "@/lib/username";
import { notify } from "./notifications";
import { enforceRateLimit } from "./rate-limit";
import { ensureInLibrary } from "./records";

export type DmPerson = { id: string; name: string; username: string; image: string | null };
export type DmMessage = {
  id: string;
  senderId: string;
  body: string | null;
  createdAt: string;
  deleted: boolean;
  file: { id: string; name: string; mime: string; size: number | null } | null;
  item: {
    id: string;
    title: string;
    type: string;
    coverUrl: string | null;
    coverFileId: string | null;
  } | null;
  reply: { id: string; senderId: string; text: string | null; kind: Kind } | null;
};
type Kind = "text" | "photo" | "voice" | "video" | "file" | "item" | "deleted";
export type DmThreadRow = {
  id: string;
  other: DmPerson;
  lastAt: string;
  last: { senderId: string; text: string | null; kind: Kind } | null;
  unread: number;
};

const PAGE = 50;
const uuid = z.string().uuid();
const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

/** What a message is, for previews ("📷 Rasm") and replies. */
function kindOf(m: { deleted?: boolean; mime?: string | null; item?: boolean }): Kind {
  if (m.deleted) return "deleted";
  if (m.mime?.startsWith("image/")) return "photo";
  if (m.mime?.startsWith("audio/")) return "voice";
  if (m.mime?.startsWith("video/")) return "video";
  if (m.mime) return "file";
  if (m.item) return "item";
  return "text";
}

async function people(ids: string[]): Promise<Map<string, DmPerson>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: user.id, name: user.name, username: user.username, image: user.image })
    .from(user)
    .where(inArray(user.id, ids));
  return new Map(rows.map((r) => [r.id, { ...r, username: r.username ?? "" }]));
}

async function isBlocked(a: string, b: string) {
  const [x] = await db
    .select({ id: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return !!x;
}

/** May I start a conversation with this person? (An existing one stays open unless blocked.) */
async function mayStart(me: string, other: string) {
  if (me === other) return false;
  const [o] = await db
    .select({ open: user.profilePublic, status: user.status, username: user.username })
    .from(user)
    .where(eq(user.id, other));
  if (!o || o.status !== "active" || !o.username) return false;
  if (await isBlocked(me, other)) return false;
  if (o.open) return true;
  const [f] = await db
    .select({ x: follows.followerId })
    .from(follows)
    .where(
      or(
        and(eq(follows.followerId, me), eq(follows.followeeId, other)),
        and(eq(follows.followerId, other), eq(follows.followeeId, me)),
      ),
    )
    .limit(1);
  return !!f;
}

async function myThread(ctx: AppContext, threadId: string) {
  const id = uuid.parse(threadId);
  const [t] = await withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(dmThreads)
      .where(
        and(
          eq(dmThreads.id, id),
          or(eq(dmThreads.aId, ctx.userId), eq(dmThreads.bId, ctx.userId)),
        ),
      ),
  );
  if (!t) throw new AppError("NOT_FOUND");
  const mine = t.aId === ctx.userId;
  return {
    ...t,
    otherId: mine ? t.bId : t.aId,
    myRead: mine ? t.aReadAt : t.bReadAt,
    otherRead: mine ? t.bReadAt : t.aReadAt,
    side: mine ? ("a" as const) : ("b" as const),
  };
}

/** The conversation with a person (by username), started when allowed. */
export async function openThread(ctx: AppContext, username: string) {
  const [o] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        sql`lower(${user.username}) = ${normalizeUsername(username)}`,
        eq(user.status, "active"),
      ),
    );
  if (!o || o.id === ctx.userId) throw new AppError("NOT_FOUND");
  const [a, b] = pair(ctx.userId, o.id);
  const find = () =>
    withUser(db, ctx, (tx) =>
      tx
        .select({ id: dmThreads.id })
        .from(dmThreads)
        .where(and(eq(dmThreads.aId, a), eq(dmThreads.bId, b))),
    );
  const [found] = await find();
  if (found) return found.id;
  if (!(await mayStart(ctx.userId, o.id))) throw new AppError("FORBIDDEN", "dm_closed");
  await withUser(db, ctx, (tx) =>
    tx.insert(dmThreads).values({ aId: a, bId: b }).onConflictDoNothing(),
  );
  const [made] = await find();
  if (!made) throw new AppError("INTERNAL");
  return made.id;
}

/** My conversations, newest first, with the last message and how many I have not read. */
export async function threadList(ctx: AppContext): Promise<DmThreadRow[]> {
  const rows = await withUser(db, ctx, (tx) =>
    tx.execute<{
      id: string;
      otherId: string;
      lastAt: Date;
      lastSender: string | null;
      lastBody: string | null;
      lastFile: string | null;
      lastItem: string | null;
      lastDeleted: boolean | null;
      unread: number;
    }>(sql`
      select t.id, case when t.a_id = ${ctx.userId} then t.b_id else t.a_id end as "otherId",
        t.last_at as "lastAt", m.sender_id as "lastSender", m.body as "lastBody",
        m.file_id as "lastFile", m.resource_id as "lastItem", m.deleted_at is not null as "lastDeleted",
        (select count(*)::int from nodinest.dm_messages u
          where u.thread_id = t.id and u.sender_id <> ${ctx.userId} and u.deleted_at is null
            and u.created_at > coalesce(case when t.a_id = ${ctx.userId} then t.a_read_at
              else t.b_read_at end, '-infinity'::timestamptz)) as unread
      from nodinest.dm_threads t
      left join lateral (select * from nodinest.dm_messages x where x.thread_id = t.id
        order by x.created_at desc limit 1) m on true
      where ${ctx.userId} in (t.a_id, t.b_id) and m.id is not null
      order by t.last_at desc
      limit 200`),
  );
  const who = await people([...new Set(rows.map((r) => r.otherId))]);
  const mimes = await fileMeta(rows.map((r) => r.lastFile).filter(Boolean) as string[]);
  return rows
    .filter((r) => who.has(r.otherId))
    .map((r) => ({
      id: r.id,
      other: who.get(r.otherId)!,
      lastAt: new Date(r.lastAt).toISOString(),
      unread: r.unread,
      last: r.lastSender
        ? {
            senderId: r.lastSender,
            text: r.lastDeleted ? null : r.lastBody,
            kind: kindOf({
              deleted: !!r.lastDeleted,
              mime: r.lastFile ? (mimes.get(r.lastFile)?.mime ?? "x/file") : null,
              item: !!r.lastItem,
            }),
          }
        : null,
    }));
}

/** Files of messages already checked to be mine to read. */
async function fileMeta(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; mime: string; size: number | null }>();
  const rows = await db
    .select({ id: files.id, name: files.originalName, mime: files.mimeType, size: files.sizeBytes })
    .from(files)
    .where(and(inArray(files.id, ids), isNull(files.deletedAt)));
  return new Map(rows.map((r) => [r.id, { name: r.name, mime: r.mime, size: r.size }]));
}

type Row = typeof dmMessages.$inferSelect;

async function shape(rows: Row[], replies: Row[] = []): Promise<DmMessage[]> {
  const all = [...rows, ...replies];
  const fm = await fileMeta([...new Set(all.map((r) => r.fileId).filter(Boolean) as string[])]);
  const itemIds = [...new Set(rows.map((r) => r.resourceId).filter(Boolean) as string[])];
  const items = itemIds.length
    ? await db
        .select({
          id: resources.id,
          title: resources.title,
          type: resources.type,
          coverUrl: resources.coverUrl,
          coverFileId: resources.coverFileId,
        })
        .from(resources)
        .where(inArray(resources.id, itemIds))
    : [];
  const im = new Map(items.map((i) => [i.id, { ...i, type: String(i.type) }]));
  const rm = new Map(all.map((r) => [r.id, r]));
  return rows.map((r) => {
    const deleted = !!r.deletedAt;
    const f = !deleted && r.fileId ? fm.get(r.fileId) : undefined;
    const q = r.replyToId ? rm.get(r.replyToId) : undefined;
    return {
      id: r.id,
      senderId: r.senderId,
      body: deleted ? null : r.body,
      createdAt: r.createdAt.toISOString(),
      deleted,
      file: f && r.fileId ? { id: r.fileId, ...f } : null,
      item: !deleted && r.resourceId ? (im.get(r.resourceId) ?? null) : null,
      reply: q
        ? {
            id: q.id,
            senderId: q.senderId,
            text: q.deletedAt ? null : q.body,
            kind: kindOf({
              deleted: !!q.deletedAt,
              mime: q.fileId ? (fm.get(q.fileId)?.mime ?? "x/file") : null,
              item: !!q.resourceId,
            }),
          }
        : null,
    };
  });
}

async function withReplies(ctx: AppContext, threadId: string, rows: Row[]) {
  const ids = rows.map((r) => r.replyToId).filter((x): x is string => !!x);
  const have = new Set(rows.map((r) => r.id));
  const need = [...new Set(ids.filter((x) => !have.has(x)))];
  const extra = need.length
    ? await withUser(db, ctx, (tx) =>
        tx
          .select()
          .from(dmMessages)
          .where(and(eq(dmMessages.threadId, threadId), inArray(dmMessages.id, need))),
      )
    : [];
  return shape(rows, extra);
}

/** One conversation: the other person, whether I can write, and the newest messages. */
export async function threadView(ctx: AppContext, threadId: string) {
  const t = await myThread(ctx, threadId);
  const [rows, who, blockedByMe, blocked] = await Promise.all([
    withUser(db, ctx, (tx) =>
      tx
        .select()
        .from(dmMessages)
        .where(eq(dmMessages.threadId, t.id))
        .orderBy(desc(dmMessages.createdAt))
        .limit(PAGE),
    ),
    people([t.otherId]),
    db
      .select({ x: userBlocks.blockedId })
      .from(userBlocks)
      .where(and(eq(userBlocks.blockerId, ctx.userId), eq(userBlocks.blockedId, t.otherId))),
    isBlocked(ctx.userId, t.otherId),
  ]);
  const other = who.get(t.otherId);
  if (!other) throw new AppError("NOT_FOUND");
  await markRead(ctx, t.id);
  return {
    id: t.id,
    other,
    canWrite: !blocked,
    blockedByMe: blockedByMe.length > 0,
    otherReadAt: t.otherRead?.toISOString() ?? null,
    messages: (await withReplies(ctx, t.id, rows.reverse())) as DmMessage[],
    more: rows.length === PAGE,
  };
}

/** Older messages (scrolling up) or newer ones (the open conversation asking every few seconds). */
export async function messagesAround(
  ctx: AppContext,
  threadId: string,
  o: { before?: string; after?: string },
) {
  const t = await myThread(ctx, threadId);
  const before = o.before ? z.coerce.date().parse(o.before) : null;
  const after = o.after ? z.coerce.date().parse(o.after) : null;
  // Nothing new: one cheap answer for the poll.
  if (after && !before && t.lastAt <= after)
    return { messages: [], otherReadAt: t.otherRead?.toISOString() ?? null, more: false };
  const rows = await withUser(db, ctx, (tx) =>
    tx
      .select()
      .from(dmMessages)
      .where(
        and(
          eq(dmMessages.threadId, t.id),
          before ? lt(dmMessages.createdAt, before) : undefined,
          after ? gt(dmMessages.createdAt, after) : undefined,
        ),
      )
      .orderBy(after && !before ? dmMessages.createdAt : desc(dmMessages.createdAt))
      .limit(PAGE),
  );
  const ordered = after && !before ? rows : rows.reverse();
  if (after && ordered.some((r) => r.senderId !== ctx.userId)) await markRead(ctx, t.id);
  return {
    messages: await withReplies(ctx, t.id, ordered),
    otherReadAt: t.otherRead?.toISOString() ?? null,
    more: !!before && rows.length === PAGE,
  };
}

/** Changes since a moment, also deletions (for the open conversation). */
export async function deletedSince(ctx: AppContext, threadId: string, since: string) {
  const t = await myThread(ctx, threadId);
  const d = z.coerce.date().parse(since);
  const rows = await withUser(db, ctx, (tx) =>
    tx
      .select({ id: dmMessages.id })
      .from(dmMessages)
      .where(and(eq(dmMessages.threadId, t.id), gt(dmMessages.deletedAt, d))),
  );
  return rows.map((r) => r.id);
}

export async function markRead(ctx: AppContext, threadId: string) {
  const t = await myThread(ctx, threadId);
  await withUser(db, ctx, (tx) =>
    tx
      .update(dmThreads)
      .set(t.side === "a" ? { aReadAt: new Date() } : { bReadAt: new Date() })
      .where(eq(dmThreads.id, t.id)),
  );
  // The bell's "new message" from this person is read too.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, ctx.userId),
        eq(notifications.kind, "message"),
        eq(notifications.actorId, t.otherId),
        isNull(notifications.readAt),
      ),
    );
}

const sendInput = z
  .object({
    body: z.string().trim().max(4000).optional(),
    fileId: uuid.optional(),
    resourceId: uuid.optional(),
    replyToId: uuid.optional(),
  })
  .refine((v) => !!(v.body || v.fileId || v.resourceId), { message: "empty" });

export async function sendMessage(ctx: AppContext, threadId: string, raw: unknown) {
  const v = sendInput.parse(raw);
  const t = await myThread(ctx, threadId);
  if (await isBlocked(ctx.userId, t.otherId)) throw new AppError("FORBIDDEN", "dm_blocked");
  await enforceRateLimit(db, `dm:${ctx.userId}`, 40, 60);
  await enforceRateLimit(db, `dm-day:${ctx.userId}`, 1500, 86_400);
  if (v.fileId) {
    // Only my own uploaded file goes into a message.
    const [f] = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.id, v.fileId),
          eq(files.ownerId, ctx.userId),
          isNull(files.deletedAt),
          sql`${files.uploadedAt} is not null`,
        ),
      );
    if (!f) throw new AppError("NOT_FOUND");
  }
  if (v.resourceId) {
    // Something from my library, or a card someone shows publicly.
    const [ok] = await db.execute<{ ok: number }>(sql`
      select 1 as ok from nodinest.learning_records lr
      join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
      join nodinest."user" u on u.id = lr.user_id
      where lr.resource_id = ${v.resourceId}
        and (lr.user_id = ${ctx.userId} or (lr.visibility = 'public' and u.status = 'active'
          and (u.profile_public or exists(select 1 from nodinest.follows f
            where f.follower_id = ${ctx.userId} and f.followee_id = u.id))))
      limit 1`);
    if (!ok) throw new AppError("NOT_FOUND");
  }
  const now = new Date();
  const [row] = await withUser(db, ctx, async (tx) => {
    if (v.replyToId) {
      const [q] = await tx
        .select({ id: dmMessages.id })
        .from(dmMessages)
        .where(and(eq(dmMessages.id, v.replyToId), eq(dmMessages.threadId, t.id)));
      if (!q) v.replyToId = undefined;
    }
    const made = await tx
      .insert(dmMessages)
      .values({
        threadId: t.id,
        senderId: ctx.userId,
        body: v.body || null,
        fileId: v.fileId ?? null,
        resourceId: v.resourceId ?? null,
        replyToId: v.replyToId ?? null,
        createdAt: now,
      })
      .returning();
    await tx
      .update(dmThreads)
      .set(t.side === "a" ? { lastAt: now, aReadAt: now } : { lastAt: now, bReadAt: now })
      .where(eq(dmThreads.id, t.id));
    return made;
  });
  const [made] = await withReplies(ctx, t.id, [row]);
  // Rings once until they read it (notify() keeps one unread per person).
  const preview = (v.body ?? "").replace(/\s+/g, " ").slice(0, 120) || null;
  await notify(t.otherId, "message", {
    actorId: ctx.userId,
    body: preview ?? made.file?.name ?? made.item?.title ?? null,
    href: `/chats/${t.id}`,
  }).catch(() => null);
  return made;
}

/** Deletes my message for both of us (its text and file link go). */
export async function deleteMessage(ctx: AppContext, messageId: string) {
  const id = uuid.parse(messageId);
  const done = await withUser(db, ctx, (tx) =>
    tx
      .update(dmMessages)
      .set({ deletedAt: new Date(), body: null, fileId: null, resourceId: null })
      .where(
        and(
          eq(dmMessages.id, id),
          eq(dmMessages.senderId, ctx.userId),
          isNull(dmMessages.deletedAt),
        ),
      )
      .returning({ id: dmMessages.id }),
  );
  if (!done.length) throw new AppError("NOT_FOUND");
}

export async function setBlocked(ctx: AppContext, otherId: string, on: boolean) {
  const id = uuid.parse(otherId);
  if (id === ctx.userId) throw new AppError("VALIDATION");
  await withUser(db, ctx, (tx) =>
    on
      ? tx.insert(userBlocks).values({ blockerId: ctx.userId, blockedId: id }).onConflictDoNothing()
      : tx
          .delete(userBlocks)
          .where(and(eq(userBlocks.blockerId, ctx.userId), eq(userBlocks.blockedId, id))),
  );
}

/** How many conversations have something I have not read (the badge). */
export async function unreadChats(ctx: AppContext) {
  const [r] = await withUser(db, ctx, (tx) =>
    tx.execute<{ n: number }>(sql`
      select count(*)::int as n from nodinest.dm_threads t
      where ${ctx.userId} in (t.a_id, t.b_id) and exists(
        select 1 from nodinest.dm_messages m where m.thread_id = t.id
          and m.sender_id <> ${ctx.userId} and m.deleted_at is null
          and m.created_at > coalesce(case when t.a_id = ${ctx.userId} then t.a_read_at
            else t.b_read_at end, '-infinity'::timestamptz))`),
  );
  return r?.n ?? 0;
}

/** Words in my conversations (the search over the chat list). */
export async function searchMessages(ctx: AppContext, q: string) {
  const k = normalizeText(q).slice(0, 60);
  if (k.length < 2) return [];
  const like = `%${k.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await withUser(db, ctx, (tx) =>
    tx.execute<{ id: string; threadId: string; body: string; createdAt: Date; otherId: string }>(
      sql`
      select m.id, m.thread_id as "threadId", m.body, m.created_at as "createdAt",
        case when t.a_id = ${ctx.userId} then t.b_id else t.a_id end as "otherId"
      from nodinest.dm_messages m
      join nodinest.dm_threads t on t.id = m.thread_id
      where ${ctx.userId} in (t.a_id, t.b_id) and m.deleted_at is null and m.body is not null
        and nodinest.nn_norm(m.body) like ${like}
      order by m.created_at desc
      limit 20`,
    ),
  );
  const who = await people([...new Set(rows.map((r) => r.otherId))]);
  return rows
    .filter((r) => who.has(r.otherId))
    .map((r) => ({
      id: r.id,
      threadId: r.threadId,
      body: r.body,
      at: new Date(r.createdAt).toISOString(),
      other: who.get(r.otherId)!,
    }));
}

/** Puts an item someone sent me into my library (only its card, never files or text). */
export async function takeShared(ctx: AppContext, messageId: string) {
  const id = uuid.parse(messageId);
  const [m] = await withUser(db, ctx, (tx) =>
    tx
      .select({ resourceId: dmMessages.resourceId })
      .from(dmMessages)
      .where(and(eq(dmMessages.id, id), isNull(dmMessages.deletedAt))),
  );
  if (!m?.resourceId) throw new AppError("NOT_FOUND");
  const rid = m.resourceId;
  await withUser(db, ctx, (tx) => ensureInLibrary(tx, ctx.userId, rid));
  return rid;
}
