"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { checkRoutineAction } from "@/app/actions/roznoma";

type Item = {
  id: string;
  title: string;
  amount: string | null;
  time: string | null;
  alarm: boolean;
  done: boolean;
};

/** A soft alarm melody (Web Audio, no file): three rising notes, four times. */
let ctx: AudioContext | null = null;
function ring() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const now = ctx.currentTime;
    const notes = [659.25, 783.99, 987.77];
    for (let rep = 0; rep < 4; rep++)
      notes.forEach((f, i) => {
        const o = ctx!.createOscillator();
        const g = ctx!.createGain();
        o.type = "sine";
        o.frequency.value = f;
        const t0 = now + rep * 1.6 + i * 0.22;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
        o.connect(g).connect(ctx!.destination);
        o.start(t0);
        o.stop(t0 + 1);
      });
  } catch {
    /* no audio */
  }
}

const minutesIn = (tz: string, d = new Date()) => {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const [h, m, sec] = s.split(":").map(Number);
  return h * 60 + m + sec / 60;
};

/**
 * Röznoma alarms while the site is open (any page): at an item's time it
 * rings and shows a notification with "Done"; at 21:30 it says what is left.
 * (When the site is closed, the Telegram bot reminds instead.)
 */
export function AlarmWatcher() {
  const t = useTranslations("roznoma");
  const router = useRouter();
  useEffect(() => {
    // Browsers allow sound only after the first touch / click on the page.
    const unlock = () => {
      try {
        ctx ??= new AudioContext();
        void ctx.resume();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    let timers: number[] = [];
    let alive = true;
    const notify = (title: string, body: string) => {
      if ("Notification" in window && Notification.permission === "granted")
        try {
          new Notification(title, { body, icon: "/icons/icon-192.png", tag: title });
        } catch {
          /* some phones need the service worker; the toast still shows */
        }
    };
    const plan = async () => {
      timers.forEach(clearTimeout);
      timers = [];
      const r = await fetch("/api/roznoma/today").catch(() => null);
      if (!alive || !r?.ok) return;
      const d = (await r.json()) as { day: string; tz: string; items: Item[] };
      const now = minutesIn(d.tz);
      for (const i of d.items) {
        if (i.done || !i.alarm || !i.time) continue;
        const at = Number(i.time.slice(0, 2)) * 60 + Number(i.time.slice(3, 5));
        const wait = (at - now) * 60_000;
        if (wait < -60_000 || wait > 13 * 3600_000) continue;
        timers.push(
          window.setTimeout(
            () => {
              const key = `nn:alarm:${d.day}:${i.id}`;
              try {
                if (localStorage.getItem(key)) return;
                localStorage.setItem(key, "1");
              } catch {
                /* ignore */
              }
              ring();
              const body = `${i.time} · ${i.title}${i.amount ? ` — ${i.amount}` : ""}`;
              notify(t("alarmTitle"), body);
              toast(`⏰ ${body}`, {
                duration: 60_000,
                action: {
                  label: t("markDone"),
                  onClick: () => void checkRoutineAction(i.id, d.day, true),
                },
              });
            },
            Math.max(0, wait),
          ),
        );
      }
      // End of the day: what is still undone (once a day).
      const eod = 21 * 60 + 30;
      const wait = (eod - now) * 60_000;
      if (wait > -3600_000 && wait < 13 * 3600_000)
        timers.push(
          window.setTimeout(
            async () => {
              const key = `nn:alarm-eod:${d.day}`;
              try {
                if (localStorage.getItem(key)) return;
                localStorage.setItem(key, "1");
              } catch {
                /* ignore */
              }
              const fresh = await fetch("/api/roznoma/today").catch(() => null);
              const items = fresh?.ok ? ((await fresh.json()) as { items: Item[] }).items : d.items;
              const left = items.filter((x) => !x.done);
              if (!left.length) return;
              const body = left
                .slice(0, 5)
                .map((x) => x.title)
                .join(", ");
              notify(t("eodTitle", { n: left.length }), body);
              toast(`🌙 ${t("eodTitle", { n: left.length })}`, {
                description: body,
                duration: 30_000,
                action: { label: t("open"), onClick: () => router.push("/plans") },
              });
            },
            Math.max(0, wait),
          ),
        );
    };
    void plan();
    const every = window.setInterval(() => void plan(), 10 * 60_000);
    const onFocus = () => document.visibilityState === "visible" && void plan();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [t, router]);
  return null;
}
