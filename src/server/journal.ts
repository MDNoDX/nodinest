/**
 * Personal learning records and study sessions. Every query is scoped to the
 * acting user AND runs under RLS (withUser).
 *
 * Timer timestamps always come from the database clock (now()), never from
 * the client. See src/lib/durations.ts for the duration rules.
 */
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { withUser, type AppContext, type Database, type Tx } from "@/db/client";
import { learningRecords, resources, studySessions } from "@/db/schema";
import { MAX_SESSION_SECONDS, validateManualSession } from "@/lib/durations";
import { AppError } from "@/lib/errors";
import { learningRecordInput, manualSessionInput, zodFieldErrors } from "@/lib/validation";

async function assertResourceExists(tx: Tx, id: string) {
  const [r] = await tx
    .select({ id: resources.id })
    .from(resources)
    .where(and(eq(resources.id, id), isNull(resources.deletedAt)));
  if (!r) throw new AppError("NOT_FOUND");
}

// ─── Learning records ───────────────────────────────────────────────────────

export async function upsertLearningRecord(database: Database, ctx: AppContext, raw: unknown) {
  const parsed = learningRecordInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_record", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  const d = parsed.data;
  return withUser(database, ctx, async (tx) => {
    await assertResourceExists(tx, d.resourceId);
    const today = sql`(now() at time zone (select timezone from nodinest."user" where id = ${ctx.userId}))::date`;
    const values = {
      userId: ctx.userId,
      resourceId: d.resourceId,
      status: d.status,
      startedOn: d.startedOn,
      completedOn: d.completedOn,
      rating: d.rating,
      review: d.review,
      learningGoals: d.learningGoals,
      personalNotes: d.personalNotes,
      progressCurrent: d.progressCurrent,
      progressTotal: d.progressTotal,
      progressUnit: d.progressUnit,
      lastAccessedAt: new Date(),
    };
    const [row] = await tx
      .insert(learningRecords)
      .values(values)
      .onConflictDoUpdate({
        target: [learningRecords.userId, learningRecords.resourceId],
        set: { ...values, userId: undefined, resourceId: undefined },
      })
      .returning();
    // Fill in dates implied by the status when the user left them empty.
    if (d.status === "in_progress" && !row.startedOn)
      await tx
        .update(learningRecords)
        .set({ startedOn: sql`${today}` })
        .where(eq(learningRecords.id, row.id));
    if (d.status === "completed" && !row.completedOn)
      await tx
        .update(learningRecords)
        .set({
          completedOn: sql`${today}`,
          startedOn: sql`coalesce(${learningRecords.startedOn}, ${today})`,
        })
        .where(eq(learningRecords.id, row.id));
    return row.id;
  });
}

/** Quick status change (e.g. from a library card). */
export async function setLearningStatus(
  database: Database,
  ctx: AppContext,
  resourceId: string,
  status: (typeof learningRecordInput)["_output"]["status"],
) {
  return withUser(database, ctx, async (tx) => {
    await assertResourceExists(tx, resourceId);
    const today = sql`(now() at time zone (select timezone from nodinest."user" where id = ${ctx.userId}))::date`;
    await tx
      .insert(learningRecords)
      .values({ userId: ctx.userId, resourceId, status, lastAccessedAt: new Date() })
      .onConflictDoUpdate({
        target: [learningRecords.userId, learningRecords.resourceId],
        set: { status, lastAccessedAt: new Date() },
      });
    if (status === "in_progress")
      await tx
        .update(learningRecords)
        .set({ startedOn: sql`coalesce(${learningRecords.startedOn}, ${today})` })
        .where(
          and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, resourceId)),
        );
    if (status === "completed")
      await tx
        .update(learningRecords)
        .set({
          completedOn: sql`coalesce(${learningRecords.completedOn}, ${today})`,
          startedOn: sql`coalesce(${learningRecords.startedOn}, ${today})`,
        })
        .where(
          and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, resourceId)),
        );
  });
}

export async function removeLearningRecord(
  database: Database,
  ctx: AppContext,
  resourceId: string,
) {
  return withUser(database, ctx, (tx) =>
    tx
      .delete(learningRecords)
      .where(
        and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, resourceId)),
      ),
  );
}

export async function touchResource(database: Database, ctx: AppContext, resourceId: string) {
  return withUser(database, ctx, (tx) =>
    tx
      .update(learningRecords)
      .set({ lastAccessedAt: new Date() })
      .where(
        and(eq(learningRecords.userId, ctx.userId), eq(learningRecords.resourceId, resourceId)),
      ),
  );
}

// ─── Study sessions (timer) ─────────────────────────────────────────────────

export type OpenSession = {
  id: string;
  status: "active" | "paused";
  resourceId: string | null;
  resourceTitle: string | null;
  startedAt: Date;
  activeSeconds: number;
  lastResumedAt: Date | null;
  serverNow: Date;
};

export async function getOpenSession(
  database: Database,
  ctx: AppContext,
): Promise<OpenSession | null> {
  return withUser(database, ctx, async (tx) => {
    const rows = await tx.execute<{
      id: string;
      status: "active" | "paused";
      resource_id: string | null;
      title: string | null;
      started_at: Date;
      active_seconds: number;
      last_resumed_at: Date | null;
      now: Date;
    }>(sql`
      select s.id, s.status, s.resource_id, r.title, s.started_at, s.active_seconds, s.last_resumed_at, now() as now
      from nodinest.study_sessions s left join nodinest.resources r on r.id = s.resource_id
      where s.user_id = ${ctx.userId} and s.status <> 'completed' and s.deleted_at is null
      limit 1`);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      status: r.status,
      resourceId: r.resource_id,
      resourceTitle: r.title,
      startedAt: new Date(r.started_at),
      activeSeconds: r.active_seconds,
      lastResumedAt: r.last_resumed_at ? new Date(r.last_resumed_at) : null,
      serverNow: new Date(r.now),
    };
  });
}

export async function startSession(database: Database, ctx: AppContext, resourceId: string | null) {
  return withUser(database, ctx, async (tx) => {
    if (resourceId) await assertResourceExists(tx, resourceId);
    const open = await tx
      .select({ id: studySessions.id })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, ctx.userId),
          ne(studySessions.status, "completed"),
          isNull(studySessions.deletedAt),
        ),
      );
    if (open.length) throw new AppError("SESSION_OPEN_EXISTS");
    const [row] = await tx
      .insert(studySessions)
      .values({
        userId: ctx.userId,
        resourceId,
        status: "active",
        source: "timer",
        startedAt: sql`now()` as unknown as Date,
        lastResumedAt: sql`now()` as unknown as Date,
      })
      .returning({ id: studySessions.id });
    if (resourceId) {
      // Starting a session implies the resource is being studied.
      await tx
        .insert(learningRecords)
        .values({
          userId: ctx.userId,
          resourceId,
          status: "in_progress",
          lastAccessedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [learningRecords.userId, learningRecords.resourceId],
          set: {
            lastAccessedAt: new Date(),
            status: sql`case when ${learningRecords.status} in ('planned', 'paused') then 'in_progress'::nodinest.learning_status else ${learningRecords.status} end`,
          },
        });
    }
    return row.id;
  });
}

/**
 * Atomic state transitions computed in SQL with the DB clock, guarded by the
 * expected current status so double-clicks or stale tabs cannot double-count.
 */
export async function pauseSession(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx.execute(sql`
      update nodinest.study_sessions
      set status = 'paused',
          active_seconds = least(${MAX_SESSION_SECONDS}, active_seconds + greatest(0, floor(extract(epoch from (now() - last_resumed_at))))::int),
          last_resumed_at = null, updated_at = now()
      where id = ${id} and user_id = ${ctx.userId} and status = 'active' and deleted_at is null
      returning id`);
    if (res.length === 0) throw new AppError("SESSION_STATE");
  });
}

export async function resumeSession(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx.execute(sql`
      update nodinest.study_sessions set status = 'active', last_resumed_at = now(), updated_at = now()
      where id = ${id} and user_id = ${ctx.userId} and status = 'paused' and deleted_at is null
      returning id`);
    if (res.length === 0) throw new AppError("SESSION_STATE");
  });
}

export async function finishSession(
  database: Database,
  ctx: AppContext,
  id: string,
  extra: { note?: string | null; progressTo?: number | null } = {},
) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx.execute<{
      id: string;
      active_seconds: number;
      resource_id: string | null;
    }>(sql`
      update nodinest.study_sessions
      set active_seconds = least(${MAX_SESSION_SECONDS}, active_seconds + case when status = 'active'
            then greatest(0, floor(extract(epoch from (now() - last_resumed_at))))::int else 0 end),
          status = 'completed', ended_at = now(), last_resumed_at = null, updated_at = now(),
          note = coalesce(${extra.note ?? null}, note),
          progress_to = coalesce(${extra.progressTo ?? null}, progress_to)
      where id = ${id} and user_id = ${ctx.userId} and status <> 'completed' and deleted_at is null
      returning id, active_seconds, resource_id`);
    if (res.length === 0) throw new AppError("SESSION_STATE");
    const row = res[0];
    if (row.resource_id && extra.progressTo != null) {
      await tx
        .update(learningRecords)
        .set({ progressCurrent: extra.progressTo, lastAccessedAt: new Date() })
        .where(
          and(
            eq(learningRecords.userId, ctx.userId),
            eq(learningRecords.resourceId, row.resource_id),
          ),
        );
    }
    return { id: row.id, activeSeconds: row.active_seconds };
  });
}

export async function discardOpenSession(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(studySessions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(studySessions.id, id),
          eq(studySessions.userId, ctx.userId),
          ne(studySessions.status, "completed"),
        ),
      )
      .returning({ id: studySessions.id });
    if (res.length === 0) throw new AppError("NOT_FOUND");
  });
}

async function assertNoOverlap(
  tx: Tx,
  ctx: AppContext,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const rows = await tx.execute<{ id: string }>(sql`
    select id from nodinest.study_sessions
    where user_id = ${ctx.userId} and deleted_at is null
      ${excludeId ? sql`and id <> ${excludeId}` : sql``}
      and tstzrange(started_at, coalesce(ended_at, now()), '[)') && tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)')
    limit 1`);
  if (rows.length) throw new AppError("SESSION_OVERLAP");
}

/** Manually logged (or corrected) session. Overlaps with other sessions are rejected. */
export async function saveManualSession(
  database: Database,
  ctx: AppContext,
  raw: unknown,
  id?: string,
) {
  const parsed = manualSessionInput.safeParse(raw);
  if (!parsed.success)
    throw new AppError("VALIDATION", "invalid_session", {
      fieldErrors: zodFieldErrors(parsed.error),
    });
  const d = parsed.data;
  return withUser(database, ctx, async (tx) => {
    const [{ now }] = await tx.execute<{ now: Date }>(sql`select now() as now`);
    const check = validateManualSession({
      startedAt: d.startedAt,
      endedAt: d.endedAt,
      durationMinutes: d.durationMinutes,
      now: new Date(now),
    });
    if (!check.ok)
      throw new AppError("VALIDATION", check.error, { fieldErrors: { endedAt: [check.error] } });
    if (d.resourceId) await assertResourceExists(tx, d.resourceId);
    await assertNoOverlap(tx, ctx, d.startedAt, d.endedAt, id);
    const values = {
      resourceId: d.resourceId ?? null,
      startedAt: d.startedAt,
      endedAt: d.endedAt,
      activeSeconds: check.seconds,
      progressFrom: d.progressFrom,
      progressTo: d.progressTo,
      note: d.note,
    };
    if (id) {
      const res = await tx
        .update(studySessions)
        .set(values)
        .where(
          and(
            eq(studySessions.id, id),
            eq(studySessions.userId, ctx.userId),
            eq(studySessions.status, "completed"),
            isNull(studySessions.deletedAt),
          ),
        )
        .returning({ id: studySessions.id });
      if (res.length === 0) throw new AppError("NOT_FOUND");
      return id;
    }
    const [row] = await tx
      .insert(studySessions)
      .values({ ...values, userId: ctx.userId, status: "completed", source: "manual" })
      .returning({ id: studySessions.id });
    return row.id;
  });
}

export async function deleteSession(database: Database, ctx: AppContext, id: string) {
  return withUser(database, ctx, async (tx) => {
    const res = await tx
      .update(studySessions)
      .set({ deletedAt: new Date() })
      .where(and(eq(studySessions.id, id), eq(studySessions.userId, ctx.userId)))
      .returning({ id: studySessions.id });
    if (res.length === 0) throw new AppError("NOT_FOUND");
  });
}

export async function listSessions(
  database: Database,
  ctx: AppContext,
  f: { resourceId?: string | null; limit?: number; offset?: number } = {},
) {
  return withUser(database, ctx, (tx) =>
    tx
      .select({
        id: studySessions.id,
        status: studySessions.status,
        source: studySessions.source,
        startedAt: studySessions.startedAt,
        endedAt: studySessions.endedAt,
        activeSeconds: studySessions.activeSeconds,
        note: studySessions.note,
        progressFrom: studySessions.progressFrom,
        progressTo: studySessions.progressTo,
        resourceId: studySessions.resourceId,
        resourceTitle: resources.title,
        resourceType: resources.type,
      })
      .from(studySessions)
      .leftJoin(resources, eq(resources.id, studySessions.resourceId))
      .where(
        and(
          eq(studySessions.userId, ctx.userId),
          eq(studySessions.status, "completed"),
          isNull(studySessions.deletedAt),
          f.resourceId ? eq(studySessions.resourceId, f.resourceId) : undefined,
        ),
      )
      .orderBy(desc(studySessions.startedAt))
      .limit(Math.min(f.limit ?? 50, 200))
      .offset(f.offset ?? 0),
  );
}

export async function listMyRecords(database: Database, ctx: AppContext, status?: string | null) {
  return withUser(database, ctx, (tx) =>
    tx
      .select({
        id: learningRecords.id,
        resourceId: learningRecords.resourceId,
        status: learningRecords.status,
        startedOn: learningRecords.startedOn,
        completedOn: learningRecords.completedOn,
        rating: learningRecords.rating,
        progressCurrent: learningRecords.progressCurrent,
        progressTotal: learningRecords.progressTotal,
        progressUnit: learningRecords.progressUnit,
        lastAccessedAt: learningRecords.lastAccessedAt,
        title: resources.title,
        type: resources.type,
        coverUrl: resources.coverUrl,
        coverFileId: resources.coverFileId,
        totalSeconds: sql<number>`(select coalesce(sum(s.active_seconds), 0)::int from nodinest.study_sessions s
          where s.user_id = ${ctx.userId} and s.resource_id = ${learningRecords.resourceId}
            and s.status = 'completed' and s.deleted_at is null)`,
      })
      .from(learningRecords)
      .innerJoin(resources, eq(resources.id, learningRecords.resourceId))
      .where(
        and(
          eq(learningRecords.userId, ctx.userId),
          isNull(resources.deletedAt),
          status ? eq(learningRecords.status, status as never) : undefined,
        ),
      )
      .orderBy(
        sql`${learningRecords.lastAccessedAt} desc nulls last`,
        desc(learningRecords.updatedAt),
      )
      .limit(200),
  );
}
