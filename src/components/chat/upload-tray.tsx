"use client";
import { RotateCw, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cancel, retry, usePending } from "./outbox";

/**
 * Files still going to a chat, on every page except that chat itself: who it
 * goes to, how far it is, ✕ to stop it (or retry when it failed).
 */
export function UploadTray() {
  const t = useTranslations("chat");
  const pathname = usePathname();
  const list = usePending().filter((p) => p.file && pathname !== `/chats/${p.threadId}`);
  if (!list.length) return null;
  return (
    <div className="fixed bottom-[calc(var(--bottom-nav,0px)+0.75rem)] left-3 z-40 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-2 lg:left-[calc(var(--sidebar-w,0px)+1rem)]">
      {list.map((p) => (
        <div
          key={p.key}
          className="bg-surface border-border animate-scale-in flex items-center gap-3 rounded-2xl border p-2.5 shadow-xl"
        >
          <span
            className="chat-upload grid size-10 shrink-0 place-items-center rounded-full"
            style={{ ["--pct" as string]: `${p.progress ?? 0}%` }}
          >
            <span className="bg-surface grid size-8 place-items-center rounded-full text-[11px] font-bold tabular-nums">
              {p.failed ? "!" : `${p.progress ?? 0}%`}
            </span>
          </span>
          <Link href={`/chats/${p.threadId}`} className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.file?.name}</span>
            <span className="text-muted block truncate text-xs">
              {p.failed ? t("failed") : t("uploadingTo", { name: p.to })}
            </span>
          </Link>
          {p.failed && (
            <button
              type="button"
              onClick={() => retry(p)}
              aria-label={t("retry")}
              className="text-muted hover:text-foreground grid size-8 place-items-center rounded-full"
            >
              <RotateCw className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => cancel(p.key)}
            aria-label={t("cancelSend")}
            className="text-muted hover:text-foreground grid size-8 place-items-center rounded-full"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
