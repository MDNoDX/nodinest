"use client";
import {
  ArrowDown,
  ArrowLeft,
  Ban,
  Copy,
  CornerUpLeft,
  Eraser,
  EllipsisVertical,
  Loader2,
  RotateCw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DropdownMenu as M } from "radix-ui";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  clearChatAction,
  deleteMessageAction,
  reactAction,
  setBlockedAction,
} from "@/app/actions/dm";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import type { DmGif, DmMessage, DmPerson, DmReactions } from "@/server/dm";
import { refreshUnreadChats } from "./chats-button";
import { Composer, type Voice } from "./composer";
import { EmojiGif } from "./emoji-gif";
import { cancel, onSent, queue as queueOut, retry, usePending, type Pending } from "./outbox";
import { Attachment, KindLabel, ReadMark, clock, dayLabel, seenText, useNow } from "./parts";

type View = {
  id: string;
  other: DmPerson;
  canWrite: boolean;
  blockedByMe: boolean;
  otherReadAt: string | null;
  messages: DmMessage[];
  more: boolean;
  reactions?: DmReactions;
  reactedAt?: string | null;
};
const NEAR = 140;
/** The reactions offered at once (the smile opens every emoji). */
const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"];
/** How far a finger pulls a message to the left to answer it. */
const SWIPE = 56;
/** Seen this recently = online. */
const ONLINE_MS = 2 * 60_000;
const kindOf = (m: DmMessage) =>
  m.deleted
    ? "deleted"
    : m.file
      ? m.file.mime.startsWith("image/")
        ? "photo"
        : m.file.mime.startsWith("audio/")
          ? "voice"
          : m.file.mime.startsWith("video/")
            ? "video"
            : "file"
      : m.item
        ? "item"
        : m.meta?.gif
          ? "gif"
          : "text";

/**
 * One conversation, Telegram-like: bubbles by day, replies, ✓ / ✓✓, photos,
 * voice, video, files and shared items. New messages come by asking every
 * 3 s while the page is visible (slower when nothing happens); sending shows
 * the message at once and keeps it with "retry" if it fails.
 */
export function ChatThread({ me, initial }: { me: string; initial: View }) {
  const t = useTranslations("chat");
  const te = useTranslations("errors");
  const locale = useLocale();
  const [list, setList] = useState(initial.messages);
  const [readAt, setReadAt] = useState(initial.otherReadAt);
  const [more, setMore] = useState(initial.more);
  const [blockedByMe, setBlockedByMe] = useState(initial.blockedByMe);
  const [canWrite, setCanWrite] = useState(initial.canWrite);
  const [reply, setReply] = useState<DmMessage | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [seen, setSeen] = useState(initial.other.seen ?? null);
  const [reacts, setReacts] = useState<DmReactions>(initial.reactions ?? {});
  const reactedAt = useRef(initial.reactedAt ?? null);
  // Swiping a message to answer it (phones): which one and how far.
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const touchAt = useRef<{ id: string; x: number; y: number; on: boolean | null } | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const swipedAt = useRef(0);
  const now = useNow();
  const [clearing, setClearing] = useState(false);
  const [below, setBelow] = useState(0);
  const [away, setAway] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    // Phones: Enter is a new line, the send button sends.
    const m = matchMedia("(pointer: coarse)");
    const set = () => setTouch(m.matches);
    const first = setTimeout(set);
    m.addEventListener("change", set);
    return () => {
      clearTimeout(first);
      m.removeEventListener("change", set);
    };
  }, []);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const other = initial.other;

  const last = list.at(-1)?.createdAt;
  const lastRef = useRef(last);
  useEffect(() => {
    lastRef.current = last;
  }, [last]);

  const toEnd = useCallback((smooth = false) => {
    const el = box.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    stick.current = true;
    setBelow(0);
    setAway(false);
  }, []);

  // Opened: at the newest line, or at a message found by the search (#m-id).
  useLayoutEffect(() => {
    const id = window.location.hash.slice(3);
    const target = id ? document.getElementById(`m-${id}`) : null;
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.classList.add("chat-found");
      stick.current = false;
      requestAnimationFrame(() => setAway(true));
    } else toEnd();
    refreshUnreadChats();
  }, [toEnd]);

  // Keep at the bottom while there (pictures load, new messages arrive).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const grew = new ResizeObserver(() => stick.current && toEnd());
    if (el.firstElementChild) grew.observe(el.firstElementChild);
    return () => grew.disconnect();
  }, [toEnd]);

  const merge = useCallback((add: DmMessage[], gone: string[] = []) => {
    if (!add.length && !gone.length) return;
    setList((l) => {
      const byId = new Map(l.map((m) => [m.id, m]));
      for (const m of add) byId.set(m.id, m);
      for (const id of gone) {
        const m = byId.get(id);
        if (m) byId.set(id, { ...m, deleted: true, body: null, file: null, item: null });
      }
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  // New messages: every 3 s while visible; every 8 s after a quiet minute.
  useEffect(() => {
    let stop = false;
    let quietSince = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        const after = lastRef.current ?? new Date(0).toISOString();
        const rat = reactedAt.current ? `&rat=${encodeURIComponent(reactedAt.current)}` : "";
        const r = await fetch(`/api/dm/${initial.id}?after=${encodeURIComponent(after)}${rat}`, {
          cache: "no-store",
        }).catch(() => null);
        if (r?.status === 404) return;
        const j = r?.ok
          ? ((await r.json()) as {
              messages: DmMessage[];
              otherReadAt: string | null;
              gone: string[];
              seen?: string | null;
              reactions?: DmReactions;
              reactedAt?: string;
            })
          : null;
        if (!stop && j) {
          if (j.reactions && j.reactedAt) {
            reactedAt.current = j.reactedAt;
            setReacts(j.reactions);
          }
          setReadAt(j.otherReadAt);
          setSeen(j.seen ?? null);
          const fresh = j.messages.filter((m) => m.senderId !== me);
          merge(j.messages, j.gone);
          if (fresh.length) {
            quietSince = Date.now();
            refreshUnreadChats();
            if (!stick.current) setBelow((n) => n + fresh.length);
          }
        }
      }
      timer = setTimeout(ask, Date.now() - quietSince > 60_000 ? 8000 : 3000);
    };
    timer = setTimeout(ask, 3000);
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      quietSince = Date.now();
      void ask();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [initial.id, me, merge]);

  // Older messages when scrolled to the top (the view stays where it was).
  const loadingOlder = useRef(false);
  const older = async () => {
    if (loadingOlder.current || !more || !list.length) return;
    loadingOlder.current = true;
    const el = box.current!;
    const from = el.scrollHeight - el.scrollTop;
    const r = await fetch(`/api/dm/${initial.id}?before=${encodeURIComponent(list[0].createdAt)}`, {
      cache: "no-store",
    }).catch(() => null);
    const j = r?.ok ? ((await r.json()) as { messages: DmMessage[]; more: boolean }) : null;
    if (j) {
      merge(j.messages);
      setMore(j.more);
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - from;
      });
    }
    loadingOlder.current = false;
  };

  const onScroll = () => {
    const el = box.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
    setAway(!stick.current);
    if (stick.current) setBelow(0);
    if (el.scrollTop < 80) void older();
  };

  // Messages on their way live outside this page (leaving does not lose them).
  const pending = usePending(initial.id);
  const queue = (items: Omit<Pending, "key" | "threadId" | "to">[]) => {
    queueOut(
      me,
      items.map((it) => ({ ...it, threadId: initial.id, to: other.name })),
    );
    requestAnimationFrame(() => toEnd(true));
  };
  useEffect(
    () =>
      onSent((threadId, m) => {
        if (threadId !== initial.id) return;
        merge([m]);
        toEnd(true);
      }),
    [initial.id, merge, toEnd],
  );
  // Refused by the server: blocked (the box closes) or another reason (said once).
  const told = useRef(new Set<string>());
  useEffect(() => {
    for (const p of pending)
      if (p.failed && p.code && !told.current.has(p.key)) {
        told.current.add(p.key);
        errorToast(te, p.code === "FORBIDDEN" ? "dm_blocked" : p.code);
      }
  }, [pending, te]);
  const writable = canWrite && !pending.some((p) => p.code === "FORBIDDEN");

  const replyId = () => {
    const id = reply?.id;
    setReply(null);
    return id;
  };
  // My reaction: the same emoji again takes it back; shown at once, then saved.
  const react = async (m: DmMessage, e: string) => {
    const before = reacts;
    const others = (reacts[m.id] ?? []).filter((r) => r.u !== me);
    const had = (reacts[m.id] ?? []).find((r) => r.u === me)?.e;
    const next = had === e ? null : e;
    setReacts({ ...reacts, [m.id]: next ? [...others, { e: next, u: me }] : others });
    setPicked(null);
    const r = await reactAction(m.id, next);
    if (!r.ok) {
      setReacts(before);
      errorToast(te, r.code);
    }
  };
  // Phones: a finger pulling a message to the left answers it (like Telegram).
  const touchStart = (m: DmMessage, e: React.TouchEvent) => {
    if (!writable || m.deleted || e.touches.length !== 1) return;
    touchAt.current = { id: m.id, x: e.touches[0].clientX, y: e.touches[0].clientY, on: null };
  };
  const touchMove = (e: React.TouchEvent) => {
    const s0 = touchAt.current;
    if (!s0) return;
    const dx = e.touches[0].clientX - s0.x;
    const dy = e.touches[0].clientY - s0.y;
    // The first clear move decides: sideways pulls the message, up or down scrolls.
    if (s0.on === null && Math.abs(dx) + Math.abs(dy) > 8)
      s0.on = Math.abs(dx) > Math.abs(dy) * 1.4 && dx < 0;
    if (s0.on) setSwipe({ id: s0.id, dx: Math.max(-SWIPE * 1.4, Math.min(0, dx)) });
  };
  const touchEnd = (m: DmMessage, at: number) => {
    const pulled = swipe?.id === m.id && swipe.dx <= -SWIPE;
    touchAt.current = null;
    setSwipe(null);
    if (pulled) {
      swipedAt.current = at;
      setReply(m);
      navigator.vibrate?.(12);
    }
  };

  const sendText = (body: string) => queue([{ body, replyToId: replyId() }]);
  const sendFiles = (files: File[], caption: string) => {
    const to = replyId();
    queue(
      files.map((file, i) => ({
        file,
        body: i === 0 ? caption : undefined,
        replyToId: i === 0 ? to : undefined,
        preview: /^(image|video)\//.test(file.type) ? URL.createObjectURL(file) : undefined,
      })),
    );
  };
  const sendVoice = (v: Voice) =>
    queue([{ file: v.file, wave: v.wave, seconds: v.seconds, replyToId: replyId() }]);
  const sendGif = (gif: DmGif) => queue([{ gif, replyToId: replyId() }]);

  const clear = async (forBoth: boolean) => {
    setClearing(false);
    const r = await clearChatAction(initial.id, forBoth);
    if (!r.ok) return errorToast(te, r);
    setList([]);
    setMore(false);
    toast.success(t("cleared"));
  };

  const remove = async (m: DmMessage) => {
    setPicked(null);
    const r = await deleteMessageAction(m.id);
    if (!r.ok) return errorToast(te, r);
    merge([], [m.id]);
  };

  const block = async (on: boolean) => {
    if (on && !window.confirm(t("blockConfirm", { name: other.name }))) return;
    const r = await setBlockedAction(other.id, on);
    if (!r.ok) return errorToast(te, r);
    setBlockedByMe(on);
    setCanWrite(!on);
    toast.success(t(on ? "blockedDone" : "unblockedDone"));
  };

  return (
    <div data-thread className="flex h-full min-h-0 flex-col">
      <header className="border-border bg-background/90 flex h-14 shrink-0 items-center gap-2 border-b px-2 backdrop-blur sm:px-3">
        <Link
          href="/chats"
          aria-label={t("back")}
          className="text-muted hover:bg-surface-2 grid size-9 place-items-center rounded-lg lg:hidden"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Link href={`/u/${other.username}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={other.name} image={other.image} className="size-9" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{other.name}</span>
            <span
              className={cn(
                "block truncate text-xs",
                seen && now && now - Date.parse(seen) < ONLINE_MS
                  ? "text-[var(--c-emerald)]"
                  : "text-muted",
              )}
            >
              {seen && now ? seenText(now, seen, locale, t) : `@${other.username}`}
            </span>
          </span>
        </Link>
        <M.Root>
          <M.Trigger asChild>
            <button
              type="button"
              aria-label={t("more")}
              className="text-muted hover:bg-surface-2 grid size-9 place-items-center rounded-lg"
            >
              <EllipsisVertical className="size-5" />
            </button>
          </M.Trigger>
          <M.Portal>
            <M.Content
              align="end"
              sideOffset={6}
              className="bg-surface border-border animate-scale-in z-50 min-w-48 rounded-xl border p-1 shadow-xl"
            >
              <M.Item asChild>
                <Link
                  href={`/u/${other.username}`}
                  className="hover:bg-surface-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <UserRound className="size-4" /> {t("profile")}
                </Link>
              </M.Item>
              <M.Item
                onSelect={() => setClearing(true)}
                className="hover:bg-surface-2 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none"
              >
                <Eraser className="size-4" /> {t("clear")}
              </M.Item>
              <M.Item
                onSelect={() => void block(!blockedByMe)}
                className="hover:bg-surface-2 text-danger flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none"
              >
                <Ban className="size-4" /> {t(blockedByMe ? "unblock" : "block")}
              </M.Item>
            </M.Content>
          </M.Portal>
        </M.Root>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={box} onScroll={onScroll} className="chat-scroll h-full overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-1 px-3 py-4 sm:px-6">
            {more && (
              <div className="grid place-items-center py-2">
                <Loader2 className="text-muted size-4 animate-spin" />
              </div>
            )}
            {list.length === 0 && pending.length === 0 && (
              <div className="text-muted mx-auto my-16 max-w-xs text-center text-sm">
                <Avatar name={other.name} image={other.image} className="mx-auto mb-3 size-16" />
                {t("startWith", { name: other.name })}
              </div>
            )}
            {list.map((m, i) => {
              const mine = m.senderId === me;
              const prev = list[i - 1];
              const newDay = !prev || prev.createdAt.slice(0, 10) !== m.createdAt.slice(0, 10);
              const sameRun =
                !newDay &&
                prev?.senderId === m.senderId &&
                Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
              const q = m.reply;
              const media =
                !m.body && (!!m.meta?.gif || (!!m.file && /^(image|video)\//.test(m.file.mime)));
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="sticky top-1 z-10 my-2 grid place-items-center">
                      <span className="bg-surface-2/90 text-muted rounded-full px-3 py-0.5 text-xs font-medium backdrop-blur">
                        {dayLabel(m.createdAt, locale, t("today"), t("yesterday"))}
                      </span>
                    </div>
                  )}
                  <div
                    id={`m-${m.id}`}
                    onTouchStart={(e) => touchStart(m, e)}
                    onTouchMove={touchMove}
                    onTouchEnd={(e) => touchEnd(m, e.timeStamp)}
                    onTouchCancel={(e) => touchEnd(m, e.timeStamp)}
                    className={cn(
                      "group relative flex flex-col",
                      mine ? "items-end" : "items-start",
                      !sameRun && "mt-2",
                    )}
                  >
                    {swipe?.id === m.id && (
                      <span
                        aria-hidden
                        className="text-primary bg-primary-soft absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-full transition-transform"
                        style={{
                          transform: `translateY(-50%) scale(${Math.min(1, -swipe.dx / SWIPE)})`,
                        }}
                      >
                        <CornerUpLeft className="size-4" />
                      </span>
                    )}
                    <div
                      className={cn(
                        "flex max-w-[85%] items-end gap-1 sm:max-w-[75%]",
                        swipe?.id !== m.id && "transition-transform duration-200",
                      )}
                      style={
                        swipe?.id === m.id ? { transform: `translateX(${swipe.dx}px)` } : undefined
                      }
                    >
                      {!touch && !m.deleted && writable && (
                        <span
                          className={cn(
                            "opacity-0 transition-opacity group-hover:opacity-100",
                            !mine && "order-last",
                          )}
                        >
                          <IconBtn
                            label={t("reply")}
                            onClick={() => {
                              setReply(m);
                            }}
                          >
                            <CornerUpLeft className="size-4" />
                          </IconBtn>
                        </span>
                      )}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          // A second tap soon after on the same message: 👍 (like a double tap in Telegram).
                          const at = e.timeStamp;
                          if (at - swipedAt.current < 400) return; // the end of a swipe, not a tap
                          const tap = lastTap.current;
                          lastTap.current = { id: m.id, at };
                          if (tap?.id === m.id && at - tap.at < 320 && !m.deleted) {
                            lastTap.current = null;
                            void react(m, QUICK[0]);
                            return;
                          }
                          setPicked((p) => (p === m.id ? null : m.id));
                        }}
                        onKeyDown={(e) => e.key === "Enter" && setPicked(m.id)}
                        className={cn(
                          "relative min-w-0 cursor-default rounded-2xl text-[15px] leading-relaxed break-words whitespace-pre-wrap shadow-sm outline-none select-none sm:select-text",
                          media ? "p-0.5" : "px-3 py-2",
                          mine
                            ? "bg-primary-soft text-foreground rounded-br-md"
                            : "bg-surface border-border rounded-bl-md border",
                          sameRun && (mine ? "rounded-tr-md" : "rounded-tl-md"),
                          picked === m.id && "ring-primary/50 ring-2",
                          m.deleted && "text-muted italic",
                        )}
                      >
                        {q && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const el = document.getElementById(`m-${q.id}`);
                              el?.scrollIntoView({ behavior: "smooth", block: "center" });
                              el?.classList.remove("chat-found");
                              void el?.offsetWidth;
                              el?.classList.add("chat-found");
                            }}
                            className="border-primary bg-surface/50 mb-1.5 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs"
                          >
                            <span className="text-primary block font-semibold">
                              {q.senderId === me ? t("you") : other.name}
                            </span>
                            <span className="text-muted line-clamp-1">
                              <KindLabel kind={q.kind} text={q.text} />
                            </span>
                          </button>
                        )}
                        {m.deleted ? (
                          t("kind.deleted")
                        ) : (
                          <>
                            <Attachment m={m} mine={mine} />
                            {m.body && (
                              <span className={cn("block", (m.file || m.item) && "mt-1.5 px-1")}>
                                {linkify(m.body)}
                              </span>
                            )}
                          </>
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] tabular-nums select-none",
                            // On a picture the time sits on it, like Telegram (no empty strip below).
                            media
                              ? "absolute right-2 bottom-2 rounded-full bg-black/55 px-1.5 py-0.5 text-white backdrop-blur-sm"
                              : "text-muted float-right mt-1 ml-3 translate-y-1",
                          )}
                        >
                          {clock(m.createdAt, locale)}
                          {mine && !m.deleted && (
                            <ReadMark read={!!readAt && readAt >= m.createdAt} />
                          )}
                        </span>
                      </div>
                    </div>
                    {(reacts[m.id]?.length ?? 0) > 0 && (
                      <Reactions list={reacts[m.id]} me={me} onPick={(e) => void react(m, e)} />
                    )}
                    {picked === m.id && !m.deleted && writable && (
                      <div className="animate-scale-in bg-surface border-border mt-1 flex items-center gap-0.5 rounded-full border p-1 shadow-lg">
                        {QUICK.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => void react(m, e)}
                            aria-label={e}
                            className={cn(
                              "grid size-9 place-items-center rounded-full text-xl transition-transform hover:scale-125 active:scale-90",
                              reacts[m.id]?.some((r) => r.u === me && r.e === e) &&
                                "bg-primary-soft",
                            )}
                          >
                            {e}
                          </button>
                        ))}
                        <EmojiGif onEmoji={(e) => void react(m, e)} className="size-9" />
                      </div>
                    )}
                    {picked === m.id && !m.deleted && (
                      <div className="animate-fade-in mt-1 flex gap-1">
                        {writable && (
                          <Chip
                            onClick={() => {
                              setReply(m);
                              setPicked(null);
                            }}
                          >
                            <CornerUpLeft className="size-3.5" /> {t("reply")}
                          </Chip>
                        )}
                        {m.body && (
                          <Chip
                            onClick={() => {
                              void navigator.clipboard?.writeText(m.body ?? "");
                              setPicked(null);
                              toast.success(t("copied"));
                            }}
                          >
                            <Copy className="size-3.5" /> {t("copy")}
                          </Chip>
                        )}
                        {mine && (
                          <Chip danger onClick={() => void remove(m)}>
                            <Trash2 className="size-3.5" /> {t("delete")}
                          </Chip>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
            {pending.map((p) => (
              <div key={p.key} className="chat-msg-in mt-2 flex flex-col items-end">
                <div className="bg-primary-soft relative max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[15px] whitespace-pre-wrap sm:max-w-[75%]">
                  {p.preview && p.file?.type.startsWith("video/") ? (
                    <video
                      src={p.preview}
                      muted
                      playsInline
                      className="mb-1 max-h-60 rounded-xl bg-black opacity-80"
                    />
                  ) : p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview} alt="" className="mb-1 max-h-60 rounded-xl opacity-80" />
                  ) : null}
                  {p.gif && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.gif.url} alt="GIF" className="max-h-52 rounded-xl opacity-80" />
                  )}
                  {p.file && !p.preview && (
                    <span className="text-muted block text-sm">
                      {p.file.type.startsWith("audio/") ? t("kind.voice") : p.file.name}
                    </span>
                  )}
                  {p.body}
                  <span className="text-muted mt-1 flex items-center justify-end gap-1.5 text-[11px]">
                    {p.failed ? (
                      <button
                        type="button"
                        onClick={() => retry(p)}
                        className="text-danger inline-flex items-center gap-1 font-semibold"
                      >
                        <RotateCw className="size-3.5" /> {t("retry")}
                      </button>
                    ) : p.file ? (
                      // A file going up: how far, and a cross to stop it.
                      <span
                        className="chat-upload grid size-7 place-items-center rounded-full"
                        style={{ ["--pct" as string]: `${p.progress ?? 0}%` }}
                        title={`${p.progress ?? 0}%`}
                      >
                        <button
                          type="button"
                          onClick={() => cancel(p.key)}
                          aria-label={t("cancelSend")}
                          className="bg-primary-soft text-foreground grid size-[22px] place-items-center rounded-full"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ) : (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    {p.file && !p.failed && `${p.progress ?? 0}%`}
                    {p.failed && (
                      <button
                        type="button"
                        onClick={() => cancel(p.key)}
                        aria-label={t("cancelSend")}
                        className="hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {below > 0 || away ? (
          <button
            type="button"
            onClick={() => toEnd(true)}
            aria-label={t("toEnd")}
            className="bg-surface border-border text-muted hover:text-foreground absolute right-4 bottom-4 grid size-10 place-items-center rounded-full border shadow-lg"
          >
            <ArrowDown className="size-5" />
            {below > 0 && (
              <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-bold">
                {below}
              </span>
            )}
          </button>
        ) : null}
      </div>

      <footer className="border-border bg-background shrink-0 border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
        {!writable ? (
          <div className="text-muted flex items-center justify-center gap-2 py-2 text-sm">
            <Ban className="size-4" />
            {blockedByMe ? (
              <>
                {t("youBlocked")}
                <button
                  type="button"
                  onClick={() => void block(false)}
                  className="text-primary font-semibold hover:underline"
                >
                  {t("unblock")}
                </button>
              </>
            ) : (
              t("cannotWrite")
            )}
          </div>
        ) : (
          <Composer
            reply={
              reply
                ? {
                    senderName: reply.senderId === me ? t("you") : other.name,
                    kind: kindOf(reply),
                    text: reply.body,
                  }
                : null
            }
            onCancelReply={() => setReply(null)}
            onText={sendText}
            onFiles={sendFiles}
            onVoice={sendVoice}
            onGif={sendGif}
          />
        )}
      </footer>
      <Dialog open={clearing} onOpenChange={setClearing}>
        <DialogContent title={t("clearTitle")} closeLabel={t("cancel")}>
          <p className="text-muted text-sm">{t("clearBody", { name: other.name })}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setClearing(false)}>
              {t("cancel")}
            </Button>
            <Button variant="outline" onClick={() => void clear(false)}>
              {t("clearMine")}
            </Button>
            <Button variant="danger" onClick={() => void clear(true)}>
              {t("clearBoth", { name: other.name })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  big,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "text-muted hover:bg-surface-2 hover:text-foreground grid shrink-0 place-items-center rounded-full transition-colors",
        big ? "size-11" : "size-8",
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-surface border-border inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm",
        danger ? "text-danger" : "hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/g;

/** Links in a message open in a new tab; everything else stays plain text. */
function linkify(s: string) {
  const parts = s.split(URL_RE);
  return parts.map((p, i) =>
    i % 2 ? (
      <a
        key={i}
        href={p}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
        className="text-primary break-all underline"
      >
        {p}
      </a>
    ) : (
      p
    ),
  );
}

export type { View as ChatView };

/** Reactions under a message: one pill per emoji with its count; mine is marked and takes it back. */
function Reactions({
  list,
  me,
  onPick,
}: {
  list: { e: string; u: string }[];
  me: string;
  onPick: (e: string) => void;
}) {
  const by = new Map<string, { n: number; mine: boolean }>();
  for (const r of list) {
    const x = by.get(r.e) ?? { n: 0, mine: false };
    by.set(r.e, { n: x.n + 1, mine: x.mine || r.u === me });
  }
  return (
    <div className="-mt-1.5 flex flex-wrap gap-1 px-1">
      {[...by].map(([e, x]) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          aria-pressed={x.mine}
          className={cn(
            "animate-scale-in inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-sm shadow-sm transition-colors",
            x.mine
              ? "border-primary/50 bg-primary-soft text-primary"
              : "border-border bg-surface text-foreground",
          )}
        >
          <span className="leading-none">{e}</span>
          {x.n > 1 && <span className="text-xs font-semibold tabular-nums">{x.n}</span>}
        </button>
      ))}
    </div>
  );
}
