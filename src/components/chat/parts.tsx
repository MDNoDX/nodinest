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
  Play,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { takeSharedAction } from "@/app/actions/dm";
import { Cover, coverSrc } from "@/components/library/cover";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import type { DmMessage } from "@/server/dm";

type Kind = "text" | "photo" | "voice" | "video" | "file" | "item" | "deleted";

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

const KIND_ICON = { photo: ImageIcon, voice: Mic, video: Video, file: FileText, item: Library };

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

/** A voice message: play / pause, a bar to move in, the time. */
export function VoiceNote({ src, mine }: { src: string; mine: boolean }) {
  const t = useTranslations("chat");
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(0);
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
  const pct = len ? Math.min(100, (at / len) * 100) : 0;
  return (
    <div className="flex w-60 max-w-full items-center gap-3 py-1">
      <audio ref={ref} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={on ? t("pause") : t("play")}
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full transition-transform active:scale-95",
          mine ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
        )}
      >
        {on ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <input
          type="range"
          min={0}
          max={len || 1}
          step={0.1}
          value={at}
          aria-label={t("kind.voice")}
          onChange={(e) => {
            const a = ref.current;
            if (a) a.currentTime = Number(e.target.value);
          }}
          style={{ ["--pct" as string]: `${pct}%` }}
          className="chat-seek h-1.5 w-full cursor-pointer appearance-none rounded-full"
        />
        <span className="text-muted text-[11px] tabular-nums">{on || at ? fmt(at) : fmt(len)}</span>
      </div>
    </div>
  );
}

/** What a message carries besides its text. */
export function Attachment({ m, mine }: { m: DmMessage; mine: boolean }) {
  const f = m.file;
  if (f) {
    const src = `/api/files/${f.id}`;
    if (f.mime.startsWith("image/"))
      return (
        <a href={src} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={f.name}
            loading="lazy"
            className="max-h-80 w-auto max-w-full rounded-xl object-contain"
          />
        </a>
      );
    if (f.mime.startsWith("audio/")) return <VoiceNote src={src} mine={mine} />;
    if (f.mime.startsWith("video/"))
      return (
        <video
          src={src}
          controls
          preload="metadata"
          playsInline
          className="max-h-80 w-full max-w-sm rounded-xl bg-black"
        />
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
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                exec(() => takeSharedAction(m.id), {
                  onSuccess: () => setTaken(true),
                  success: t("taken"),
                })
              }
              className="bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BookPlus className="size-3.5" />
              )}
              {t("take")}
            </button>
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
