"use client";
import { MessageCircle, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { setLikeAction } from "@/app/actions/social";
import { SendTo } from "@/components/chat/send-to";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import { Avatar } from "@/components/ui/avatar";
import type { LikedBy } from "@/server/social";
import { Comments } from "./comments";
import { LikersDialog } from "./likers-dialog";

/**
 * Under a public post: 👍 "Zo'r" (with a little burst), comments (text, emoji,
 * GIFs) and "Send" — to a chat, another app, or a copied link.
 */
export function PostActions({
  recordId,
  likes,
  liked,
  comments,
  shares = 0,
  likedBy = [],
  share,
  openComments = false,
  children,
}: {
  recordId: string;
  likes: number;
  liked: boolean;
  comments: number;
  /** How many times others sent it on. */
  shares?: number;
  /** Up to three likers besides me, the people I follow first ("Liked by … and others"). */
  likedBy?: LikedBy[];
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
  const [sent, setSent] = useState(shares);
  const [showLikers, setShowLikers] = useState(false);
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
            n > 0 && "pr-2",
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
        </button>
        {n > 0 && (
          // The number opens who said "great" (Instagram's likes list).
          <button
            type="button"
            onClick={() => setShowLikers(true)}
            title={t("likers")}
            className="text-muted hover:text-foreground -ml-2 h-9 rounded-full pr-2 pl-1 text-sm font-semibold tabular-nums hover:underline"
          >
            {n}
          </button>
        )}
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
        <span className="text-muted inline-flex items-center">
          <SendTo
            resourceId={share.resourceId}
            share={share}
            recordId={recordId}
            onShared={(k) => setSent((x) => x + k)}
            compact
            className="size-9 rounded-full"
          />
          {sent > 0 && (
            <span className="-ml-1 pr-2 text-sm font-semibold tabular-nums" title={t("shares")}>
              {sent}
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1">{children}</span>
      </div>
      {n > 0 && (likedBy.length > 0 || on) && (
        <LikedLine people={likedBy} total={n} onOpen={() => setShowLikers(true)} />
      )}
      {open && <Comments recordId={recordId} onCount={setCount} />}
      {showLikers && (
        <LikersDialog
          kind="post"
          id={recordId}
          open
          onOpenChange={(o) => !o && setShowLikers(false)}
        />
      )}
    </div>
  );
}

/**
 * "Liked by aziza_k and 12 others" with their small faces, the people I
 * follow first; the whole line opens the full list.
 */
function LikedLine({
  people,
  total,
  onOpen,
}: {
  people: LikedBy[];
  total: number;
  onOpen: () => void;
}) {
  const t = useTranslations("media");
  const first = people[0];
  // Everyone else, me included when I liked it.
  const others = Math.max(0, total - (first ? 1 : 0));
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-muted hover:text-foreground flex min-w-0 items-center gap-2 self-start px-1 text-left text-[13px]"
    >
      {people.length > 0 && (
        <span className="flex shrink-0 -space-x-1.5">
          {people.map((p) => (
            <Avatar
              key={p.username}
              name={p.name}
              image={p.image}
              className="ring-surface size-5 text-[9px] ring-2"
            />
          ))}
        </span>
      )}
      <span className="min-w-0 truncate">
        {first
          ? t.rich("likedBy", {
              name: first.username,
              others,
              b: (c) => <b className="text-foreground font-semibold">{c}</b>,
            })
          : t("likedByYou")}
      </span>
    </button>
  );
}
