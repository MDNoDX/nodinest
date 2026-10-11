/**
 * Study-session duration rules (pure, unit-tested):
 *
 *  - A timer session accumulates `activeSeconds` only while running.
 *  - Pausing adds (pausedAt - lastResumedAt) and clears lastResumedAt.
 *  - Resuming sets lastResumedAt = now. Paused time is never counted.
 *  - Finishing adds the running segment (if any) and stamps endedAt.
 *  - Manual sessions store the user-entered duration, which may be shorter
 *    than (endedAt - startedAt) but never longer.
 *  - All timestamps come from the server clock (DB now()), never the client.
 */
export const MAX_SESSION_SECONDS = 24 * 60 * 60;

export type TimerState = {
  status: "active" | "paused" | "completed";
  activeSeconds: number;
  lastResumedAt: Date | null;
};

function secondsBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000));
}

/** Live elapsed active time for display. */
export function elapsedActiveSeconds(state: TimerState, now: Date): number {
  const running =
    state.status === "active" && state.lastResumedAt ? secondsBetween(state.lastResumedAt, now) : 0;
  return Math.min(MAX_SESSION_SECONDS, state.activeSeconds + running);
}

export function pauseTimer(state: TimerState, now: Date): TimerState {
  if (state.status !== "active") throw new Error("SESSION_NOT_ACTIVE");
  return { status: "paused", activeSeconds: elapsedActiveSeconds(state, now), lastResumedAt: null };
}

export function resumeTimer(state: TimerState, now: Date): TimerState {
  if (state.status !== "paused") throw new Error("SESSION_NOT_PAUSED");
  return { status: "active", activeSeconds: state.activeSeconds, lastResumedAt: now };
}

export function finishTimer(state: TimerState, now: Date): TimerState {
  if (state.status === "completed") throw new Error("SESSION_ALREADY_COMPLETED");
  return {
    status: "completed",
    activeSeconds: elapsedActiveSeconds(state, now),
    lastResumedAt: null,
  };
}

/** Validates a manually entered session; returns the duration in seconds. */
export function validateManualSession(input: {
  startedAt: Date;
  endedAt: Date;
  durationMinutes?: number | null;
  now: Date;
}): { ok: true; seconds: number } | { ok: false; error: string } {
  const { startedAt, endedAt, now } = input;
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()))
    return { ok: false, error: "INVALID_DATE" };
  if (endedAt <= startedAt) return { ok: false, error: "END_BEFORE_START" };
  if (endedAt.getTime() > now.getTime() + 60_000) return { ok: false, error: "IN_FUTURE" };
  const span = secondsBetween(startedAt, endedAt);
  if (span > MAX_SESSION_SECONDS) return { ok: false, error: "TOO_LONG" };
  if (input.durationMinutes == null) return { ok: true, seconds: span };
  const seconds = Math.round(input.durationMinutes * 60);
  if (seconds <= 0) return { ok: false, error: "DURATION_NOT_POSITIVE" };
  if (seconds > span) return { ok: false, error: "DURATION_EXCEEDS_SPAN" };
  return { ok: true, seconds };
}

/** Half-open interval overlap: [a1,a2) ∩ [b1,b2) ≠ ∅ */
export function intervalsOverlap(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1 < b2 && b1 < a2;
}

export function formatDuration(totalSeconds: number, locale: "uz" | "en"): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const hu = locale === "uz" ? "soat" : "h";
  const mu = locale === "uz" ? "daq" : "min";
  if (h > 0) return m > 0 ? `${h} ${hu} ${m} ${mu}` : `${h} ${hu}`;
  if (m > 0 || s === 0) return `${m} ${mu}`;
  return locale === "uz" ? `${s} soniya` : `${s} s`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
