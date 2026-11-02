"use client";
import { Loader2, MessageCircle, SendHorizontal, ThumbsUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  addCommentAction,
  deleteCommentAction,
  postCommentsAction,
  setLikeAction,
} from "@/app/actions/social";
import { EmojiGif } from "@/components/chat/emoji-gif";
import { listTime } from "@/components/chat/parts";
import { SendTo } from "@/components/chat/send-to";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import type { PostComment } from "@/server/social";

/**
 * Under a public post: 👍 "Zo'r" (with a little burst), comments (text, emoji,
 * GIFs) and "Send" — to a chat, another app, or a copied link.
 */
export function PostActions({
  recordId,
  likes,
  liked,
  comments,
  share,
  openComments = false,
  children,
}: {
  recordId: string;
  likes: number;
  liked: boolean;
  comments: number;
  share: { resourceId: string; path: string; title: string };
  /** The post page shows them at once. */
  openComments?: boolean;
  /** More buttons on the right (e.g. "take it"). */
  children?: React.ReactNode;
}) {
  const t = useTranslations("media");
  const te = useTranslations("errors");
  const [on, setOn] = useState(liked);
  const [n, setN] = useState(likes);
  const [burst, setBurst] = useState(0);
  const [count, setCount] = useState(comments);
  const [open, setOpen] = useState(openComments);
  const seq = useRef(0);

  const like = async () => {
    const next = !on;
    setOn(next);
    setN((x) => x + (next ? 1 : -1));
    if (next) setBurst((b) => b + 1);
    const k = ++seq.current;
    const r = await setLikeAction(recordId, next).catch(() => null);
    if (k !== seq.current) return;
    if (!r?.ok) {
      setOn(!next);
      setN((x) => x + (next ? -1 : 1));
      errorToast(te, r && !r.ok ? r : "INTERNAL");
    } else setN(r.data);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void like()}
          aria-pressed={on}
          aria-label={t("like")}
          title={t("like")}
          className={cn(
            "relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors",
            on
              ? "bg-primary-soft text-primary"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <span
            key={burst}
            className={cn("relative grid place-items-center", burst && on && "like-pop")}
          >
            <ThumbsUp className={cn("size-[18px]", on && "fill-current")} />
            {burst > 0 && on && <span aria-hidden className="like-burst" />}
          </span>
          <span className="tabular-nums">{n > 0 ? n : t("like")}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={t("comments")}
          className="text-muted hover:bg-surface-2 hover:text-foreground inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors"
        >
          <MessageCircle className="size-[18px]" />
          <span className="tabular-nums">{count > 0 ? count : t("comment")}</span>
        </button>
        <SendTo
          resourceId={share.resourceId}
          share={share}
          compact
          className="size-9 rounded-full"
        />
        <span className="ml-auto flex items-center gap-1">{children}</span>
      </div>
      {open && <Comments recordId={recordId} onCount={setCount} />}
    </div>
  );
}

function Comments({ recordId, onCount }: { recordId: string; onCount: (n: number) => void }) {
  const t = useTranslations("media");
  const tc = useTranslations("chat");
  const te = useTranslations("errors");
  const locale = useLocale();
  const [list, setList] = useState<PostComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let stop = false;
    void postCommentsAction(recordId).then((r) => {
      if (!stop && r.ok) setList(r.data);
    });
    return () => {
      stop = true;
    };
  }, [recordId]);
  const send = async (v: {
    body?: string;
    gif?: { id: string; url: string; w: number; h: number };
  }) => {
    setBusy(true);
    const r = await addCommentAction(recordId, v).catch(() => null);
    setBusy(false);
    if (!r?.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    setList(r.data);
    onCount(r.data.length);
    setText("");
  };
  const remove = async (id: string) => {
    const r = await deleteCommentAction(id).catch(() => null);
    if (!r?.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    setList((l) => {
      const next = (l ?? []).filter((c) => c.id !== id);
      onCount(next.length);
      return next;
    });
  };
  return (
    <div className="border-border animate-fade-in flex flex-col gap-3 border-t pt-3">
      {list === null ? (
        <Loader2 className="text-muted mx-auto size-4 animate-spin" />
      ) : list.length === 0 ? (
        <p className="text-muted text-center text-xs">{t("noComments")}</p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {list.map((c) => (
            <li key={c.id} className="group flex gap-2.5">
              <Link href={`/u/${c.author.username}`} className="shrink-0">
                <Avatar name={c.author.name} image={c.author.image} className="size-8" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="bg-surface-2 inline-block max-w-full rounded-2xl rounded-tl-md px-3 py-2">
                  <Link href={`/u/${c.author.username}`} className="block text-xs font-semibold">
                    {c.author.name}
                  </Link>
                  {c.body && <p className="text-sm break-words whitespace-pre-wrap">{c.body}</p>}
                  {c.gif && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.gif.url}
                      alt="GIF"
                      loading="lazy"
                      width={c.gif.w}
                      height={c.gif.h}
                      className="mt-1 h-auto max-h-40 w-auto rounded-lg"
                    />
                  )}
                </div>
                <div className="text-muted mt-0.5 flex items-center gap-2 px-2 text-[11px]">
                  {listTime(c.createdAt, locale, tc("yesterday"))}
                  {c.canDelete && (
                    <button
                      type="button"
                      onClick={() => void remove(c.id)}
                      aria-label={tc("delete")}
                      className="hover:text-danger opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send({ body: text.trim() });
        }}
        className="bg-surface-2 focus-within:ring-primary/40 flex items-center rounded-full pl-4 focus-within:ring-2"
      >
        <input
          ref={input}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("writeComment")}
          aria-label={t("writeComment")}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <EmojiGif
          onEmoji={(e) => {
            setText((x) => x + e);
            input.current?.focus();
          }}
          onGif={(g) => void send({ gif: { id: g.id, url: g.url, w: g.w, h: g.h } })}
          className="size-10"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label={tc("send")}
          className="text-primary grid size-10 place-items-center rounded-full disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizontal className="size-4" />
          )}
        </button>
      </form>
    </div>
  );
}
