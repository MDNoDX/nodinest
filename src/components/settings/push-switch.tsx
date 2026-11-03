"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

const b64ToBytes = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

type State = "loading" | "off" | "on" | "denied" | "unsupported";

/** "Notifications on this device": the browser asks once; a new message then rings even with the site closed. */
export function PushSwitch() {
  const t = useTranslations("notifications");
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState("");
  useEffect(() => {
    const check = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        return setState("unsupported");
      // The server's public key (none yet: push is not set up there).
      const r = await fetch("/api/push").catch(() => null);
      const k = r?.ok ? ((await r.json()) as { key: string | null }).key : null;
      if (!k) return setState("unsupported");
      setKey(k);
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    };
    void check().catch(() => setState("unsupported"));
  }, []);

  const flip = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (state === "on") {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        return setState("off");
      }
      const ok = await Notification.requestPermission();
      if (ok !== "granted") return setState(ok === "denied" ? "denied" : "off");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(key),
      });
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!r.ok) throw new Error(String(r.status));
      setState("on");
      toast.success(t("pushOn"));
    } catch {
      toast.error(t("pushFailed"));
    }
  };

  const on = state === "on";
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{t("push")}</span>
        <span className="text-muted block text-xs">
          {state === "unsupported"
            ? t("pushUnsupported")
            : state === "denied"
              ? t("pushDenied")
              : t("pushHint")}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t("push")}
        disabled={state === "loading" || state === "unsupported" || state === "denied"}
        onClick={() => void flip()}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40",
          on ? "bg-primary" : "bg-surface-2 ring-border ring-1",
        )}
      >
        <span
          className={cn(
            "bg-surface absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform",
            on && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}
