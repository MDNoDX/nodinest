"use client";
import { BookPlus, Check, Loader2, Play, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { takeSourceAction } from "@/app/actions/social";
import { AskFirst } from "@/components/ui/ask-first";
import { moreMediaAction } from "@/app/actions/media";
import { Cover, coverSrc } from "@/components/library/cover";
import { listTime } from "@/components/chat/parts";
import { PostActions } from "./post-actions";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import { youtubeIdFromUrl } from "@/lib/youtube";
import type { MediaItem } from "@/server/social";

const KINDS = ["all", "book", "video", "podcast", "course", "article"];
const SCOPES = ["all", "following"] as const;

const hrefOf = (scope: string, kind: string) => {
  const q = new URLSearchParams();
  if (scope !== "all") q.set("scope", scope);
  if (kind !== "all") q.set("kind", kind);
  const s = q.toString();
  return s ? `/media?${s}` : "/media";
};

/**
 * What people add, as small cards; a YouTube video opens in place. Two parts:
 * everyone's public posts, and only the people I follow; the kind filters both.
 */
export function MediaFeed({
  items,
  scope,
  kind,
}: {
  items: MediaItem[];
  scope: string;
  kind: string;
}) {
  const t = useTranslations("media");
  const tt = useTranslations("types");
  const [list, setList] = useState(items);
  const [end, setEnd] = useState(items.length < 30);
  const loading = useRef(false);
  const tail = useRef<HTMLLIElement>(null);
  const more = useCallback(async () => {
    if (loading.current || end || !list.length) return;
    loading.current = true;
    const r = await moreMediaAction(
      scope,
      kind,
      new Date(list[list.length - 1].updatedAt).toISOString(),
    ).catch(() => null);
    loading.current = false;
    if (!r?.ok) return setEnd(true);
    setList((l) => [...l, ...r.data]);
    if (r.data.length < 30) setEnd(true);
  }, [end, scope, kind, list]);
  useEffect(() => {
    const el = tail.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void more(), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [more]);
  return (
    <div className="w-full">
      <nav className="bg-surface-2 mb-3 grid grid-cols-2 gap-1 rounded-xl p-1">
        {SCOPES.map((s) => (
          <Link
            key={s}
            href={hrefOf(s, kind)}
            aria-current={scope === s ? "page" : undefined}
            className={cn(
              "rounded-lg py-2 text-center text-sm font-semibold transition-colors",
              scope === s
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {t(s === "all" ? "everyone" : "following")}
          </Link>
        ))}
      </nav>
      <nav className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={hrefOf(scope, k)}
            aria-current={kind === k ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              kind === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted",
            )}
          >
            {k === "all" ? t("all") : tt(`plural.${k}` as "plural.book")}
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <EmptyState
          title={t("empty")}
          body={t(scope === "following" ? "emptyFollowing" : "emptyBody")}
        />
      ) : scope === "following" ? (
        // The people I follow: one big post after another, like a feed.
        <ul className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {list.map((it) => (
            <FeedPost key={`${it.resourceId}-${it.ownerId}`} it={it} />
          ))}
          {!end && (
            <li ref={tail} className="grid h-16 place-items-center">
              <Loader2 className="text-muted size-5 animate-spin" />
            </li>
          )}
        </ul>
      ) : (
        // Everyone: small tiles; a tap opens the post with its comments.
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {list.map((it) => (
            <Tile key={`${it.resourceId}-${it.ownerId}`} it={it} />
          ))}
          {!end && (
            <li ref={tail} className="col-span-full grid h-16 place-items-center">
              <Loader2 className="text-muted size-5 animate-spin" />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// My own post opens my library page (the public page sends me there).
const postPath = (it: MediaItem) => `/u/${it.username}/item/${it.resourceId}`;

function Tile({ it }: { it: MediaItem }) {
  const tt = useTranslations("types");
  const yt = it.sourceUrl ? youtubeIdFromUrl(it.sourceUrl) : null;
  const src = coverSrc(it, 320) ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null);
  // Every tile has the same box; the cover keeps its own shape inside it (a
  // book stands, a video lies, a record sits in its sleeve) and moves as it does
  // in Darsxona, so tiles never push each other around.
  const shape =
    it.type === "book" || it.type === "course"
      ? "h-full aspect-[2/3]"
      : it.type === "article" || it.type === "file"
        ? "h-full aspect-[3/4]"
        : "w-full";
  return (
    <li className="min-w-0">
      <Link
        href={postPath(it)}
        className="group bg-surface border-border hover:border-border-strong relative flex h-full flex-col rounded-xl border p-2.5 transition-colors sm:p-3"
      >
        <span className="relative grid aspect-square place-items-center">
          <span className={cn("block max-h-full max-w-full", shape)}>
            <Cover type={it.type as "book"} title={it.title} src={src} className="size-full" />
          </span>
        </span>
        <span className="mt-2 line-clamp-2 text-[13px] leading-snug font-semibold sm:text-sm">
          {it.title}
        </span>
        <span className="text-muted mt-auto flex items-center gap-1.5 pt-1.5 text-[11px] sm:text-xs">
          <Avatar name={it.name} image={it.image} className="size-4" />
          <span className="min-w-0 truncate">{it.name}</span>
          {it.likes > 0 && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 tabular-nums">
              <ThumbsUp className="size-3" /> {it.likes}
            </span>
          )}
        </span>
        <span className="bg-surface/85 text-muted absolute top-2 right-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur">
          {tt(it.type as "book")}
        </span>
      </Link>
    </li>
  );
}

/** One post of someone I follow: who, when, the thing itself big, then 👍 / comments / send. */
function FeedPost({ it }: { it: MediaItem }) {
  const t = useTranslations("media");
  const tt = useTranslations("types");
  const locale = useLocale();
  const tc = useTranslations("chat");
  const [playing, setPlaying] = useState(false);
  const [taken, setTaken] = useState(it.mine);
  const { pending, exec } = useAction();
  const yt = it.sourceUrl ? youtubeIdFromUrl(it.sourceUrl) : null;
  const href = postPath(it);
  return (
    <li className="card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <Link href={`/u/${it.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar name={it.name} image={it.image} className="size-9" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{it.name}</span>
            <span className="text-muted block truncate text-xs">
              {tt(it.type as "book")} ·{" "}
              {listTime(new Date(it.updatedAt).toISOString(), locale, tc("yesterday"))}
            </span>
          </span>
        </Link>
      </div>
      <div className="bg-surface-2 relative">
        {playing && yt ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&playsinline=1`}
            title={it.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="aspect-video w-full"
          />
        ) : (
          <div className="relative">
            <Link href={href} className="mx-auto block max-w-md p-4">
              <Cover
                type={it.type as "book"}
                title={it.title}
                src={coverSrc(it) ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null)}
                className={
                  it.type === "book" || it.type === "course" ? "mx-auto max-w-[12rem]" : ""
                }
              />
            </Link>
            {yt && (
              <button
                type="button"
                aria-label={t("play")}
                onClick={() => setPlaying(true)}
                className="absolute inset-0 m-auto grid size-14 place-items-center rounded-full bg-black/65 text-white transition-transform hover:scale-110"
              >
                <Play className="size-6 translate-x-0.5 fill-current" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <Link href={href} className="text-[15px] leading-snug font-semibold">
          {it.title}
        </Link>
        {it.description && <p className="text-muted line-clamp-3 text-sm">{it.description}</p>}
        <PostActions
          recordId={it.recordId}
          likes={it.likes}
          liked={it.liked}
          comments={it.comments}
          shares={it.shares}
          share={{
            resourceId: it.resourceId,
            path: `/u/${it.username}/item/${it.resourceId}`,
            title: it.title,
          }}
        >
          {!it.mine && (
            <AskFirst
              title={t("takeTitle")}
              message={t("takeBody")}
              confirmLabel={t("take")}
              onConfirm={() =>
                exec(() => takeSourceAction(it.resourceId, it.ownerId), {
                  onSuccess: () => setTaken(true),
                  success: t("taken"),
                })
              }
            >
              <button
                type="button"
                disabled={taken || pending}
                title={taken ? t("inLibrary") : t("take")}
                className={cn(
                  "inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors",
                  taken
                    ? "text-muted"
                    : "bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground",
                )}
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : taken ? (
                  <Check className="size-3.5" />
                ) : (
                  <BookPlus className="size-3.5" />
                )}
                <span className="max-sm:hidden">{taken ? t("inLibrary") : t("take")}</span>
              </button>
            </AskFirst>
          )}
        </PostActions>
      </div>
    </li>
  );
}
