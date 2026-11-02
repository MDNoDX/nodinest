"use client";
import {
  ArrowDown,
  ArrowLeft,
  Ban,
  Copy,
  CornerUpLeft,
  EllipsisVertical,
  Loader2,
  Mic,
  Paperclip,
  RotateCw,
  SendHorizontal,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DropdownMenu as M } from "radix-ui";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteMessageAction, sendMessageAction, setBlockedAction } from "@/app/actions/dm";
import { fmtSeconds, useRecorder } from "@/components/media/use-recorder";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import { uploadMedia } from "@/lib/upload-media";
import type { DmMessage, DmPerson } from "@/server/dm";
import { refreshUnreadChats } from "./chats-button";
import { Attachment, KindLabel, ReadMark, clock, dayLabel } from "./parts";

type View = {
  id: string;
  other: DmPerson;
  canWrite: boolean;
  blockedByMe: boolean;
  otherReadAt: string | null;
  messages: DmMessage[];
  more: boolean;
};
type Pending = {
  key: string;
  body?: string;
  file?: File;
  preview?: string;
  progress?: number;
  failed?: boolean;
  replyToId?: string;
};

const NEAR = 140;
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
  const [pending, setPending] = useState<Pending[]>([]);
  const [reply, setReply] = useState<DmMessage | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState("");
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
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useRecorder(10 * 60);
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
        const r = await fetch(`/api/dm/${initial.id}?after=${encodeURIComponent(after)}`, {
          cache: "no-store",
        }).catch(() => null);
        if (r?.status === 404) return;
        const j = r?.ok
          ? ((await r.json()) as {
              messages: DmMessage[];
              otherReadAt: string | null;
              gone: string[];
            })
          : null;
        if (!stop && j) {
          setReadAt(j.otherReadAt);
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

  /** Sends one message (text, or a file with the text as its caption). */
  const deliver = async (p: Pending) => {
    setPending((x) => x.map((y) => (y.key === p.key ? { ...y, failed: false, progress: 0 } : y)));
    try {
      let fileId: string | undefined;
      if (p.file) {
        const up = await uploadMedia(p.file, {
          userId: me,
          name: p.file.name,
          onProgress: (n) =>
            setPending((x) => x.map((y) => (y.key === p.key ? { ...y, progress: n } : y))),
        });
        fileId = up.fileId;
      }
      const r = await sendMessageAction(initial.id, {
        body: p.body || undefined,
        fileId,
        replyToId: p.replyToId,
      });
      if (!r.ok) {
        if (r.code === "FORBIDDEN") setCanWrite(false);
        errorToast(te, r.code === "FORBIDDEN" ? "dm_blocked" : r);
        throw new Error(r.code);
      }
      setPending((x) => x.filter((y) => y.key !== p.key));
      if (p.preview) URL.revokeObjectURL(p.preview);
      merge([r.data]);
      toEnd(true);
    } catch (e) {
      if (!(e instanceof Error && /^[A-Z_]+$/.test(e.message))) toast.error(t("failed"));
      setPending((x) => x.map((y) => (y.key === p.key ? { ...y, failed: true } : y)));
    }
  };

  const queue = (items: Omit<Pending, "key">[]) => {
    const made = items.map((it, i) => ({ ...it, key: `${Date.now()}-${i}-${Math.random()}` }));
    setPending((x) => [...x, ...made]);
    requestAnimationFrame(() => toEnd(true));
    // One after another, so they arrive in order.
    void made.reduce((p, it) => p.then(() => deliver(it)), Promise.resolve());
  };

  const sendText = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    queue([{ body, replyToId: reply?.id }]);
    setReply(null);
    input.current?.focus();
  };

  const sendFiles = (picked: FileList | null) => {
    if (!picked?.length) return;
    const caption = text.trim();
    setText("");
    const files = [...picked].slice(0, 10);
    queue(
      files.map((file, i) => ({
        file,
        body: i === 0 ? caption : undefined,
        replyToId: i === 0 ? reply?.id : undefined,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      })),
    );
    setReply(null);
  };

  const finishVoice = async () => {
    const r = await rec.stop();
    if (!r) return;
    queue([
      {
        file: new File([r.blob], r.name, { type: r.mime }),
        replyToId: reply?.id,
      },
    ]);
    setReply(null);
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
            <span className="text-muted block truncate text-xs">@{other.username}</span>
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
              const media = m.file && /^(image|video)\//.test(m.file.mime) && !m.body;
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
                    className={cn(
                      "group flex flex-col",
                      mine ? "items-end" : "items-start",
                      !sameRun && "mt-2",
                    )}
                  >
                    <div className="flex max-w-[85%] items-end gap-1 sm:max-w-[75%]">
                      {!touch && !m.deleted && canWrite && (
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
                              input.current?.focus();
                            }}
                          >
                            <CornerUpLeft className="size-4" />
                          </IconBtn>
                        </span>
                      )}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setPicked((p) => (p === m.id ? null : m.id))}
                        onKeyDown={(e) => e.key === "Enter" && setPicked(m.id)}
                        className={cn(
                          "min-w-0 cursor-default rounded-2xl text-[15px] leading-relaxed break-words whitespace-pre-wrap shadow-sm outline-none",
                          media ? "p-1" : "px-3 py-2",
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
                            "text-muted float-right mt-1 ml-3 inline-flex translate-y-1 items-center gap-1 text-[11px] tabular-nums select-none",
                            media && "mr-2 mb-1",
                          )}
                        >
                          {clock(m.createdAt, locale)}
                          {mine && !m.deleted && (
                            <ReadMark read={!!readAt && readAt >= m.createdAt} />
                          )}
                        </span>
                      </div>
                    </div>
                    {picked === m.id && !m.deleted && (
                      <div className="animate-fade-in mt-1 flex gap-1">
                        {canWrite && (
                          <Chip
                            onClick={() => {
                              setReply(m);
                              setPicked(null);
                              input.current?.focus();
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
              <div key={p.key} className="mt-2 flex flex-col items-end">
                <div className="bg-primary-soft max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[15px] whitespace-pre-wrap opacity-80 sm:max-w-[75%]">
                  {p.preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview} alt="" className="mb-1 max-h-60 rounded-xl" />
                  )}
                  {p.file && !p.preview && (
                    <span className="text-muted block text-sm">
                      {p.file.type.startsWith("audio/") ? t("kind.voice") : p.file.name}
                    </span>
                  )}
                  {p.body}
                  <span className="text-muted mt-1 flex items-center justify-end gap-1 text-[11px]">
                    {p.failed ? (
                      <button
                        type="button"
                        onClick={() => void deliver(p)}
                        className="text-danger inline-flex items-center gap-1 font-semibold"
                      >
                        <RotateCw className="size-3.5" /> {t("retry")}
                      </button>
                    ) : (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        {p.file && p.progress != null && `${p.progress}%`}
                      </>
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
        {!canWrite ? (
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
          <div className="mx-auto max-w-3xl">
            {reply && (
              <div className="mb-2 flex items-center gap-2 px-1">
                <CornerUpLeft className="text-primary size-4 shrink-0" />
                <div className="border-primary min-w-0 flex-1 border-l-2 pl-2 text-xs">
                  <span className="text-primary block font-semibold">
                    {reply.senderId === me ? t("you") : other.name}
                  </span>
                  <span className="text-muted line-clamp-1">
                    <KindLabel kind={kindOf(reply)} text={reply.body} />
                  </span>
                </div>
                <IconBtn label={t("cancel")} onClick={() => setReply(null)}>
                  <X className="size-4" />
                </IconBtn>
              </div>
            )}
            {rec.state === "recording" ? (
              <div className="flex items-center gap-2">
                <IconBtn label={t("cancel")} onClick={() => rec.cancel()}>
                  <Trash2 className="text-danger size-5" />
                </IconBtn>
                <div className="bg-surface-2 flex h-11 flex-1 items-center gap-3 rounded-2xl px-4">
                  <span className="size-2.5 animate-pulse rounded-full bg-[var(--c-rose)]" />
                  <span className="text-sm font-medium tabular-nums">
                    {fmtSeconds(rec.seconds)}
                  </span>
                  <span className="bg-border h-1.5 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-primary block h-full rounded-full transition-[width] duration-75"
                      style={{ width: `${Math.round(rec.level * 100)}%` }}
                    />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void finishVoice()}
                  aria-label={t("send")}
                  className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95"
                >
                  <SendHorizontal className="size-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  accept="image/*,video/*,audio/*,application/pdf"
                  onChange={(e) => {
                    sendFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <IconBtn label={t("attach")} onClick={() => fileInput.current?.click()} big>
                  <Paperclip className="size-5" />
                </IconBtn>
                <textarea
                  ref={input}
                  value={text}
                  rows={1}
                  maxLength={4000}
                  placeholder={t("typeMessage")}
                  aria-label={t("typeMessage")}
                  onChange={(e) => {
                    setText(e.target.value);
                    const el = e.target;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendText();
                    }
                    if (e.key === "Escape") setReply(null);
                  }}
                  onPaste={(e) => {
                    if (e.clipboardData.files.length) {
                      e.preventDefault();
                      sendFiles(e.clipboardData.files);
                    }
                  }}
                  className="bg-surface-2 focus:ring-primary/40 max-h-40 min-h-11 flex-1 resize-none rounded-2xl px-4 py-2.5 text-[15px] leading-6 outline-none focus:ring-2"
                />
                {text.trim() ? (
                  <button
                    type="button"
                    onClick={sendText}
                    aria-label={t("send")}
                    className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95"
                  >
                    <SendHorizontal className="size-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void rec.start()}
                    aria-label={t("record")}
                    title={t("record")}
                    className="bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full transition-colors"
                  >
                    <Mic className="size-5" />
                  </button>
                )}
              </div>
            )}
            {(rec.state === "denied" || rec.state === "nomic" || rec.state === "error") && (
              <p className="text-danger mt-1 px-1 text-xs">{t(`mic.${rec.state}`)}</p>
            )}
          </div>
        )}
      </footer>
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
