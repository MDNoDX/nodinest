"use client";
import { Loader2, MessageCircle, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { searchChatsAction } from "@/app/actions/dm";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { normalizeText } from "@/lib/normalize";
import type { DmPerson, DmThreadRow } from "@/server/dm";
import { KindLabel, listTime, useNow } from "./parts";

type Found = {
  people: (DmPerson & { locked?: boolean })[];
  messages: { id: string; threadId: string; body: string; at: string; other: DmPerson }[];
};

/**
 * Chatlar: the list of conversations on the left (the whole screen on a phone
 * until one is opened) and the open one on the right. The search on top finds
 * my conversations, people to start one with, and words in what was written.
 */
export function ChatLayout({
  me,
  initial,
  children,
}: {
  me: string;
  initial: DmThreadRow[];
  children: React.ReactNode;
}) {
  const t = useTranslations("chat");
  const pathname = usePathname();
  const open = /^\/chats\/[^/]+/.test(pathname) && pathname !== "/chats/new";
  const [threads, setThreads] = useState(initial);
  const width = useListWidth();
  const [q, setQ] = useState("");
  const router = useRouter();

  // The list stays fresh: every 10 s while visible, and on every move.
  useEffect(() => {
    let stop = false;
    const ask = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/dm/threads", { cache: "no-store" }).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { threads: DmThreadRow[] }) : null;
      if (!stop && j) setThreads(j.threads);
    };
    const first = setTimeout(ask, 800);
    const timer = setInterval(ask, 10_000);
    document.addEventListener("visibilitychange", ask);
    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [pathname]);

  // People and words, asked for a moment after typing stops (answers for an
  // older query are dropped).
  const [answer, setAnswer] = useState<{ q: string; found: Found } | null>(null);
  const key = q.trim();
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const timer = setTimeout(async () => {
      const r = await searchChatsAction(key).catch(() => null);
      if (!stop) setAnswer({ q: key, found: r?.ok ? r.data : { people: [], messages: [] } });
    }, 250);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [key]);
  const found = key && answer?.q === key ? answer.found : null;
  const searching = !!key && !found;

  const mine = useMemo(() => {
    const k = normalizeText(q.trim().replace(/^@/, ""));
    if (!k) return threads;
    return threads.filter(
      (x) => normalizeText(x.other.name).includes(k) || x.other.username.toLowerCase().includes(k),
    );
  }, [q, threads]);
  const talking = new Set(threads.map((x) => x.other.id));
  const people = (found?.people ?? []).filter((p) => !talking.has(p.id));

  // The visible height of the screen (smaller while the keyboard is up), so the
  // talk shrinks to it like in Telegram instead of being pushed off the top.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const set = () => {
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      // The phone scrolls the page to show the field: the page stays put, the talk moves.
      if (window.scrollY) window.scrollTo(0, 0);
    };
    set();
    vv.addEventListener("resize", set);
    return () => {
      vv.removeEventListener("resize", set);
      root.style.removeProperty("--vvh");
    };
  }, []);

  return (
    <div
      className={cn(
        "-mx-4 -my-6 flex sm:-mx-6 sm:-my-8 lg:h-[calc(var(--vvh,100dvh)-3.5rem)]",
        // A phone: the list scrolls with the page; an open talk fills what the
        // keyboard leaves (--vvh follows the visible part of the screen).
        open && "h-[calc(var(--vvh,100dvh)-3.5rem)]",
      )}
    >
      <aside
        style={{ ["--list-w" as string]: `${width.value}px` }}
        className={cn(
          "border-border relative flex w-full flex-col lg:w-[var(--list-w)] lg:shrink-0 lg:border-r",
          open && "max-lg:hidden",
        )}
      >
        {/* Drag the edge to make the list wider or narrower (kept on this device). */}
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={t("resize")}
          onPointerDown={width.start}
          onDoubleClick={width.reset}
          className="hover:bg-primary/40 active:bg-primary/60 absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize transition-colors lg:block"
        />
        <div className="border-border flex flex-col gap-3 border-b p-3">
          <h1 className="px-1 text-xl font-bold">{t("title")}</h1>
          <label className="bg-surface-2 focus-within:ring-primary/40 flex h-10 items-center gap-2 rounded-xl px-3 focus-within:ring-2">
            <Search className="text-muted size-4 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPh")}
              aria-label={t("search")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {searching && <Loader2 className="text-muted size-4 animate-spin" />}
            {q && !searching && (
              <button type="button" onClick={() => setQ("")} aria-label={t("clear")}>
                <X className="text-muted size-4" />
              </button>
            )}
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {q.trim() && <Heading>{t("chats")}</Heading>}
          {mine.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {mine.map((x) => (
                <ThreadItem key={x.id} row={x} me={me} active={pathname === `/chats/${x.id}`} />
              ))}
            </ul>
          ) : !q.trim() ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="bg-primary-soft text-primary grid size-14 place-items-center rounded-2xl">
                <MessageCircle className="size-7" />
              </span>
              <p className="font-semibold">{t("empty")}</p>
              <p className="text-muted text-sm">{t("emptyBody")}</p>
            </div>
          ) : (
            <p className="text-muted px-3 py-2 text-sm">{t("noneFound")}</p>
          )}
          {q.trim() && people.length > 0 && (
            <>
              <Heading>{t("people")}</Heading>
              <ul className="flex flex-col gap-0.5">
                {people.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/chats/new?u=${encodeURIComponent(p.username)}`)}
                      className="hover:bg-surface-2 flex w-full items-center gap-3 rounded-xl p-2 text-left"
                    >
                      <Avatar name={p.name} image={p.image} className="size-11" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="text-muted block truncate text-xs">@{p.username}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {q.trim() && found && found.messages.length > 0 && (
            <>
              <Heading>{t("messages")}</Heading>
              <ul className="flex flex-col gap-0.5">
                {found.messages.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/chats/${m.threadId}#m-${m.id}`}
                      className="hover:bg-surface-2 flex items-center gap-3 rounded-xl p-2"
                    >
                      <Avatar name={m.other.name} image={m.other.image} className="size-11" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-semibold">{m.other.name}</span>
                          <Time at={m.at} />
                        </span>
                        <span className="text-muted line-clamp-1 text-sm">{m.body}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
      <section className={cn("min-w-0 flex-1", !open && "max-lg:hidden")}>{children}</section>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide uppercase">
      {children}
    </h2>
  );
}

function Time({ at }: { at: string }) {
  const locale = useLocale();
  const t = useTranslations("chat");
  return (
    <span className="text-muted ml-auto shrink-0 text-[11px] tabular-nums">
      {listTime(at, locale, t("yesterday"))}
    </span>
  );
}

function ThreadItem({ row, me, active }: { row: DmThreadRow; me: string; active: boolean }) {
  const t = useTranslations("chat");
  const now = useNow();
  const last = row.last;
  return (
    <li>
      <Link
        href={`/chats/${row.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl p-2 transition-colors",
          active ? "bg-primary-soft" : "hover:bg-surface-2",
        )}
      >
        <span className="relative shrink-0">
          <Avatar name={row.other.name} image={row.other.image} className="size-12" />
          {row.other.seen && now > 0 && now - Date.parse(row.other.seen) < 2 * 60_000 && (
            <span
              aria-label={t("online")}
              className="ring-background absolute right-0 bottom-0 size-3.5 rounded-full bg-[var(--c-emerald)] ring-2"
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[15px] font-semibold">{row.other.name}</span>
            <Time at={row.lastAt} />
          </span>
          <span className="flex items-center gap-2">
            <span className="text-muted line-clamp-1 min-w-0 flex-1 text-sm">
              {last && last.senderId === me && (
                <span className="text-foreground/70">{t("you")}: </span>
              )}
              {last && <KindLabel kind={last.kind} text={last.text} />}
            </span>
            {row.unread > 0 && (
              <span className="bg-primary text-primary-foreground grid min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] leading-5 font-bold tabular-nums">
                {row.unread > 99 ? "99+" : row.unread}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

const WIDTH_KEY = "nn:chat-list-w";
const DEFAULT_W = 340;

/** The chat list's width on wide screens: dragged by its edge, kept per device. */
function useListWidth() {
  const [value, setValue] = useState(DEFAULT_W);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const v = Number(localStorage.getItem(WIDTH_KEY));
        if (v >= 260 && v <= 560) setValue(v);
      } catch {
        /* storage unavailable */
      }
    });
    return () => clearTimeout(timer);
  }, []);
  const save = (v: number) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(v));
    } catch {
      /* storage unavailable */
    }
  };
  const start = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    const from = e.clientX;
    const base = value;
    let last = base;
    const move = (ev: PointerEvent) => {
      last = Math.max(260, Math.min(560, base + ev.clientX - from));
      setValue(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      save(last);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const reset = () => {
    setValue(DEFAULT_W);
    save(DEFAULT_W);
  };
  return { value, start, reset };
}
