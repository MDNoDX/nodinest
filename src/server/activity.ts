import "server-only";
/**
 * Likes on comments, who liked a post or a comment, and "My activity"
 * (Settings → Activity): the posts I liked, my comments and the comments I
 * liked, sorted and filtered by date, removable one by one or many at once.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { commentLikes, postComments, postLikes } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { notify } from "./notifications";
import { commentHref, visiblePost } from "./social";

const uuid = z.string().uuid();
const GUEST_ID = "00000000-0000-0000-0000-000000000000";

/** A comment on a post I may see: the comment and its post, or NOT_FOUND. */
async function visibleComment(ctx: AppContext, commentId: string) {
  const id = uuid.parse(commentId);
  const [c] = await db
    .select({
      id: postComments.id,
      recordId: postComments.recordId,
      userId: postComments.userId,
      body: postComments.body,
    })
    .from(postComments)
    .where(and(eq(postComments.id, id), isNull(postComments.deletedAt)));
  if (!c) throw new AppError("NOT_FOUND");
  const post = await visiblePost(ctx, c.recordId);
  return { ...c, post };
}

/** 👍 on a comment; returns how many it has now. */
export async function setCommentLike(ctx: AppContext, commentId: string, on: boolean) {
  const c = await visibleComment(ctx, commentId);
  const added = await withUser(db, ctx, (tx) =>
    on
      ? tx
          .insert(commentLikes)
          .values({ commentId: c.id, userId: ctx.userId })
          .onConflictDoNothing()
          .returning({ id: commentLikes.commentId })
      : tx
          .delete(commentLikes)
          .where(and(eq(commentLikes.commentId, c.id), eq(commentLikes.userId, ctx.userId)))
          .returning({ id: commentLikes.commentId }),
  );
  if (on && added.length && c.userId !== ctx.userId)
    await notify(c.userId, "comment_like", {
      actorId: ctx.userId,
      body: c.body ? c.body.slice(0, 120) : c.post.title,
      href: commentHref(c.post, c.id),
    }).catch(() => null);
  const [n] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from nodinest.comment_likes where comment_id = ${c.id}`,
  );
  return Number(n?.n ?? 0);
}

export type Liker = {
  id: string;
  name: string;
  username: string;
  image: string | null;
  me: boolean;
  isFollowing: boolean;
  requested: boolean;
  /** A private profile I may not see inside (the button asks to follow). */
  locked: boolean;
};

/** Who liked a post or a comment, newest first (anyone who may see the post may look). */
export async function likers(
  ctx: AppContext,
  kind: "post" | "comment",
  id: string,
): Promise<Liker[]> {
  const table =
    kind === "post"
      ? sql`(select l.user_id, l.created_at from nodinest.post_likes l
             where l.record_id = ${(await visiblePost(ctx, id)).id})`
      : sql`(select l.user_id, l.created_at from nodinest.comment_likes l
             where l.comment_id = ${(await visibleComment(ctx, id)).id})`;
  const canSee = sql`(u.profile_public or u.id = ${ctx.userId} or exists (
    select 1 from nodinest.follows f where f.follower_id = ${ctx.userId} and f.followee_id = u.id))`;
  const rows = await db.execute<Omit<Liker, "me">>(sql`
    select u.id, u.name, u.username, u.image,
      exists(select 1 from nodinest.follows f
        where f.follower_id = ${ctx.userId} and f.followee_id = u.id) as "isFollowing",
      exists(select 1 from nodinest.follow_requests q
        where q.requester_id = ${ctx.userId} and q.target_id = u.id) as requested,
      not ${canSee} as locked
    from ${table} l
    join nodinest."user" u on u.id = l.user_id and u.status = 'active' and u.username is not null
    order by l.created_at desc
    limit 1000`);
  return rows.map((r) => ({
    ...r,
    me: r.id === ctx.userId,
    isFollowing: !!r.isFollowing,
    requested: !!r.requested,
    locked: !!r.locked,
  }));
}

// ─── My activity ────────────────────────────────────────────────────────────

export const ACTIVITY_KINDS = ["likes", "comments", "commentLikes"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityItem = {
  /** What a removal takes: the post (likes) or the comment. */
  key: string;
  at: string;
  /** The post: its title, cover and owner. */
  title: string;
  cover: string | null;
  type: string;
  owner: { name: string; username: string; image: string | null };
  href: string;
  /** Comments: the text (mine, or the one I liked) and whose it is. */
  body?: string | null;
  gif?: { url: string; w: number; h: number } | null;
  author?: { name: string; username: string; image: string | null } | null;
  reply?: boolean;
  /** The post is no longer public (the link may not open). */
  hidden: boolean;
};

const activityQuery = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  sort: z.enum(["new", "old"]).default("new"),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  offset: z.number().int().min(0).max(100_000).default(0),
});
export type ActivityQuery = z.input<typeof activityQuery>;

const PAGE = 30;

/** One page of my activity, with the totals of every kind (for the tabs). */
export async function myActivity(ctx: AppContext, raw: ActivityQuery) {
  if (ctx.userId === GUEST_ID) throw new AppError("UNAUTHENTICATED");
  const q = activityQuery.parse(raw);
  const me = ctx.userId;
  // Days are the person's own (their time zone).
  const day = (col: ReturnType<typeof sql.raw>) =>
    sql`(${col} at time zone coalesce((select timezone from nodinest."user" where id = ${me}), 'UTC'))::date`;
  const range = (col: ReturnType<typeof sql.raw>) =>
    sql`${q.from ? sql`and ${day(col)} >= ${q.from}::date` : sql``}
        ${q.to ? sql`and ${day(col)} <= ${q.to}::date` : sql``}`;
  const dir = q.sort === "old" ? sql`asc` : sql`desc`;
  const post = sql`
    r.title, coalesce('/api/files/' || r.cover_file_id || '?w=160', r.cover_url) as cover,
    r.type::text as type, o.name as "ownerName", o.username as "ownerUsername",
    o.image as "ownerImage", r.id as "resourceId", lr.visibility <> 'public' as hidden`;
  const postJoin = sql`
    join nodinest.learning_records lr on lr.id = x.record_id
    join nodinest.resources r on r.id = lr.resource_id
    join nodinest."user" o on o.id = lr.user_id`;

  type Row = {
    key: string;
    at: Date;
    title: string;
    cover: string | null;
    type: string;
    ownerName: string;
    ownerUsername: string | null;
    ownerImage: string | null;
    resourceId: string;
    hidden: boolean;
    body?: string | null;
    gif?: { url: string; w: number; h: number } | null;
    authorName?: string | null;
    authorUsername?: string | null;
    authorImage?: string | null;
    reply?: boolean;
  };
  let rows: Row[];
  if (q.kind === "likes") {
    rows = await db.execute<Row>(sql`
      select x.record_id as key, x.created_at as at, ${post}
      from nodinest.post_likes x ${postJoin}
      where x.user_id = ${me} ${range(sql.raw("x.created_at"))}
      order by x.created_at ${dir}
      limit ${PAGE + 1} offset ${q.offset}`);
  } else if (q.kind === "comments") {
    rows = await db.execute<Row>(sql`
      select x.id as key, x.created_at as at, x.body, x.gif, x.parent_id is not null as reply, ${post}
      from nodinest.post_comments x ${postJoin}
      where x.user_id = ${me} and x.deleted_at is null ${range(sql.raw("x.created_at"))}
      order by x.created_at ${dir}
      limit ${PAGE + 1} offset ${q.offset}`);
  } else {
    rows = await db.execute<Row>(sql`
      select x.id as key, cl.created_at as at, x.body, x.gif, x.parent_id is not null as reply,
        a.name as "authorName", a.username as "authorUsername", a.image as "authorImage", ${post}
      from nodinest.comment_likes cl
      join nodinest.post_comments x on x.id = cl.comment_id and x.deleted_at is null
      join nodinest."user" a on a.id = x.user_id
      ${postJoin}
      where cl.user_id = ${me} ${range(sql.raw("cl.created_at"))}
      order by cl.created_at ${dir}
      limit ${PAGE + 1} offset ${q.offset}`);
  }
  const [totals] = await db.execute<Record<ActivityKind, number>>(sql`
    select
      (select count(*)::int from nodinest.post_likes where user_id = ${me}) as likes,
      (select count(*)::int from nodinest.post_comments where user_id = ${me} and deleted_at is null) as comments,
      (select count(*)::int from nodinest.comment_likes cl
        join nodinest.post_comments c on c.id = cl.comment_id and c.deleted_at is null
        where cl.user_id = ${me}) as "commentLikes"`);
  const items: ActivityItem[] = rows.slice(0, PAGE).map((r) => {
    const base = `/u/${r.ownerUsername ?? ""}/item/${r.resourceId}`;
    return {
      key: r.key,
      at: new Date(r.at).toISOString(),
      title: r.title,
      cover: r.cover,
      type: r.type,
      owner: { name: r.ownerName, username: r.ownerUsername ?? "", image: r.ownerImage },
      href: q.kind === "likes" ? base : `${base}?c=${r.key}`,
      body: r.body,
      gif: r.gif ? { url: r.gif.url, w: r.gif.w, h: r.gif.h } : null,
      author:
        q.kind === "commentLikes"
          ? {
              name: r.authorName ?? "",
              username: r.authorUsername ?? "",
              image: r.authorImage ?? null,
            }
          : null,
      reply: !!r.reply,
      hidden: !!r.hidden,
    };
  });
  return {
    items,
    more: rows.length > PAGE,
    totals: {
      likes: Number(totals?.likes ?? 0),
      comments: Number(totals?.comments ?? 0),
      commentLikes: Number(totals?.commentLikes ?? 0),
    },
  };
}

/**
 * Removes my own activity: unlikes posts, deletes my comments (their replies
 * go with them) or unlikes comments. Only ever my own rows. Returns how many.
 */
export async function removeActivity(ctx: AppContext, kind: ActivityKind, ids: string[]) {
  if (ctx.userId === GUEST_ID) throw new AppError("UNAUTHENTICATED");
  const k = z.enum(ACTIVITY_KINDS).parse(kind);
  const list = z
    .array(uuid)
    .min(1)
    .max(300)
    .parse([...new Set(ids)]);
  const me = ctx.userId;
  if (k === "likes") {
    const r = await withUser(db, ctx, (tx) =>
      tx
        .delete(postLikes)
        .where(and(eq(postLikes.userId, me), inArray(postLikes.recordId, list)))
        .returning({ id: postLikes.recordId }),
    );
    return r.length;
  }
  if (k === "commentLikes") {
    const r = await withUser(db, ctx, (tx) =>
      tx
        .delete(commentLikes)
        .where(and(eq(commentLikes.userId, me), inArray(commentLikes.commentId, list)))
        .returning({ id: commentLikes.commentId }),
    );
    return r.length;
  }
  const now = new Date();
  const r = await withUser(db, ctx, (tx) =>
    tx
      .update(postComments)
      .set({ deletedAt: now })
      .where(
        and(
          eq(postComments.userId, me),
          inArray(postComments.id, list),
          isNull(postComments.deletedAt),
        ),
      )
      .returning({ id: postComments.id, parentId: postComments.parentId }),
  );
  // Replies under my removed top comments go too (authorised by the update above).
  const tops = r.filter((c) => !c.parentId).map((c) => c.id);
  if (tops.length)
    await db
      .update(postComments)
      .set({ deletedAt: now })
      .where(and(inArray(postComments.parentId, tops), isNull(postComments.deletedAt)));
  return r.length;
}
