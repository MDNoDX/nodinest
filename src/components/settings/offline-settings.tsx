"use client";
import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  canWorkOffline,
  offlineOn,
  serverSyncState,
  setOfflineOn,
  subscribeSync,
  syncOffline,
  syncState,
} from "@/lib/offline-sync";

const noop = () => () => {};

/** Settings → App: work without the internet on this device. */
export function OfflineSettings() {
  const t = useTranslations("offline");
  const f = useFormatter();
  const s = useSyncExternalStore(subscribeSync, syncState, serverSyncState);
  const on = useSyncExternalStore(subscribeSync, offlineOn, () => false);
  const able = useSyncExternalStore(noop, canWorkOffline, () => true);
  if (!able) return <p className="text-muted text-sm">{t("unsupported")}</p>;
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("modeTitle")}</span>
          <span className="text-muted block text-xs leading-relaxed">{t("modeHint")}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("modeTitle")}
          onClick={() => setOfflineOn(!on)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            on ? "bg-primary" : "bg-surface-2 ring-border-strong ring-1",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
              on && "translate-x-5",
            )}
          />
        </button>
      </div>
      {on && (
        <div className="bg-surface-2 flex flex-col gap-2 rounded-xl p-3">
          {s.running ? (
            <>
              <p className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                {t("syncing", { done: s.done, total: s.total || "…" })}
              </p>
              <div className="bg-border h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <CloudOff className="size-4 text-[var(--c-emerald)]" />
              {s.at
                ? t("status", {
                    pages: s.pages,
                    books: s.books,
                    when: f.dateTime(s.at, { dateStyle: "medium", timeStyle: "short" }),
                  })
                : t("never")}
            </p>
          )}
          {s.failed && <p className="text-danger text-xs">{t("failed")}</p>}
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={s.running}
              onClick={() => void syncOffline(true)}
            >
              <RefreshCw /> {t("syncNow")}
            </Button>
          </div>
        </div>
      )}
      <p className="text-muted text-xs leading-relaxed">{t("limits")}</p>
    </div>
  );
}
