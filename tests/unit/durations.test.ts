import { describe, expect, it } from "vitest";
import {
  elapsedActiveSeconds,
  finishTimer,
  formatClock,
  formatDuration,
  intervalsOverlap,
  pauseTimer,
  resumeTimer,
  validateManualSession,
} from "@/lib/durations";

const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, s));

describe("timer state machine", () => {
  it("counts only active time across pauses", () => {
    let s = { status: "active" as const, activeSeconds: 0, lastResumedAt: t(0) } as Parameters<
      typeof pauseTimer
    >[0];
    s = pauseTimer(s, t(600)); // 10 min
    expect(s.activeSeconds).toBe(600);
    // 30 minutes paused
    s = resumeTimer(s, t(600 + 1800));
    expect(elapsedActiveSeconds(s, t(600 + 1800 + 60))).toBe(660);
    s = finishTimer(s, t(600 + 1800 + 300));
    expect(s).toEqual({ status: "completed", activeSeconds: 900, lastResumedAt: null });
  });
  it("rejects invalid transitions", () => {
    const paused = { status: "paused" as const, activeSeconds: 5, lastResumedAt: null };
    expect(() => pauseTimer(paused, t(1))).toThrow("SESSION_NOT_ACTIVE");
    expect(() => resumeTimer({ ...paused, status: "active" as never }, t(1))).toThrow(
      "SESSION_NOT_PAUSED",
    );
    expect(() => finishTimer({ ...paused, status: "completed" as never }, t(1))).toThrow();
  });
  it("finishing a paused session adds nothing", () => {
    expect(
      finishTimer({ status: "paused", activeSeconds: 42, lastResumedAt: null }, t(9999))
        .activeSeconds,
    ).toBe(42);
  });
  it("never goes negative on clock skew and caps at 24h", () => {
    expect(
      elapsedActiveSeconds({ status: "active", activeSeconds: 10, lastResumedAt: t(100) }, t(50)),
    ).toBe(10);
    expect(
      elapsedActiveSeconds(
        { status: "active", activeSeconds: 0, lastResumedAt: t(0) },
        new Date(t(0).getTime() + 3 * 86400_000),
      ),
    ).toBe(86400);
  });
});

describe("manual sessions", () => {
  const now = t(0);
  const start = new Date(now.getTime() - 2 * 3600_000);
  const end = new Date(now.getTime() - 3600_000);
  it("defaults duration to the span and allows shorter durations", () => {
    expect(validateManualSession({ startedAt: start, endedAt: end, now })).toEqual({
      ok: true,
      seconds: 3600,
    });
    expect(
      validateManualSession({ startedAt: start, endedAt: end, durationMinutes: 45, now }),
    ).toEqual({ ok: true, seconds: 2700 });
  });
  it("rejects bad ranges", () => {
    expect(validateManualSession({ startedAt: end, endedAt: start, now })).toMatchObject({
      ok: false,
      error: "END_BEFORE_START",
    });
    expect(
      validateManualSession({ startedAt: start, endedAt: end, durationMinutes: 61, now }),
    ).toMatchObject({ error: "DURATION_EXCEEDS_SPAN" });
    expect(
      validateManualSession({ startedAt: start, endedAt: new Date(now.getTime() + 3600_000), now }),
    ).toMatchObject({ error: "IN_FUTURE" });
    expect(
      validateManualSession({
        startedAt: new Date(now.getTime() - 26 * 3600_000),
        endedAt: end,
        now,
      }),
    ).toMatchObject({ error: "TOO_LONG" });
    expect(validateManualSession({ startedAt: new Date("x"), endedAt: end, now })).toMatchObject({
      error: "INVALID_DATE",
    });
  });
  it("overlap is half-open", () => {
    expect(intervalsOverlap(t(0), t(10), t(10), t(20))).toBe(false);
    expect(intervalsOverlap(t(0), t(11), t(10), t(20))).toBe(true);
  });
});

describe("formatting", () => {
  it("formats durations in both locales", () => {
    expect(formatDuration(0, "en")).toBe("0 min");
    expect(formatDuration(3900, "uz")).toBe("1 soat 5 daq");
    expect(formatDuration(42, "en")).toBe("42 s");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(65)).toBe("01:05");
  });
});
