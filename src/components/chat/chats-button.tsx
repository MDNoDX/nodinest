"use client";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const EVENT = "nn:chats-unread";

/** Tells the badge to ask again at once (a conversation was just read). */
export const refreshUnreadChats = () => window.dispatchEvent(new Event(EVENT));

/**
 * Conversations with something unread: from the server render, then asked
 * again every 30 s while the page is visible, on every navigation and when a
 * conversation is read.
 */
export function useUnreadChats(initial: number, pathname: string) {
  const [n, setN] = useState(initial);
  useEffect(() => {
    let stop = false;
    const ask = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/dm/threads?count", { cache: "no-store" }).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { unread: number }) : null;
      if (!stop && j) setN(j.unread);
    };
    const first = setTimeout(ask, 1500);
    const timer = setInterval(ask, 30_000);
    window.addEventListener(EVENT, ask);
    document.addEventListener("visibilitychange", ask);
    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener(EVENT, ask);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [pathname]);
  return n;
}

/** The top bar's way to the conversations. */
export function ChatsButton({ count }: { count: number }) {
  const t = useTranslations("chat");
  return (
    <Link
      href="/chats"
      aria-label={count ? t("unread", { n: count }) : t("title")}
      title={t("title")}
      className="text-muted hover:bg-surface-2 hover:text-foreground relative grid size-9 place-items-center rounded-lg transition-colors"
    >
      <MessageCircle className="size-[18px]" />
      {count > 0 && (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
