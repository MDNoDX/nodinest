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

export const readPrefs = (raw: Record<string, boolean> | null | undefined): NotifyPrefs =>
  Object.fromEntries(NOTIFY_KEYS.map((k) => [k, raw?.[k] !== false])) as NotifyPrefs;

/** Which switch a notification kind obeys. */
export const PREF_OF: Record<string, NotifyKey> = {
  message: "messages",
  follow: "people",
  follow_request: "people",
  follow_accepted: "people",
  copied: "people",
  like: "people",
  comment: "people",
  goal_soon: "goals",
  goal_due: "goals",
  weekly: "plans",
  news: "news",
};
