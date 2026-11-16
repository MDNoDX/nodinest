"use client";
import { Heart, Loader2, SendHorizontal, ThumbsUp, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  addCommentAction,
  deleteCommentAction,
  postCommentsAction,
  setCommentLikeAction,
} from "@/app/actions/social";
import { EmojiGif } from "@/components/chat/emoji-gif";
import { listTime } from "@/components/chat/parts";
import { ask } from "@/components/ui/ask";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import type { PostComment } from "@/server/social";
import { LikersDialog } from "./likers-dialog";

type Gif = { id: string; url: string; w: number; h: number };

/**
 * Comments under a public post, like Instagram's: a 👍 on every comment (a
 * double tap too) whose number opens who liked it, replies one level deep
 * (a reply to a reply names its writer), threads folded under "View replies",
 * the post owner's like shown on the comment. `?c=<id>` in the address opens
 * and lights up that comment (notifications and My activity link there).
 */
export function Comments({
  recordId,
  onCount,
}: {
  recordId: string;
  onCount: (n: number) => void;
}) {
  const t = useTranslations("media");
  const tc = useTranslations("chat");
  const te = useTranslations("errors");
  const [list, setList] = useState<PostComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());
  const [lit, setLit] = useState<string | null>(null);
  const [likersOf, setLikersOf] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLUListElement>(null);
  const seq = useRef(new Map<string, number>());

  /** Opens the thread of a comment and brings it into view, lit for a moment. */
  const reveal = (all: PostComment[], id: string) => {
    const c = all.find((x) => x.id === id);
    if (!c) return;
    if (c.parentId) setOpenThreads((s) => new Set(s).add(c.parentId!));
    setLit(id);
    setTimeout(() => {
      const el = box.current?.querySelector<HTMLElement>(`[data-comment="${id}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 60);
    setTimeout(() => setLit((x) => (x === id ? null : x)), 2600);
  };

  useEffect(() => {
    let stop = false;
    void postCommentsAction(recordId).then((r) => {
      if (stop || !r.ok) return;
      setList(r.data);
      const want = new URLSearchParams(window.location.search).get("c");
      if (want) reveal(r.data, want);
    });
    return () => {
      stop = true;
    };
  }, [recordId]);

  const send = async (v: { body?: string; gif?: Gif }) => {
    setBusy(true);
    const r = await addCommentAction(recordId, v, replyTo?.id ?? null).catch(() => null);
    setBusy(false);
    if (!r?.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    setList(r.data.list);
    onCount(r.data.list.length);
    setText("");
    setReplyTo(null);
    reveal(r.data.list, r.data.id);
  };

  const remove = async (c: PostComment) => {
    const hasReplies = !c.parentId && (list ?? []).some((x) => x.parentId === c.id);
    if (
      !(await ask({
        message: hasReplies ? t("deleteThreadAsk") : t("deleteCommentAsk"),
        remove: true,
      }))
    )
      return;
    const r = await deleteCommentAction(c.id).catch(() => null);
    if (!r?.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    setList((l) => {
      const next = (l ?? []).filter((x) => x.id !== c.id && x.parentId !== c.id);
      onCount(next.length);
      return next;
    });
  };

  const like = async (c: PostComment) => {
    const next = !c.liked;
    const patch = (liked: boolean, likes: number) =>
      setList((l) => (l ?? []).map((x) => (x.id === c.id ? { ...x, liked, likes } : x)));
    patch(next, c.likes + (next ? 1 : -1));
    const k = (seq.current.get(c.id) ?? 0) + 1;
    seq.current.set(c.id, k);
    const r = await setCommentLikeAction(c.id, next).catch(() => null);
    if (seq.current.get(c.id) !== k) return;
    if (!r?.ok) {
      patch(c.liked, c.likes);
      errorToast(te, r && !r.ok ? r : "INTERNAL");
    } else patch(next, r.data);
  };

  const answer = (c: PostComment) => {
    setReplyTo(c);
    setOpenThreads((s) => new Set(s).add(c.parentId ?? c.id));
    input.current?.focus();
  };

  const tops = (list ?? []).filter((c) => !c.parentId);
  const repliesOf = (id: string) => (list ?? []).filter((c) => c.parentId === id);
  const row = (c: PostComment) => (
    <CommentRow
      key={c.id}
      c={c}
      lit={lit === c.id}
      onLike={() => void like(c)}
      onReply={() => answer(c)}
      onDelete={() => void remove(c)}
      onLikers={() => setLikersOf(c.id)}
    />
  );

  return (
    <div className="border-border animate-fade-in flex flex-col gap-3 border-t pt-3">
      {list === null ? (
        <Loader2 className="text-muted mx-auto size-4 animate-spin" />
      ) : tops.length === 0 ? (
        <p className="text-muted text-center text-xs">{t("noComments")}</p>
      ) : (
        <ul
          ref={box}
          className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto overscroll-contain"
        >
          {tops.map((c) => {
            const replies = repliesOf(c.id);
            const open = openThreads.has(c.id);
            return (
              <li key={c.id} className="flex flex-col gap-2">
                {row(c)}
                {replies.length > 0 && (
                  <div className="ml-10 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenThreads((s) => {
                          const n = new Set(s);
                          if (open) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      className="text-muted hover:text-foreground flex items-center gap-2 self-start text-xs font-semibold"
                    >
                      <span className="bg-border h-px w-6" />
                      {open ? t("hideReplies") : t("viewReplies", { count: replies.length })}
                    </button>
                    {open && (
                      <ul className="flex flex-col gap-2">
                        {replies.map((r) => (
                          <li key={r.id}>{row(r)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-1">
        {replyTo && (
          <div className="text-muted animate-fade-in flex items-center gap-2 px-3 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {t("replyingTo", { name: replyTo.author.username || replyTo.author.name })}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label={tc("cancel")}
              className="hover:text-foreground rounded p-0.5"
            >
              <X className="size-3.5" />
            </button>
          </div>
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
            onKeyDown={(e) => {
              if (e.key === "Escape" && replyTo) setReplyTo(null);
            }}
            placeholder={replyTo ? t("writeReply") : t("writeComment")}
            aria-label={replyTo ? t("writeReply") : t("writeComment")}
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
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
      {likersOf && (
        <LikersDialog
          kind="comment"
          id={likersOf}
          open
          onOpenChange={(o) => !o && setLikersOf(null)}
        />
      )}
    </div>
  );
}

function CommentRow({
  c,
  lit,
  onLike,
  onReply,
  onDelete,
  onLikers,
}: {
  c: PostComment;
  lit: boolean;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
  onLikers: () => void;
}) {
  const t = useTranslations("media");
  const tc = useTranslations("chat");
  const locale = useLocale();
  const [pop, setPop] = useState(0);
  const small = !!c.parentId;
  const doLike = () => {
    if (!c.liked) setPop((p) => p + 1);
    onLike();
  };
  return (
    <div
      data-comment={c.id}
      className={cn(
        "group flex gap-2.5 rounded-2xl transition-colors duration-700",
        lit && "bg-primary-soft/70",
      )}
    >
      <Link href={`/u/${c.author.username}`} className="shrink-0">
        <Avatar
          name={c.author.name}
          image={c.author.image}
          className={small ? "size-6" : "size-8"}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div
          onDoubleClick={() => !c.liked && doLike()}
          className="bg-surface-2 inline-block max-w-full rounded-2xl rounded-tl-md px-3 py-2 select-text"
        >
          <Link href={`/u/${c.author.username}`} className="block text-xs font-semibold">
            {c.author.name}
          </Link>
          {(c.body || c.replyTo) && (
            <p className="text-sm break-words whitespace-pre-wrap">
              {c.replyTo && (
                <Link href={`/u/${c.replyTo.username}`} className="text-primary mr-1 font-medium">
                  @{c.replyTo.username}
                </Link>
              )}
              {c.body}
            </p>
          )}
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
        <div className="text-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 text-[11px]">
          <span>{listTime(c.createdAt, locale, tc("yesterday"))}</span>
          {c.likes > 0 && (
            <button
              type="button"
              onClick={onLikers}
              className="hover:text-foreground font-semibold"
            >
              {t("likesCount", { count: c.likes })}
            </button>
          )}
          <button type="button" onClick={onReply} className="hover:text-foreground font-semibold">
            {t("reply")}
          </button>
          {c.ownerLiked && (
            <span className="inline-flex items-center gap-1" title={t("ownerLiked")}>
              <Heart className="size-3 fill-rose-500 text-rose-500" /> {t("ownerLiked")}
            </span>
          )}
          {c.canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={tc("delete")}
              title={tc("delete")}
              className="hover:text-danger opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 max-lg:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={doLike}
        aria-pressed={c.liked}
        aria-label={t("likeComment")}
        title={t("likeComment")}
        className={cn(
          "mt-2 grid size-7 shrink-0 place-items-center self-start rounded-full transition-colors",
          c.liked ? "text-primary" : "text-muted hover:text-foreground",
        )}
      >
        <span key={pop} className={cn("grid place-items-center", pop > 0 && c.liked && "like-pop")}>
          <ThumbsUp className={cn("size-3.5", c.liked && "fill-current")} />
        </span>
      </button>
    </div>
  );
}
