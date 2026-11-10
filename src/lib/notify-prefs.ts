/** The notification switches in Settings; a missing key means "on". */
export const NOTIFY_KEYS = [
  "messages",
  "people",
  "plans",
  "goals",
  "news",
  "telegram",
  "sound",
] as const;
export type NotifyKey = (typeof NOTIFY_KEYS)[number];
export type NotifyPrefs = Record<NotifyKey, boolean>;

/** What `user.notify` holds: the switches, and the times of the day's plan messages. */
export type NotifyRaw = Record<string, boolean | string>;

export const readPrefs = (raw: NotifyRaw | null | undefined): NotifyPrefs =>
  Object.fromEntries(NOTIFY_KEYS.map((k) => [k, raw?.[k] !== false])) as NotifyPrefs;

/**
 * When the plan messages go to Telegram: the day's list in the morning and
 * what is left in the evening. "off" stops one; a missing key is the default.
 */
export const PLAN_TIMES = { morningAt: "07:00", eveningAt: "21:30" } as const;
export type PlanTimeKey = keyof typeof PLAN_TIMES;
export type PlanTimes = Record<PlanTimeKey, string | null>;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const readPlanTimes = (raw: NotifyRaw | null | undefined): PlanTimes =>
  Object.fromEntries(
    (Object.keys(PLAN_TIMES) as PlanTimeKey[]).map((k) => {
      const v = raw?.[k];
      return [k, v === "off" ? null : typeof v === "string" && HHMM.test(v) ? v : PLAN_TIMES[k]];
    }),
  ) as PlanTimes;

/** Which switch a notification kind obeys. */
export const PREF_OF: Record<string, NotifyKey> = {
  message: "messages",
  follow: "people",
  follow_request: "people",
  follow_accepted: "people",
  copied: "people",
  like: "people",
  post: "people",
  comment: "people",
  goal_soon: "goals",
  goal_due: "goals",
  weekly: "plans",
  news: "news",
};
