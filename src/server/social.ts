/**
 * People and following. Everything is private by default: a profile is seen
 * by others only when its owner makes it public, and of a public profile only
 * the library items marked public are shown (title, type, status, rating,
 * progress — never notes, write-ups, files or book text). A private profile
 * hides everything at once. These reads cross users, so they use the owner
 * connection with the visibility rules written into every query.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { follows, learningRecords, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { normalizeUsername } from "@/lib/username";
import { normalizeText } from "@/lib/normalize";
import { enforceRateLimit } from "./rate-limit";

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
  const [c] = await db.execute<{ followers: number; following: number; me: boolean }>(sql`
    select
      (select count(*)::int from nodinest.follows where followee_id = ${u.id}) as followers,
      (select count(*)::int from nodinest.follows where follower_id = ${u.id}) as following,
      exists(select 1 from nodinest.follows where follower_id = ${ctx.userId} and followee_id = ${u.id}) as me`);
  const visible = self || u.profilePublic;
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
  };
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
    where lr.user_id = ${userId} and lr.visibility = 'public'
      and (u.profile_public or u.id = ${ctx.userId})
    order by lr.updated_at desc
    limit ${limit}`);
}

export async function follow(ctx: AppContext, targetId: string, on: boolean) {
  const id = z.string().uuid().parse(targetId);
  if (id === ctx.userId) throw new AppError("VALIDATION", "self");
  if (on) {
    await enforceRateLimit(db, `follow:${ctx.userId}`, 100, 86_400);
    const [u] = await db.select({ pub: user.profilePublic }).from(user).where(eq(user.id, id));
    if (!u?.pub) throw new AppError("FORBIDDEN", "private");
    await db
      .insert(follows)
      .values({ followerId: ctx.userId, followeeId: id })
      .onConflictDoNothing();
  } else
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, ctx.userId), eq(follows.followeeId, id)));
}

export type PersonCard = {
  id: string;
  name: string;
  username: string;
  image: string | null;
  premium: boolean;
  items: number;
};

/** Public profiles by name or @username. */
export async function searchPeople(ctx: AppContext, q: string) {
  const k = normalizeText(q).replace(/^@/, "").slice(0, 60);
  if (k.length < 2) return [];
  await enforceRateLimit(db, `peoplesearch:${ctx.userId}`, 120, 3600);
  const like = `%${k.replace(/[%_\\]/g, "\\$&")}%`;
  return db.execute<PersonCard>(sql`
    select u.id, u.name, u.username, u.image, coalesce(u.premium_until > now(), false) as premium,
      (select count(*)::int from nodinest.learning_records lr
        where lr.user_id = u.id and lr.visibility = 'public') as items
    from nodinest."user" u
    where u.profile_public and u.status = 'active' and u.username is not null
      and (lower(u.username) like ${like} or nodinest.nn_norm(u.name) like ${like})
    order by (lower(u.username) = ${k}) desc, items desc
    limit 20`);
}

/** People I follow (only those whose profile is public now). */
export async function followingList(ctx: AppContext) {
  return db.execute<PersonCard>(sql`
    select u.id, u.name, u.username, u.image, coalesce(u.premium_until > now(), false) as premium,
      (select count(*)::int from nodinest.learning_records lr
        where lr.user_id = u.id and lr.visibility = 'public') as items
    from nodinest.follows f
    join nodinest."user" u on u.id = f.followee_id
    where f.follower_id = ${ctx.userId} and u.profile_public and u.status = 'active'
    order by f.created_at desc
    limit 200`);
}

/** What the people I follow did lately with their public items. */
export async function followingFeed(ctx: AppContext) {
  return db.execute<PublicItem & { name: string; username: string; image: string | null }>(sql`
    select lr.resource_id as "resourceId", r.title, r.type::text as type,
      r.cover_url as "coverUrl", r.cover_file_id as "coverFileId", lr.status::text as status,
      lr.rating, lr.progress_current as "progressCurrent", lr.progress_total as "progressTotal",
      lr.updated_at as "updatedAt", u.name, u.username, u.image
    from nodinest.follows f
    join nodinest."user" u on u.id = f.followee_id and u.profile_public and u.status = 'active'
    join nodinest.learning_records lr on lr.user_id = u.id and lr.visibility = 'public'
    join nodinest.resources r on r.id = lr.resource_id and r.deleted_at is null
    where f.follower_id = ${ctx.userId} and lr.updated_at > now() - interval '60 days'
    order by lr.updated_at desc
    limit 40`);
}

export async function setProfilePublic(ctx: AppContext, on: boolean, bio: string | null) {
  const b = z.string().trim().max(300).nullable().parse(bio);
  await withUser(db, ctx, (tx) =>
    tx
      .update(user)
      .set({ profilePublic: on, bio: b || null, updatedAt: new Date() })
      .where(eq(user.id, ctx.userId)),
  );
}

export async function setItemVisibility(ctx: AppContext, resourceId: string, pub: boolean) {
  const id = z.string().uuid().parse(resourceId);
  await withUser(db, ctx, (tx) =>
    tx
      .update(learningRecords)
      .set({ visibility: pub ? "public" : "private" })
      .where(and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, id))),
  );
}
