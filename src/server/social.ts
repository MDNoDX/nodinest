/**
 * People and following. New profiles are public, of which only the library
 * items marked public are shown (title, type, status, rating, progress —
 * never notes, files or book text; a write-up or an audiobook only when the
 * owner shows it, each private by default). A private profile can still be
 * found by name, but its contents are seen only by people whose follow request
 * the owner accepted. These reads cross users, so they use the owner connection
 * with the visibility rules written into every query.
 */
import "server-only";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import {
  audiobooks,
  followRequests,
  follows,
  learningRecords,
  postComments,
  postLikes,
  user,
  writeups,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { moderationIssue } from "@/lib/moderation";
import { normalizeUsername } from "@/lib/username";
import { normalizeText, otherScript } from "@/lib/normalize";
import type { WriteupDoc } from "@/lib/writeup-doc";
import { notify } from "./notifications";
import { enforceRateLimit } from "./rate-limit";
import { ensureInLibrary } from "./records";

/** The person `u` can be seen by me: public, me, or I am an accepted follower. */
const canSee = (ctx: AppContext) =>
  sql`(u.profile_public or u.id = ${ctx.userId} or exists(
    select 1 from nodinest.follows v where v.follower_id = ${ctx.userId} and v.followee_id = u.id))`;

export type PublicItem = {
  resourceId: string;
  title: string;
  type: string;
  coverUrl: string | null;
  coverFileId: string | null;
  status: string;
  rating: number | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  updatedAt: Date;
};

export async function profileByUsername(ctx: AppContext, username: string) {
  const name = normalizeUsername(username);
  const [u] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      image: user.image,
      bio: user.bio,
      profilePublic: user.profilePublic,
      premiumUntil: user.premiumUntil,
      status: user.status,
    })
    .from(user)
    .where(sql`lower(${user.username}) = ${name}`);
  if (!u || u.status !== "active") return null;
  const self = u.id === ctx.userId;
  const [c] = await db.execute<{
    followers: number;
    following: number;
    me: boolean;
    asked: boolean;
  }>(sql`
    select
      (select count(*)::int from nodinest.follows where followee_id = ${u.id}) as followers,
      (select count(*)::int from nodinest.follows where follower_id = ${u.id}) as following,
      exists(select 1 from nodinest.follows where follower_id = ${ctx.userId} and followee_id = ${u.id}) as me,
      exists(select 1 from nodinest.follow_requests where requester_id = ${ctx.userId} and target_id = ${u.id}) as asked`);
  const visible = self || u.profilePublic || c.me;
  return {
    id: u.id,
    name: u.name,
    username: u.username!,
    image: u.image,
    bio: visible ? u.bio : null,
    premium: !!u.premiumUntil && u.premiumUntil > new Date(),
    profilePublic: u.profilePublic,
    self,
    visible,
    followers: c.followers,
    following: c.following,
    isFollowing: c.me,
    requested: c.asked,
  };
}

/** What a person has done, counted from what they show publicly. */
export async function profileStats(ctx: AppContext, userId: string) {
  const [s] = await db.execute<{
    books: number;
    videos: number;
    courses: number;
    audio: number;
    pages: number;
    seconds: number;
  }>(sql`
    select
      count(*) filter (where lr.status = 'completed' and r.type = 'book')::int as books,
      count(*) filter (where lr.status = 'completed'
        and r.type::text in ('video', 'lecture', 'interview'))::int as videos,
      count(*) filter (where lr.status = 'completed' and r.type = 'course')::int as courses,
      count(*) filter (where lr.status = 'completed' and r.type = 'podcast')::int as audio,
      coalesce(sum(lr.progress_current) filter (where lr.progress_unit = 'pages'), 0)::int as pages,
      coalesce(sum(m.duration_seconds) filter (where lr.status = 'completed'), 0)::int as seconds
    from nodinest.learning_records lr
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    join nodinest."user" u on u.id = lr.user_id
    left join nodinest.media_details m on m.resource_id = r.id
    where lr.user_id = ${userId} and lr.visibility = 'public' and ${canSee(ctx)}`);
  // A page takes about a minute and a half to read.
  return { ...s, hours: Math.round((s.seconds + s.pages * 90) / 3600) };
}

/** People who show the most finished work; a private profile never appears. */
export async function ranking(limit = 10) {
  return db.execute<{
    id: string;
    name: string;
    username: string;
    image: string | null;
    done: number;
  }>(sql`
    select u.id, u.name, u.username, u.image, count(*)::int as done
    from nodinest.learning_records lr
    join nodinest."user" u on u.id = lr.user_id
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    where lr.visibility = 'public' and lr.status = 'completed' and u.profile_public
      and u.status = 'active' and u.username is not null
    group by u.id
    order by done desc, u.name
    limit ${limit}`);
}

/** One thing a person shows publicly: its card, never their notes, files or text. */
export async function publicItem(ctx: AppContext, username: string, resourceId: string) {
  const rid = z.string().uuid().safeParse(resourceId);
  if (!rid.success) return null;
  const [it] = await db.execute<
    PublicItem & {
      ownerId: string;
      name: string;
      username: string;
      image: string | null;
      description: string | null;
      sourceUrl: string | null;
      authors: string | null;
      mine: boolean;
      recordId: string;
      textPublic: boolean;
      likes: number;
      liked: boolean;
      comments: number;
    }
  >(sql`
    select lr.resource_id as "resourceId", r.title, r.type::text as type,
      r.cover_url as "coverUrl", r.cover_file_id as "coverFileId", lr.status::text as status,
      lr.rating, lr.progress_current as "progressCurrent", lr.progress_total as "progressTotal",
      lr.updated_at as "updatedAt", u.id as "ownerId", u.name, u.username, u.image,
      r.description, r.source_url as "sourceUrl", lr.id as "recordId",
      (select count(*)::int from nodinest.post_likes l where l.record_id = lr.id) as likes,
      exists(select 1 from nodinest.post_likes l
        where l.record_id = lr.id and l.user_id = ${ctx.userId}) as liked,
      (select count(*)::int from nodinest.post_comments c
        where c.record_id = lr.id and c.deleted_at is null) as comments,
      (lr.text_public and exists(select 1 from nodinest.book_text_sources s
        where s.user_id = lr.user_id and s.resource_id = lr.resource_id
          and s.status = 'ready')) as "textPublic",
      (select string_agg(p.full_name, ', ') from nodinest.resource_contributors c
        join nodinest.people p on p.id = c.person_id where c.resource_id = r.id) as authors,
      exists(select 1 from nodinest.learning_records m
        where m.user_id = ${ctx.userId} and m.resource_id = r.id) as mine
    from nodinest.learning_records lr
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    join nodinest."user" u on u.id = lr.user_id and u.status = 'active'
    where lower(u.username) = ${normalizeUsername(username)} and lr.resource_id = ${rid.data}
      and lr.visibility = 'public' and ${canSee(ctx)}`);
  return it ?? null;
}

/** What the owner chose to show besides the card: the write-up and the audiobook. */
export async function publicExtras(ownerId: string, resourceId: string) {
  const [x] = await db.execute<{
    doc: WriteupDoc | null;
    parts: number | null;
    cast: boolean | null;
  }>(sql`
    select
      (select w.doc from nodinest.writeups w
        where w.user_id = ${ownerId} and w.resource_id = ${resourceId} and w.is_public) as doc,
      (select jsonb_array_length(a.plan->'segs') from nodinest.audiobooks a
        where a.user_id = ${ownerId} and a.resource_id = ${resourceId}
          and a.is_public and a.status = 'ready') as parts,
      (select (a.analysis->>'cast')::boolean from nodinest.audiobooks a
        where a.user_id = ${ownerId} and a.resource_id = ${resourceId}) as cast`);
  return x;
}

/** Shows or hides a write-up or an audiobook; showing one shows its card too. */
export async function setShared(
  ctx: AppContext,
  resourceId: string,
  what: "writeup" | "audiobook",
  on: boolean,
) {
  const rid = z.string().uuid().parse(resourceId);
  await withUser(db, ctx, async (tx) => {
    const t = what === "writeup" ? writeups : audiobooks;
    const done = await tx
      .update(t)
      .set({ isPublic: on })
      .where(and(eq(t.userId, ctx.userId), eq(t.resourceId, rid)))
      .returning({ id: t.id });
    if (!done.length) throw new AppError("NOT_FOUND");
    if (on)
      await tx
        .update(learningRecords)
        .set({ visibility: "public" })
        .where(and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, rid)));
  });
}

/** Someone whose public card of this entry I may open (for old links to /library/id). */
export async function publicOwnerOf(ctx: AppContext, resourceId: string) {
  const [o] = await db.execute<{ username: string }>(sql`
    select u.username from nodinest.learning_records lr
    join nodinest."user" u on u.id = lr.user_id and u.status = 'active'
    where lr.resource_id = ${resourceId} and lr.visibility = 'public'
      and u.username is not null and ${canSee(ctx)}
    limit 1`);
  return o?.username ?? null;
}

/** A person's public library (only when their profile is public, or it is you). */
export async function publicItems(ctx: AppContext, userId: string, limit = 120) {
  return db.execute<PublicItem>(sql`
    select lr.resource_id as "resourceId", r.title, r.type::text as type,
      r.cover_url as "coverUrl", r.cover_file_id as "coverFileId", lr.status::text as status,
      lr.rating, lr.progress_current as "progressCurrent", lr.progress_total as "progressTotal",
      lr.updated_at as "updatedAt"
    from nodinest.learning_records lr
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    join nodinest."user" u on u.id = lr.user_id
    where lr.user_id = ${userId} and lr.visibility = 'public' and ${canSee(ctx)}
    order by lr.updated_at desc
    limit ${limit}`);
}

/** Follow / unfollow; a private profile gets a request instead. */
export async function follow(ctx: AppContext, targetId: string, on: boolean) {
  const id = z.string().uuid().parse(targetId);
  if (id === ctx.userId) throw new AppError("VALIDATION", "self");
  if (!on) {
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, ctx.userId), eq(follows.followeeId, id)));
    await db
      .delete(followRequests)
      .where(and(eq(followRequests.requesterId, ctx.userId), eq(followRequests.targetId, id)));
    return "none" as const;
  }
  await enforceRateLimit(db, `follow:${ctx.userId}`, 100, 86_400);
  const [u] = await db
    .select({ pub: user.profilePublic, status: user.status })
    .from(user)
    .where(eq(user.id, id));
  if (!u || u.status !== "active") throw new AppError("NOT_FOUND");
  if (!u.pub) {
    await db
      .insert(followRequests)
      .values({ requesterId: ctx.userId, targetId: id })
      .onConflictDoNothing();
    await notify(id, "follow_request", { actorId: ctx.userId, href: "/notifications" });
    return "requested" as const;
  }
  await db.insert(follows).values({ followerId: ctx.userId, followeeId: id }).onConflictDoNothing();
  await notify(id, "follow", { actorId: ctx.userId });
  return "following" as const;
}

export type FollowRequest = {
  id: string;
  name: string;
  username: string;
  image: string | null;
};

/** People waiting for my answer. */
export async function followRequestsForMe(ctx: AppContext) {
  return db.execute<FollowRequest>(sql`
    select u.id, u.name, u.username, u.image
    from nodinest.follow_requests r
    join nodinest."user" u on u.id = r.requester_id and u.status = 'active'
    where r.target_id = ${ctx.userId} and u.username is not null
    order by r.created_at desc
    limit 200`);
}

/** Whom I asked to follow, still waiting for their answer. */
export async function myFollowRequests(ctx: AppContext) {
  return db.execute<FollowRequest>(sql`
    select u.id, u.name, u.username, u.image
    from nodinest.follow_requests r
    join nodinest."user" u on u.id = r.target_id and u.status = 'active'
    where r.requester_id = ${ctx.userId} and u.username is not null
    order by r.created_at desc
    limit 100`);
}

export async function answerFollowRequest(ctx: AppContext, requesterId: string, accept: boolean) {
  const id = z.string().uuid().parse(requesterId);
  const gone = await db
    .delete(followRequests)
    .where(and(eq(followRequests.requesterId, id), eq(followRequests.targetId, ctx.userId)))
    .returning({ id: followRequests.requesterId });
  if (!gone.length || !accept) return;
  await db.insert(follows).values({ followerId: id, followeeId: ctx.userId }).onConflictDoNothing();
  await notify(id, "follow_accepted", { actorId: ctx.userId });
  // The owner sees the new follower too, and can follow back.
  await notify(ctx.userId, "follow", { actorId: id });
}

export type PersonCard = {
  id: string;
  name: string;
  username: string;
  image: string | null;
  premium: boolean;
  items: number;
  /** A private profile I cannot see into. */
  locked?: boolean;
};

/**
 * Profiles by name or @username, from the first letter (prefix match for 1–2
 * letters, anywhere in the name after that), with "do I follow". Private ones
 * are found too, but only their name and picture; no item count.
 */
export async function searchPeople(ctx: AppContext, q: string) {
  const k = normalizeText(q).replace(/^@/, "").slice(0, 60);
  if (!k) return [];
  // Guests are limited by address in the route; a shared "nobody" bucket would block them all.
  if (ctx.userId !== "00000000-0000-0000-0000-000000000000")
    await enforceRateLimit(db, `peoplesearch:${ctx.userId}`, 900, 3600);
  const esc = k.replace(/[%_\\]/g, "\\$&");
  const like = k.length < 3 ? `${esc}%` : `%${esc}%`;
  const word = `% ${esc}%`;
  // The same name in the other Uzbek alphabet: "Muhammad" finds "Муҳаммад".
  const other = normalizeText(otherScript(k)).replace(/[%_\\]/g, "\\$&");
  const otherLike = k.length < 3 ? `${other}%` : `%${other}%`;
  const otherWord = `% ${other}%`;
  return db.execute<PersonCard & { isFollowing: boolean; requested: boolean }>(sql`
    select u.id, u.name, u.username, u.image, coalesce(u.premium_until > now(), false) as premium,
      case when ${canSee(ctx)} then (select count(*)::int from nodinest.learning_records lr
        where lr.user_id = u.id and lr.visibility = 'public') else 0 end as items,
      not ${canSee(ctx)} as locked,
      exists(select 1 from nodinest.follows f where f.follower_id = ${ctx.userId} and f.followee_id = u.id) as "isFollowing",
      exists(select 1 from nodinest.follow_requests q where q.requester_id = ${ctx.userId} and q.target_id = u.id) as requested
    from nodinest."user" u
    where u.status = 'active' and u.username is not null and u.id <> ${ctx.userId}
      and (lower(u.username) like ${like} or nodinest.nn_norm(u.name) like ${like}
           or nodinest.nn_norm(u.name) like ${word}
           or nodinest.nn_norm(u.name) like ${otherLike}
           or nodinest.nn_norm(u.name) like ${otherWord})
    order by (lower(u.username) = ${k}) desc, (lower(u.username) like ${`${esc}%`}) desc, items desc
    limit 12`);
}

/** People I follow. */
export async function followingList(ctx: AppContext) {
  return db.execute<PersonCard>(sql`
    select u.id, u.name, u.username, u.image, coalesce(u.premium_until > now(), false) as premium,
      (select count(*)::int from nodinest.learning_records lr
        where lr.user_id = u.id and lr.visibility = 'public') as items
    from nodinest.follows f
    join nodinest."user" u on u.id = f.followee_id
    where f.follower_id = ${ctx.userId} and u.status = 'active'
    order by f.created_at desc
    limit 200`);
}

/**
 * Who follows a person / whom they follow (Instagram-style lists). Shown when
 * the profile can be seen; private accounts in the list appear only to the
 * list's owner — others see public profiles only.
 */
export async function followList(
  ctx: AppContext,
  userId: string,
  which: "followers" | "following",
) {
  const id = z.string().uuid().parse(userId);
  const [owner] = await db.execute<{ ok: boolean }>(
    sql`select ${canSee(ctx)} as ok from nodinest."user" u where u.id = ${id}`,
  );
  if (!owner?.ok) return [];
  const join = which === "followers" ? sql`u.id = f.follower_id` : sql`u.id = f.followee_id`;
  const where = which === "followers" ? sql`f.followee_id = ${id}` : sql`f.follower_id = ${id}`;
  return db.execute<PersonCard & { isFollowing: boolean; visible: boolean }>(sql`
    select u.id, u.name, u.username, u.image, coalesce(u.premium_until > now(), false) as premium,
      (select count(*)::int from nodinest.learning_records lr
        where lr.user_id = u.id and lr.visibility = 'public') as items,
      exists(select 1 from nodinest.follows m where m.follower_id = ${ctx.userId} and m.followee_id = u.id) as "isFollowing",
      u.profile_public as visible
    from nodinest.follows f
    join nodinest."user" u on ${join}
    where ${where} and u.status = 'active' and u.username is not null
      and (u.profile_public or ${id} = ${ctx.userId})
    order by f.created_at desc
    limit 500`);
}

/** Removes someone from my followers (they keep no access to a private profile). */
export async function removeFollower(ctx: AppContext, followerId: string) {
  const id = z.string().uuid().parse(followerId);
  await db
    .delete(follows)
    .where(and(eq(follows.followerId, id), eq(follows.followeeId, ctx.userId)));
}

/** What the people I follow did lately with their public items. */
export async function followingFeed(ctx: AppContext) {
  return db.execute<PublicItem & { name: string; username: string; image: string | null }>(sql`
    select lr.resource_id as "resourceId", r.title, r.type::text as type,
      r.cover_url as "coverUrl", r.cover_file_id as "coverFileId", lr.status::text as status,
      lr.rating, lr.progress_current as "progressCurrent", lr.progress_total as "progressTotal",
      lr.updated_at as "updatedAt", u.name, u.username, u.image
    from nodinest.follows f
    join nodinest."user" u on u.id = f.followee_id and u.status = 'active'
    join nodinest.learning_records lr on lr.user_id = u.id and lr.visibility = 'public'
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    where f.follower_id = ${ctx.userId} and lr.updated_at > now() - interval '60 days'
    order by lr.updated_at desc
    limit 40`);
}

export async function setProfilePublic(ctx: AppContext, on: boolean, bio: string | null) {
  const b = z.string().trim().max(300).nullable().parse(bio);
  if (moderationIssue(b)) throw new AppError("INDECENT");
  await withUser(db, ctx, (tx) =>
    tx
      .update(user)
      .set({ profilePublic: on, bio: b || null, updatedAt: new Date() })
      .where(eq(user.id, ctx.userId)),
  );
  // Opening the profile answers everyone who was waiting.
  if (on) {
    const waiting = await db
      .delete(followRequests)
      .where(eq(followRequests.targetId, ctx.userId))
      .returning({ id: followRequests.requesterId });
    if (waiting.length)
      await db
        .insert(follows)
        .values(waiting.map((w) => ({ followerId: w.id, followeeId: ctx.userId })))
        .onConflictDoNothing();
  }
}

export async function myItemsCount(ctx: AppContext) {
  const [r] = await withUser(db, ctx, (tx) =>
    tx.select({ n: count() }).from(learningRecords).where(eq(learningRecords.userId, ctx.userId)),
  );
  return r?.n ?? 0;
}

/** My whole library with who may see each item (for the profile's switches). */
export async function myItemsVisibility(ctx: AppContext) {
  return withUser(db, ctx, (tx) =>
    tx.execute<{ resourceId: string; title: string; type: string; public: boolean }>(sql`
      select lr.resource_id as "resourceId", r.title, r.type::text as type,
        (lr.visibility = 'public') as public
      from nodinest.learning_records lr
      join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
      where lr.user_id = ${ctx.userId}
      order by lr.updated_at desc
      limit 500`),
  );
}

/**
 * Opens or closes an item. Opening may also show its write-up and audiobook
 * (each asked for on its own; left out = left as it is).
 */
export async function setItemVisibility(
  ctx: AppContext,
  resourceId: string,
  pub: boolean,
  extras: { writeup?: boolean; audiobook?: boolean; text?: boolean } = {},
) {
  const id = z.string().uuid().parse(resourceId);
  let opened = false;
  await withUser(db, ctx, async (tx) => {
    const [was] = await tx
      .select({ v: learningRecords.visibility })
      .from(learningRecords)
      .where(and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, id)));
    opened = pub && !!was && was.v !== "public";
    await tx
      .update(learningRecords)
      .set({
        visibility: pub ? "public" : "private",
        ...(pub && typeof extras.text === "boolean" ? { textPublic: extras.text } : {}),
      })
      .where(and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, id)));
    if (!pub) return;
    for (const [t, on] of [
      [writeups, extras.writeup],
      [audiobooks, extras.audiobook],
    ] as const)
      if (typeof on === "boolean")
        await tx
          .update(t)
          .set({ isPublic: on })
          .where(and(eq(t.userId, ctx.userId), eq(t.resourceId, id)));
  });
  if (opened) {
    const run = () => tellFollowers(ctx, id).catch(() => null);
    try {
      after(run);
    } catch {
      void run(); // outside a request (tests, scripts)
    }
  }
}

/** A new public post: the people who follow me hear of it (after the answer, never blocking it). */
async function tellFollowers(ctx: AppContext, resourceId: string) {
  const [it] = await db.execute<{ title: string; username: string | null }>(sql`
    select r.title, u.username from nodinest.resources r, nodinest."user" u
    where r.id = ${resourceId} and u.id = ${ctx.userId}`);
  if (!it?.username) return;
  const fans = await db
    .select({ id: follows.followerId })
    .from(follows)
    .where(eq(follows.followeeId, ctx.userId))
    .limit(500);
  for (let i = 0; i < fans.length; i += 20)
    await Promise.all(
      fans.slice(i, i + 20).map((f) =>
        notify(f.id, "post", {
          actorId: ctx.userId,
          body: it.title,
          href: `/u/${it.username}/item/${resourceId}`,
        }).catch(() => null),
      ),
    );
}

/** What else an item can show and whether it does now (null: there is none yet). */
export async function shareState(ctx: AppContext, resourceId: string) {
  const id = z.string().uuid().parse(resourceId);
  const [x] = await withUser(db, ctx, (tx) =>
    tx.execute<{ writeup: boolean | null; audiobook: boolean | null; text: boolean | null }>(sql`
      select
        (select w.is_public from nodinest.writeups w
          where w.user_id = ${ctx.userId} and w.resource_id = ${id} and w.words > 0) as writeup,
        (select a.is_public from nodinest.audiobooks a
          where a.user_id = ${ctx.userId} and a.resource_id = ${id} and a.status = 'ready')
          as audiobook,
        (select lr.text_public from nodinest.learning_records lr
          where lr.user_id = ${ctx.userId} and lr.resource_id = ${id}
            and exists(select 1 from nodinest.book_text_sources s where s.user_id = lr.user_id
              and s.resource_id = lr.resource_id and s.status = 'ready')) as text`),
  );
  return {
    writeup: x?.writeup ?? null,
    audiobook: x?.audiobook ?? null,
    text: x?.text ?? null,
  };
}

export type MediaItem = PublicItem & {
  recordId: string;
  likes: number;
  liked: boolean;
  comments: number;
  ownerId: string;
  name: string;
  username: string;
  image: string | null;
  sourceUrl: string | null;
  description: string | null;
  mine: boolean;
};

/**
 * "Media", newest first: everything shown publicly (mine too, so a new post is
 * seen at once), or only the people I follow.
 */
export async function mediaFeed(
  ctx: AppContext,
  opts: { scope?: string; kind?: string; before?: string } = {},
) {
  const followed = opts.scope === "following";
  const kind = opts.kind && opts.kind !== "all" ? opts.kind : null;
  // A text timestamp (with milliseconds): a Date object cannot go into raw SQL.
  const b = opts.before ? new Date(opts.before) : null;
  const before = b && !Number.isNaN(b.getTime()) ? b.toISOString() : null;
  return db.execute<MediaItem>(sql`
    select lr.resource_id as "resourceId", r.title, r.type::text as type,
      r.cover_url as "coverUrl", r.cover_file_id as "coverFileId", lr.status::text as status,
      lr.rating, lr.progress_current as "progressCurrent", lr.progress_total as "progressTotal",
      lr.updated_at as "updatedAt", u.id as "ownerId", u.name, u.username, u.image,
      r.source_url as "sourceUrl", r.description, lr.id as "recordId",
      (select count(*)::int from nodinest.post_likes l where l.record_id = lr.id) as likes,
      exists(select 1 from nodinest.post_likes l
        where l.record_id = lr.id and l.user_id = ${ctx.userId}) as liked,
      (select count(*)::int from nodinest.post_comments c
        where c.record_id = lr.id and c.deleted_at is null) as comments,
      exists(select 1 from nodinest.learning_records m
        where m.user_id = ${ctx.userId} and m.resource_id = r.id) as mine
    from nodinest.learning_records lr
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    join nodinest."user" u on u.id = lr.user_id and u.status = 'active' and u.username is not null
    where lr.visibility = 'public' and ${canSee(ctx)}
      ${kind ? sql`and r.type::text = ${kind}` : sql``}
      ${
        followed
          ? sql`and exists(select 1 from nodinest.follows f
              where f.follower_id = ${ctx.userId} and f.followee_id = u.id)`
          : sql``
      }
      ${before ? sql`and lr.updated_at < ${before}::timestamptz` : sql``}
    order by lr.updated_at desc
    limit 30`);
}

/** The search's type buttons: each covers the resource types it stands for. */
export const MEDIA_KINDS = {
  book: ["book"],
  video: ["video", "lecture"],
  podcast: ["podcast", "interview"],
  course: ["course"],
  document: ["article", "file", "other"],
} as const;
export type MediaKind = keyof typeof MEDIA_KINDS;

export type MediaHit = {
  resourceId: string;
  title: string;
  type: string;
  coverUrl: string | null;
  coverFileId: string | null;
  name: string;
  username: string;
};

/**
 * What people posted (public items of others), by title, author line or the
 * poster's name, in either Uzbek alphabet. A private profile's posts are found
 * only by its accepted followers. With no words but a kind: the newest of it.
 */
export async function searchMedia(
  ctx: AppContext,
  q: string,
  kind?: MediaKind | MediaKind[] | null,
) {
  const k = normalizeText(q).replace(/^@/, "").slice(0, 80);
  const kinds = !kind ? [] : Array.isArray(kind) ? kind : [kind];
  if (!k && !kinds.length) return [];
  const types = kinds.length ? kinds.flatMap((x) => [...MEDIA_KINDS[x]]) : null;
  const esc = (s: string) => `%${s.replace(/[%_\\]/g, "\\$&")}%`;
  const like = esc(k);
  const other = esc(normalizeText(otherScript(k)));
  const match = k
    ? sql`and (nodinest.nn_norm(r.title) like ${like} or nodinest.nn_norm(r.title) like ${other}
        or nodinest.nn_norm(coalesce(r.original_title, '')) like ${like}
        or nodinest.nn_norm(u.name) like ${like} or nodinest.nn_norm(u.name) like ${other}
        or lower(u.username) like ${like})`
    : sql``;
  return db.execute<MediaHit>(sql`
    select lr.resource_id as "resourceId", r.title, r.type::text as type,
      r.cover_url as "coverUrl", r.cover_file_id as "coverFileId", u.name, u.username
    from nodinest.learning_records lr
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    join nodinest."user" u on u.id = lr.user_id and u.status = 'active' and u.username is not null
    where lr.visibility = 'public' and u.id <> ${ctx.userId} and ${canSee(ctx)}
      ${
        types
          ? sql`and r.type::text in (${sql.join(
              types.map((x) => sql`${x}`),
              sql`, `,
            )})`
          : sql``
      }
      ${match}
    order by ${k ? sql`(nodinest.nn_norm(r.title) like ${`${k.replace(/[%_\\]/g, "\\$&")}%`}) desc,` : sql``}
      lr.updated_at desc
    limit ${kinds.length ? 24 : 8}`);
}

/** Takes a public source to my library: only its card, never files or text. */
export async function takeSource(ctx: AppContext, resourceId: string, ownerId: string) {
  const rid = z.string().uuid().parse(resourceId);
  const oid = z.string().uuid().parse(ownerId);
  const [ok] = await db.execute<{ title: string }>(sql`
    select r.title from nodinest.learning_records lr
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    join nodinest."user" u on u.id = lr.user_id and u.status = 'active'
    where lr.user_id = ${oid} and lr.resource_id = ${rid} and lr.visibility = 'public' and ${canSee(ctx)}`);
  if (!ok) throw new AppError("NOT_FOUND");
  await withUser(db, ctx, (tx) => ensureInLibrary(tx, ctx.userId, rid));
  if (oid !== ctx.userId)
    await notify(oid, "copied", {
      actorId: ctx.userId,
      body: ok.title,
      href: `/library/${rid}`,
    });
}

/**
 * Reading someone's book text they made public: a context that reads as the
 * owner, for read-only book queries only (pages, search, structure). Throws
 * NOT_FOUND when the text is not shared with the caller.
 */
export async function sharedTextOwner(ctx: AppContext, ownerId: string, resourceId: string) {
  const oid = z.string().uuid().parse(ownerId);
  const rid = z.string().uuid().parse(resourceId);
  if (oid === ctx.userId) return ctx;
  const [ok] = await db.execute<{ ok: number }>(sql`
    select 1 as ok from nodinest.learning_records lr
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    join nodinest."user" u on u.id = lr.user_id and u.status = 'active'
    where lr.user_id = ${oid} and lr.resource_id = ${rid}
      and lr.visibility = 'public' and lr.text_public and ${canSee(ctx)}`);
  if (!ok) throw new AppError("NOT_FOUND");
  const owner: AppContext = { userId: oid, role: "user", superadminAccount: false };
  return owner;
}

// ─── Likes and comments on public posts ─────────────────────────────────────

/** A public post I may see: its owner and title, or NOT_FOUND. */
async function visiblePost(ctx: AppContext, recordId: string) {
  const id = z.string().uuid().parse(recordId);
  const [p] = await db.execute<{
    ownerId: string;
    resourceId: string;
    title: string;
    username: string;
  }>(sql`
    select lr.user_id as "ownerId", lr.resource_id as "resourceId", r.title, u.username
    from nodinest.learning_records lr
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    join nodinest."user" u on u.id = lr.user_id and u.status = 'active'
    where lr.id = ${id} and lr.visibility = 'public' and ${canSee(ctx)}`);
  if (!p) throw new AppError("NOT_FOUND");
  return { ...p, id };
}

export async function setLike(ctx: AppContext, recordId: string, on: boolean) {
  const p = await visiblePost(ctx, recordId);
  await withUser(db, ctx, (tx) =>
    on
      ? tx.insert(postLikes).values({ recordId: p.id, userId: ctx.userId }).onConflictDoNothing()
      : tx
          .delete(postLikes)
          .where(and(eq(postLikes.recordId, p.id), eq(postLikes.userId, ctx.userId))),
  );
  if (on && p.ownerId !== ctx.userId)
    await notify(p.ownerId, "like", {
      actorId: ctx.userId,
      body: p.title,
      href: `/u/${p.username}/item/${p.resourceId}`,
    }).catch(() => null);
  const [n] = await db.select({ n: count() }).from(postLikes).where(eq(postLikes.recordId, p.id));
  return n?.n ?? 0;
}

export type PostComment = {
  id: string;
  body: string | null;
  gif: { id: string; url: string; w: number; h: number } | null;
  createdAt: string;
  mine: boolean;
  /** I may remove it (mine, or on my post). */
  canDelete: boolean;
  author: { id: string; name: string; username: string; image: string | null };
};

export async function postComments_(ctx: AppContext, recordId: string): Promise<PostComment[]> {
  const p = await visiblePost(ctx, recordId);
  const rows = await db.execute<{
    id: string;
    body: string | null;
    gif: PostComment["gif"];
    createdAt: Date;
    userId: string;
    name: string;
    username: string | null;
    image: string | null;
  }>(sql`
    select c.id, c.body, c.gif, c.created_at as "createdAt", c.user_id as "userId",
      u.name, u.username, u.image
    from nodinest.post_comments c
    join nodinest."user" u on u.id = c.user_id and u.status = 'active'
    where c.record_id = ${p.id} and c.deleted_at is null
    order by c.created_at
    limit 300`);
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    gif: r.gif,
    createdAt: new Date(r.createdAt).toISOString(),
    mine: r.userId === ctx.userId,
    canDelete: r.userId === ctx.userId || p.ownerId === ctx.userId,
    author: { id: r.userId, name: r.name, username: r.username ?? "", image: r.image },
  }));
}
export { postComments_ as listPostComments };

/** Only the GIF services' own media hosts (KLIPY, GIPHY): nothing else is shown. */
const GIPHY = /^https:\/\/(static\.klipy\.com|media\d?\.giphy\.com)\/[\w./-]+$/;
const commentInput = z
  .object({
    body: z.string().trim().max(1000).optional(),
    gif: z
      .object({
        id: z
          .string()
          .max(40)
          .regex(/^[\w-]+$/),
        url: z.string().max(400).regex(GIPHY),
        w: z.number().int().min(1).max(2000),
        h: z.number().int().min(1).max(2000),
      })
      .optional(),
  })
  .refine((v) => !!(v.body || v.gif), { message: "empty" });

export async function addComment(ctx: AppContext, recordId: string, raw: unknown) {
  const v = commentInput.parse(raw);
  if (moderationIssue(v.body ?? null)) throw new AppError("INDECENT");
  const p = await visiblePost(ctx, recordId);
  await enforceRateLimit(db, `comment:${ctx.userId}`, 30, 600);
  const [row] = await withUser(db, ctx, (tx) =>
    tx
      .insert(postComments)
      .values({
        recordId: p.id,
        userId: ctx.userId,
        body: v.body || null,
        gif: v.gif ? { id: v.gif.id, url: v.gif.url, w: v.gif.w, h: v.gif.h } : null,
      })
      .returning({ id: postComments.id }),
  );
  if (p.ownerId !== ctx.userId)
    await notify(p.ownerId, "comment", {
      actorId: ctx.userId,
      body: v.body ? v.body.slice(0, 120) : p.title,
      href: `/u/${p.username}/item/${p.resourceId}`,
    }).catch(() => null);
  return row.id;
}

export async function deleteComment(ctx: AppContext, commentId: string) {
  const id = z.string().uuid().parse(commentId);
  const done = await withUser(db, ctx, (tx) =>
    tx
      .update(postComments)
      .set({ deletedAt: new Date() })
      .where(and(eq(postComments.id, id), isNull(postComments.deletedAt)))
      .returning({ id: postComments.id }),
  );
  if (!done.length) throw new AppError("NOT_FOUND");
}
