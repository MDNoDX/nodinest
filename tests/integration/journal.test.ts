import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  finishSession,
  getOpenSession,
  pauseSession,
  resumeSession,
  saveManualSession,
  setLearningStatus,
  startSession,
  upsertLearningRecord,
  listMyRecords,
} from "@/server/journal";
import { getStats } from "@/server/stats";
import { listGoalsWithProgress, saveGoal } from "@/server/goals";
import { submitResource } from "@/server/suggestions";
import { dayKey } from "@/lib/dates";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
let me: Awaited<ReturnType<typeof makeUser>>;
let other: Awaited<ReturnType<typeof makeUser>>;
let resourceId: string;

/** Shift a session's timestamps into the past to simulate elapsed time. */
async function rewind(id: string, seconds: number) {
  await db.execute(sql`update nodinest.study_sessions
    set started_at = started_at - make_interval(secs => ${seconds}),
        last_resumed_at = last_resumed_at - make_interval(secs => ${seconds})
    where id = ${id}`);
}

beforeAll(async () => {
  me = await makeUser(db);
  other = await makeUser(db);
  const admin = await makeUser(db, { role: "superadmin" });
  const r = await submitResource(db, admin, {
    type: "video",
    title: "Journal Video",
    media: { durationSeconds: 3600 },
  });
  resourceId = (r as { id: string }).id;
});
afterAll(async () => {
  await db.$client.end();
});

describe("study session timer", () => {
  it("start → pause → resume → finish counts only active time", async () => {
    const id = await startSession(db, me, resourceId);
    await rewind(id, 600); // 10 min running
    await pauseSession(db, me, id);
    // 30 min paused — must not count
    await db.execute(
      sql`update nodinest.study_sessions set started_at = started_at - interval '30 minutes' where id = ${id}`,
    );
    await resumeSession(db, me, id);
    await rewind(id, 300); // 5 more minutes
    const open = await getOpenSession(db, me);
    expect(open?.status).toBe("active");
    const done = await finishSession(db, me, id);
    expect(done.activeSeconds).toBeGreaterThanOrEqual(900);
    expect(done.activeSeconds).toBeLessThan(905);
    expect(await getOpenSession(db, me)).toBeNull();
  });

  it("only one open session per user; invalid transitions are rejected", async () => {
    const id = await startSession(db, me, null);
    await expect(startSession(db, me, null)).rejects.toMatchObject({ code: "SESSION_OPEN_EXISTS" });
    await expect(resumeSession(db, me, id)).rejects.toMatchObject({ code: "SESSION_STATE" });
    await pauseSession(db, me, id);
    await expect(pauseSession(db, me, id)).rejects.toMatchObject({ code: "SESSION_STATE" });
    // other users cannot touch it
    await expect(finishSession(db, other, id)).rejects.toMatchObject({ code: "SESSION_STATE" });
    const fin = await finishSession(db, me, id);
    expect(fin.activeSeconds).toBeGreaterThanOrEqual(0);
    await expect(finishSession(db, me, id)).rejects.toMatchObject({ code: "SESSION_STATE" });
  });

  it("starting a session marks the resource in progress", async () => {
    const recs = await listMyRecords(db, me);
    expect(recs.find((r) => r.resourceId === resourceId)?.status).toBe("in_progress");
  });

  it("manual sessions validate duration and reject overlaps", async () => {
    const start = new Date(Date.now() - 5 * 86400_000);
    const end = new Date(start.getTime() + 3600_000);
    await saveManualSession(db, me, {
      resourceId,
      startedAt: start,
      endedAt: end,
      durationMinutes: 45,
    });
    await expect(
      saveManualSession(db, me, {
        startedAt: new Date(start.getTime() + 600_000),
        endedAt: new Date(end.getTime() + 600_000),
      }),
    ).rejects.toMatchObject({ code: "SESSION_OVERLAP" });
    await expect(
      saveManualSession(db, me, { startedAt: end, endedAt: start }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      saveManualSession(db, me, {
        startedAt: new Date(start.getTime() - 7200_000),
        endedAt: new Date(start.getTime() - 3600_000),
        durationMinutes: 90,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    // other users' sessions never cause overlap conflicts
    await expect(
      saveManualSession(db, other, { startedAt: start, endedAt: end }),
    ).resolves.toBeTruthy();
  });

  it("stats aggregate only the user's own completed sessions", async () => {
    const tz = "Asia/Tashkent";
    const today = dayKey(new Date(), tz);
    const s = await getStats(db, me, {
      timeZone: tz,
      today,
      range: { from: "2000-01-01", to: today },
    });
    const total = s.daily.reduce((a, d) => a + d.seconds, 0);
    expect(total).toBeGreaterThanOrEqual(900 + 45 * 60);
    const so = await getStats(db, other, {
      timeZone: tz,
      today,
      range: { from: "2000-01-01", to: today },
    });
    expect(so.daily.reduce((a, d) => a + d.seconds, 0)).toBe(3600);
    expect(s.streaks.current).toBeGreaterThanOrEqual(1);
  });

  it("goals compute progress from real data", async () => {
    await saveGoal(db, me, { title: "Weekly", metric: "minutes", period: "week", target: 120 });
    const tz = "Asia/Tashkent";
    const g = await listGoalsWithProgress(db, me, dayKey(new Date(), tz), tz);
    expect(g[0].value).toBeGreaterThanOrEqual(15);
  });

  it("learning records are independent per user and validated", async () => {
    await setLearningStatus(db, other, resourceId, "completed");
    const mine = await listMyRecords(db, me);
    const theirs = await listMyRecords(db, other);
    expect(mine.find((r) => r.resourceId === resourceId)?.status).toBe("in_progress");
    expect(theirs.find((r) => r.resourceId === resourceId)?.status).toBe("completed");
    expect(theirs.find((r) => r.resourceId === resourceId)?.completedOn).toBeTruthy();
    await expect(
      upsertLearningRecord(db, me, {
        resourceId,
        status: "in_progress",
        progressCurrent: 50,
        progressTotal: 10,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
