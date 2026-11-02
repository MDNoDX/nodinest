"use client";
import { BookPlus, Check, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { takeSourceAction } from "@/app/actions/social";
import { moreMediaAction } from "@/app/actions/media";
import { Cover, coverSrc } from "@/components/library/cover";
import { SendTo } from "@/components/chat/send-to";
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
    const r = await moreMediaAction(scope, kind, String(list[list.length - 1].updatedAt)).catch(
      () => null,
    );
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
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((it) => (
            <Card key={`${it.resourceId}-${it.ownerId}`} it={it} />
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

function Card({ it }: { it: MediaItem }) {
  const t = useTranslations("media");
  const tt = useTranslations("types");
  const [playing, setPlaying] = useState(false);
  const [taken, setTaken] = useState(it.mine);
  const { pending, exec } = useAction();
  const yt = it.sourceUrl ? youtubeIdFromUrl(it.sourceUrl) : null;
  const portrait = it.type === "book" || it.type === "course";
  const href = it.mine ? `/library/${it.resourceId}` : `/u/${it.username}/item/${it.resourceId}`;
  return (
    <li className={cn("card flex flex-col gap-3 p-3", playing && "col-span-full")}>
      {playing && yt && (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&playsinline=1`}
          title={it.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          className="mx-auto aspect-video w-full max-w-3xl rounded-lg"
        />
      )}
      <div className="flex min-w-0 flex-1 gap-3">
        <div className={cn("relative shrink-0 self-start", portrait ? "w-16" : "w-28")}>
          <Link href={href} className="block">
            <Cover type={it.type as "book"} title={it.title} src={coverSrc(it)} />
          </Link>
          {yt && !playing && (
            <button
              type="button"
              aria-label={t("play")}
              onClick={() => setPlaying(true)}
              className="absolute inset-0 m-auto grid size-9 place-items-center rounded-full bg-black/65 text-white transition-transform hover:scale-110"
            >
              <Play className="size-4 translate-x-px fill-current" />
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={`/u/${it.username}`}
            className="text-muted hover:text-foreground flex min-w-0 items-center gap-1.5 text-xs"
          >
            <Avatar name={it.name} image={it.image} className="size-5" />
            <span className="truncate font-medium">{it.name}</span>
          </Link>
          <Link href={href} className="line-clamp-2 text-sm leading-snug font-semibold">
            {it.title}
          </Link>
          {it.description && <p className="text-muted line-clamp-1 text-xs">{it.description}</p>}
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <span className="text-muted min-w-0 flex-1 truncate text-xs">
              {tt(it.type as "book")}
            </span>
            <SendTo resourceId={it.resourceId} compact />
            <button
              type="button"
              disabled={taken || pending}
              onClick={() =>
                exec(() => takeSourceAction(it.resourceId, it.ownerId), {
                  onSuccess: () => setTaken(true),
                  success: t("taken"),
                })
              }
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors",
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
              {taken ? t("inLibrary") : t("take")}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
