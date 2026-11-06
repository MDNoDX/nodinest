"use client";
/* eslint-disable @next/next/no-img-element */
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as D } from "radix-ui";
import { useEffect, useRef, useState } from "react";

export type ViewerItem = {
  id: string;
  kind: "image" | "video" | "gif";
  src: string;
  name: string;
  caption: string | null;
  who: string;
  when: string;
};

/**
 * A chat's pictures and videos full screen, like Telegram: the whole picture
 * on black, a video that plays at once, a swipe (or ← →) to the next one,
 * the caption and who sent it, and a download.
 */
export function MediaViewer({
  items,
  at,
  onClose,
}: {
  items: ViewerItem[];
  at: number;
  onClose: () => void;
}) {
  const t = useTranslations("chat");
  const [i, setI] = useState(at);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  const it = items[i];
  const go = (d: number) => setI((x) => Math.max(0, Math.min(items.length - 1, x + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!it) return null;
  return (
    <D.Root open onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="animate-fade-in fixed inset-0 z-[80] bg-black/95" />
        <D.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[80] flex flex-col bg-black text-white outline-none"
          onTouchStart={(e) => {
            touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }}
          onTouchMove={(e) => {
            const s = touch.current;
            if (!s || e.touches.length > 1) return;
            const x = e.touches[0].clientX - s.x;
            if (Math.abs(x) > Math.abs(e.touches[0].clientY - s.y)) setDx(x);
          }}
          onTouchEnd={(e) => {
            const s = touch.current;
            touch.current = null;
            setDx(0);
            if (!s) return;
            const x = e.changedTouches[0].clientX - s.x;
            const y = e.changedTouches[0].clientY - s.y;
            if (Math.abs(x) > 60 && Math.abs(x) > Math.abs(y)) go(x < 0 ? 1 : -1);
            else if (y > 110 && Math.abs(y) > Math.abs(x) * 1.5) onClose(); // swipe down closes
          }}
        >
          <D.Title className="sr-only">{it.name}</D.Title>
          <header className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{it.who}</span>
              <span className="block text-xs text-white/60">
                {it.when}
                {items.length > 1 && ` · ${i + 1} / ${items.length}`}
              </span>
            </span>
            {it.kind !== "gif" && (
              <a
                href={it.src}
                download={it.name}
                aria-label={t("download")}
                title={t("download")}
                className="grid size-10 place-items-center rounded-full hover:bg-white/10"
              >
                <Download className="size-5" />
              </a>
            )}
            <D.Close
              aria-label={t("close")}
              className="grid size-10 place-items-center rounded-full hover:bg-white/10"
            >
              <X className="size-6" />
            </D.Close>
          </header>
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center"
            style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
          >
            {it.kind === "video" ? (
              <video
                key={it.id}
                src={it.src}
                controls
                autoPlay
                playsInline
                preload="auto"
                className="max-h-full max-w-full"
              />
            ) : (
              <img
                key={it.id}
                src={it.src}
                alt={it.name}
                className="animate-scale-in max-h-full max-w-full object-contain select-none"
                draggable={false}
              />
            )}
            {i > 0 && (
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t("previous")}
                className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 max-sm:hidden"
              >
                <ChevronLeft className="size-6" />
              </button>
            )}
            {i < items.length - 1 && (
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t("next")}
                className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 max-sm:hidden"
              >
                <ChevronRight className="size-6" />
              </button>
            )}
          </div>
          {it.caption && (
            <p className="max-h-32 overflow-y-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm whitespace-pre-wrap">
              {it.caption}
            </p>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
