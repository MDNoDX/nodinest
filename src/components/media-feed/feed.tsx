"use client";
import { BookPlus, Check, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { takeSourceAction } from "@/app/actions/social";
import { moreMediaAction } from "@/app/actions/media";
import { Cover, coverSrc } from "@/components/library/cover";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import { youtubeIdFromUrl } from "@/lib/youtube";
import type { MediaItem } from "@/server/social";

const KINDS = ["all", "book", "video", "podcast", "course", "article"];

/** One screen per item, swiped like Reels; a YouTube video plays in place. */
export function MediaFeed({ items, kind }: { items: MediaItem[]; kind: string }) {
  const t = useTranslations("media");
  const tt = useTranslations("types");
  const [list, setList] = useState(items);
  const [end, setEnd] = useState(items.length < 30);
  const loading = useRef(false);
  const tail = useRef<HTMLLIElement>(null);
  const more = useCallback(async () => {
    if (loading.current || end || !list.length) return;
    loading.current = true;
    const r = await moreMediaAction(kind, String(list[list.length - 1].updatedAt)).catch(
      () => null,
    );
    loading.current = false;
    if (!r?.ok) return setEnd(true);
    setList((l) => [...l, ...r.data]);
    if (r.data.length < 30) setEnd(true);
  }, [end, kind, list]);
  useEffect(() => {
    const el = tail.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void more());
    io.observe(el);
    return () => io.disconnect();
  }, [more]);
  return (
    <div className="w-full">
      <nav className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={k === "all" ? "/media" : `/media?kind=${k}`}
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
        <EmptyState title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="h-[calc(100dvh-9rem-var(--bottom-nav,0px))] snap-y snap-mandatory [scrollbar-width:none] overflow-y-auto rounded-2xl">
          {list.map((it) => (
            <Card key={`${it.resourceId}-${it.ownerId}`} it={it} />
          ))}
          {!end && (
            <li ref={tail} className="grid h-16 place-items-center">
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
  return (
    <li className="relative flex h-full snap-start flex-col overflow-hidden bg-neutral-950 text-white md:flex-row">
      <div className="relative grid min-h-0 flex-1 place-items-center p-6">
        {playing && yt ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&playsinline=1`}
            title={it.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="aspect-video w-full rounded-xl"
          />
        ) : (
          <>
            <Link href={`/library/${it.resourceId}`} className="block h-full max-h-full">
              <Cover
                type={it.type as "book"}
                title={it.title}
                src={coverSrc(it)}
                className="h-full max-h-[58dvh] w-auto"
              />
            </Link>
            {yt && (
              <button
                type="button"
                aria-label={t("play")}
                onClick={() => setPlaying(true)}
                className="absolute inset-0 m-auto grid size-16 place-items-center rounded-full bg-white/90 text-black shadow-xl transition-transform hover:scale-105"
              >
                <Play className="size-7 fill-current" />
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-2 bg-gradient-to-t from-black to-black/40 p-4 md:w-80 md:justify-end md:bg-gradient-to-l">
        <Link href={`/u/${it.username}`} className="flex items-center gap-2 text-sm">
          <Avatar name={it.name} image={it.image} className="size-8" />
          <span className="min-w-0 truncate font-semibold">{it.name}</span>
          <span className="truncate text-xs text-white/60">@{it.username}</span>
        </Link>
        <div>
          <p className="text-xs text-white/60">{tt(it.type as "book")}</p>
          <Link href={`/library/${it.resourceId}`} className="line-clamp-2 font-semibold">
            {it.title}
          </Link>
          {it.description && (
            <p className="mt-1 line-clamp-2 text-sm text-white/70">{it.description}</p>
          )}
        </div>
        <Button
          size="sm"
          variant={taken ? "outline" : "primary"}
          className="self-start"
          disabled={taken}
          loading={pending}
          onClick={() =>
            exec(() => takeSourceAction(it.resourceId, it.ownerId), {
              onSuccess: () => setTaken(true),
              success: t("taken"),
            })
          }
        >
          {taken ? <Check /> : <BookPlus />} {taken ? t("inLibrary") : t("take")}
        </Button>
      </div>
    </li>
  );
}
