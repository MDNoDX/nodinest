"use client";
import {
  BookPlus,
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Library,
  Loader2,
  Mic,
  Pause,
  Sticker,
  Play,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { takeSharedAction } from "@/app/actions/dm";
import { Cover, coverSrc } from "@/components/library/cover";
import { AskFirst } from "@/components/ui/ask-first";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import type { DmMessage, Kind as DmKind } from "@/server/dm";

type Kind = DmKind;

/** "12:40" today, "Kecha" yesterday, "3 noy" before. */
export function listTime(iso: string, locale: string, yesterday: string) {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return clock(iso, locale);
  if (diff === 1) return yesterday;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(d);
}

export const clock = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** The time now, again every `ms` (for "online" and "5 min ago" that stay true). */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick);
    const timer = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [ms]);
  return now;
}

/** "online", "5 daqiqa oldin", "kecha 21:40", "3 noyabr". */
export function seenText(
  now: number,
  iso: string,
  locale: string,
  t: (
    k: "online" | "seenMin" | "seenHours" | "seenYesterday" | "seenOn",
    v?: Record<string, string | number>,
  ) => string,
) {
  const ms = now - Date.parse(iso);
  if (ms < 2 * 60_000) return t("online");
  const min = Math.round(ms / 60_000);
  if (min < 60) return t("seenMin", { n: min });
  const h = Math.round(min / 60);
  const d = new Date(iso);
  const today = new Date();
  if (h < 24 && d.getDate() === today.getDate()) return t("seenHours", { n: h });
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString())
    return t("seenYesterday", { time: clock(iso, locale) });
  return t("seenOn", {
    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d),
  });
}

/** The line between days in a conversation. */
export function dayLabel(iso: string, locale: string, today: string, yesterday: string) {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return today;
  if (diff === 1) return yesterday;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(d);
}

const KIND_ICON = {
  photo: ImageIcon,
  voice: Mic,
  video: Video,
  file: FileText,
  item: Library,
  gif: Sticker,
};

/** A short line for a message: its text, or what it holds ("Ovozli xabar"). */
export function KindLabel({ kind, text }: { kind: Kind; text: string | null }) {
  const t = useTranslations("chat");
  if (kind === "deleted") return <span className="italic">{t("kind.deleted")}</span>;
  if (kind === "text") return <>{text}</>;
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{text || t(`kind.${kind}`)}</span>
    </span>
  );
}

const sizeText = (n: number | null) =>
  n == null
    ? ""
    : n < 1024 * 1024
      ? `${Math.max(1, Math.round(n / 1024))} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

const fmt = (s: number) =>
  Number.isFinite(s)
    ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
    : "0:00";

// One voice plays at a time.
let playingNow: HTMLAudioElement | null = null;

/** A voice message: play / pause, its bars (the part heard is coloured, a tap moves there), the time. */
export function VoiceNote({
  src,
  mine,
  wave,
  seconds,
}: {
  src: string;
  mine: boolean;
  wave?: number[];
  seconds?: number;
}) {
  const t = useTranslations("chat");
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(seconds ?? 0);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const time = () => setAt(a.currentTime);
    const meta = () => Number.isFinite(a.duration) && setLen(a.duration);
    const end = () => {
      setOn(false);
      setAt(0);
    };
    const pause = () => setOn(false);
    a.addEventListener("timeupdate", time);
    a.addEventListener("loadedmetadata", meta);
    a.addEventListener("durationchange", meta);
    a.addEventListener("ended", end);
    a.addEventListener("pause", pause);
    return () => {
      a.removeEventListener("timeupdate", time);
      a.removeEventListener("loadedmetadata", meta);
      a.removeEventListener("durationchange", meta);
      a.removeEventListener("ended", end);
      a.removeEventListener("pause", pause);
    };
  }, []);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (on) return a.pause();
    if (playingNow && playingNow !== a) playingNow.pause();
    playingNow = a;
    void a.play().then(() => setOn(true));
  };
  const seek = (frac: number) => {
    const a = ref.current;
    if (!a || !len) return;
    a.currentTime = Math.max(0, Math.min(len - 0.05, frac * len));
    setAt(a.currentTime);
  };
  const pct = len ? Math.min(1, at / len) : 0;
  const bars = wave && wave.length ? wave : null;
  return (
    <div className="flex w-64 max-w-full items-center gap-3 py-1">
      <audio ref={ref} src={src} preload="metadata" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-label={on ? t("pause") : t("play")}
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full transition-transform active:scale-95",
          mine ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
        )}
      >
        {on ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {bars ? (
          <div
            role="slider"
            tabIndex={0}
            aria-label={t("kind.voice")}
            aria-valuemin={0}
            aria-valuemax={Math.round(len)}
            aria-valuenow={Math.round(at)}
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - r.left) / r.width);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") seek(pct + 0.05);
              if (e.key === "ArrowLeft") seek(pct - 0.05);
            }}
            className="flex h-7 cursor-pointer items-center gap-[2px]"
          >
            {bars.map((v, i) => (
              <span
                key={i}
                className={cn(
                  "min-w-[2px] flex-1 rounded-full transition-colors",
                  i / bars.length < pct ? "bg-primary" : "bg-current/20",
                )}
                style={{ height: `${Math.max(12, Math.round(v * 100))}%` }}
              />
            ))}
          </div>
        ) : (
          <input
            type="range"
            min={0}
            max={len || 1}
            step={0.1}
            value={at}
            aria-label={t("kind.voice")}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => seek(Number(e.target.value) / (len || 1))}
            style={{ ["--pct" as string]: `${pct * 100}%` }}
            className="chat-seek h-1.5 w-full cursor-pointer appearance-none rounded-full"
          />
        )}
        <span className="text-muted text-[11px] tabular-nums">{on || at ? fmt(at) : fmt(len)}</span>
      </div>
    </div>
  );
}

/** What a message carries besides its text. */
/**
 * A size that fits the bubble: never wider or taller than the box, never
 * stretched. Percent widths would let the picture's own width push the bubble
 * wide, so the size is worked out here in pixels.
 */
export function fitBox(w: number, h: number, maxW = 240, maxH = 260) {
  const k = Math.min(1, maxW / w, maxH / h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** A small label on a picture saying what it is (GIF, video). */
function MediaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white backdrop-blur-sm">
      {children}
    </span>
  );
}

export function Attachment({
  m,
  mine,
  onOpen,
}: {
  m: DmMessage;
  mine: boolean;
  /** A picture or video opens full screen (the chat's viewer). */
  onOpen?: () => void;
}) {
  const t = useTranslations("chat");
  const open = (e: React.MouseEvent) => {
    if (!onOpen) return;
    e.preventDefault();
    e.stopPropagation();
    onOpen();
  };
  const f = m.file;
  const gif = m.meta?.gif;
  if (gif) {
    const box = fitBox(Number(gif.w) || 240, Number(gif.h) || 180);
    return (
      <span
        role="button"
        tabIndex={-1}
        onClick={open}
        className="relative block cursor-zoom-in overflow-hidden rounded-xl"
        style={box}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gif.url}
          alt="GIF"
          loading="lazy"
          width={box.width}
          height={box.height}
          className="bg-surface-2 block size-full object-cover"
        />
        <MediaBadge>GIF</MediaBadge>
      </span>
    );
  }
  if (f) {
    const src = `/api/files/${f.id}`;
    if (f.mime.startsWith("image/"))
      return (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          onClick={open}
          className="block cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={f.name}
            loading="lazy"
            className="bg-surface-2 block max-h-80 min-h-24 w-auto max-w-[min(17rem,68vw)] min-w-24 rounded-xl object-contain"
          />
        </a>
      );
    if (f.mime.startsWith("audio/"))
      return <VoiceNote src={src} mine={mine} wave={m.meta?.wave} seconds={m.meta?.seconds} />;
    if (f.mime.startsWith("video/"))
      return (
        // The first frame with a play button; a tap plays it full screen (phones too).
        <span
          role="button"
          tabIndex={-1}
          onClick={open}
          className="relative block w-[min(17rem,68vw)] cursor-pointer"
        >
          <video
            src={`${src}#t=0.1`}
            muted
            preload="metadata"
            playsInline
            className="pointer-events-none block max-h-80 min-h-32 w-full rounded-xl bg-black object-cover"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
              <Play className="size-5 translate-x-0.5 fill-current" />
            </span>
          </span>
          <MediaBadge>
            <Video className="size-3" /> {t("kind.video")}
          </MediaBadge>
        </span>
      );
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="bg-surface/60 hover:bg-surface flex w-64 max-w-full items-center gap-3 rounded-xl p-2 transition-colors"
      >
        <span className="bg-primary-soft text-primary grid size-10 shrink-0 place-items-center rounded-lg">
          <FileText className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{f.name}</span>
          <span className="text-muted block text-xs">{sizeText(f.size)}</span>
        </span>
      </a>
    );
  }
  if (m.item) return <SharedItem m={m} mine={mine} />;
  return null;
}

function SharedItem({ m, mine }: { m: DmMessage; mine: boolean }) {
  const t = useTranslations("chat");
  const tm = useTranslations("media");
  const tt = useTranslations("types");
  const it = m.item!;
  const [taken, setTaken] = useState(false);
  const { pending, exec } = useAction();
  const portrait = it.type === "book" || it.type === "course";
  return (
    <div className="bg-surface/60 flex w-72 max-w-full gap-3 rounded-xl p-2">
      <div className={cn("shrink-0", portrait ? "w-14" : "w-24")}>
        <Cover type={it.type as "book"} title={it.title} src={coverSrc(it)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-muted text-[11px]">{tt(it.type as "book")}</span>
        <span className="line-clamp-2 text-sm leading-snug font-semibold">{it.title}</span>
        <div className="mt-auto pt-1">
          {mine || taken ? (
            <Link
              href={`/library/${it.id}`}
              className="text-primary inline-flex h-7 items-center gap-1 text-xs font-semibold hover:underline"
            >
              {taken && <Check className="size-3.5" />} {t("open")}
            </Link>
          ) : (
            <AskFirst
              title={tm("takeTitle")}
              message={tm("takeBody")}
              confirmLabel={t("take")}
              onConfirm={() =>
                exec(() => takeSharedAction(m.id), {
                  onSuccess: () => setTaken(true),
                  success: t("taken"),
                })
              }
            >
              <button
                type="button"
                disabled={pending}
                className="bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <BookPlus className="size-3.5" />
                )}
                {t("take")}
              </button>
            </AskFirst>
          )}
        </div>
      </div>
    </div>
  );
}

/** ✓ sent, ✓✓ read. */
export function ReadMark({ read }: { read: boolean }) {
  const t = useTranslations("chat");
  return read ? (
    <CheckCheck className="size-3.5 text-[var(--primary)]" aria-label={t("read")} />
  ) : (
    <Check className="size-3.5" aria-label={t("delivered")} />
  );
}
