"use client";
/**
 * The bridge to the installed app (mobile/, Capacitor). The app opens this site,
 * so `window.Capacitor` is there only inside it, and nothing here loads in a
 * browser. What only an app can do lives behind these calls.
 */
type Plugin = Record<string, (...a: never[]) => Promise<unknown>>;
type Cap = { isNativePlatform?: () => boolean; Plugins?: Record<string, Plugin | undefined> };

const cap = () =>
  typeof window === "undefined" ? undefined : (window as { Capacitor?: Cap }).Capacitor;

export const isNativeApp = () => !!cap()?.isNativePlatform?.();
const plugin = <T>(name: string) => cap()?.Plugins?.[name] as T | undefined;

type BrowserPlugin = {
  open: (o: { url: string }) => Promise<void>;
  close: () => Promise<void>;
};
type AppPlugin = {
  addListener: (e: "appUrlOpen", fn: (d: { url: string }) => void) => Promise<unknown>;
};

/** Google refuses web views: sign-in happens in the system browser and comes back by link. */
export const openSystemSignIn = () =>
  plugin<BrowserPlugin>("Browser")?.open({
    url: `${window.location.origin}/app-login?from=mobile`,
  });

/** roznoma://auth?code=… from the system browser becomes this app's session. */
export function listenForSignIn() {
  void plugin<AppPlugin>("App")?.addListener("appUrlOpen", ({ url }) => {
    const code = /^roznoma:\/\/auth\?code=([\w-]+)/.exec(url)?.[1];
    if (!code) return;
    void plugin<BrowserPlugin>("Browser")?.close();
    // An API route that sets the session cookie: a full load, not a page change.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    window.location.href = `/api/app/handoff?code=${code}`;
  });
}

export type Alarm = { id: string; title: string; body: string; at: string };

type Notifications = {
  requestPermissions: () => Promise<{ display: string }>;
  getPending: () => Promise<{ notifications: { id: number }[] }>;
  cancel: (o: { notifications: { id: number }[] }) => Promise<void>;
  schedule: (o: {
    notifications: {
      id: number;
      title: string;
      body: string;
      schedule: { at: Date; allowWhileIdle: boolean };
    }[];
  }) => Promise<unknown>;
};

/** A stable number for an item on a day (the system asks for 32-bit ids). */
const noteId = (a: Alarm) => {
  let h = 7;
  for (const c of `${a.id}${a.at}`) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
};

/** Hands the coming alarms to the phone: they ring with the app closed and no internet. */
export async function scheduleAlarms(alarms: Alarm[]) {
  const n = plugin<Notifications>("LocalNotifications");
  if (!n) return;
  const { display } = await n.requestPermissions();
  if (display !== "granted") return;
  const { notifications } = await n.getPending();
  if (notifications.length) await n.cancel({ notifications });
  const now = Date.now();
  await n.schedule({
    // iOS keeps 64 at most.
    notifications: alarms
      .filter((a) => new Date(a.at).getTime() > now)
      .slice(0, 60)
      .map((a) => ({
        id: noteId(a),
        title: a.title,
        body: a.body,
        schedule: { at: new Date(a.at), allowWhileIdle: true },
      })),
  });
}
