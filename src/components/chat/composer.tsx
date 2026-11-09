"use client";
import {
  ChevronLeft,
  CornerUpLeft,
  FileText,
  Lock,
  Mic,
  Paperclip,
  SendHorizontal,
  Square,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { fmtSeconds, useRecorder } from "@/components/media/use-recorder";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { DmGif, Kind } from "@/server/dm";
import { EmojiGif } from "./emoji-gif";
import { KindLabel } from "./parts";
import { BARS, shape, waveOf, waveOfLevels } from "./wave";

export type Voice = { file: File; wave: number[] | null; seconds: number };
export type Reply = { senderName: string; kind: Kind; text: string | null };

const CANCEL_PX = 90;
const LOCK_PX = 70;
const MAX_FILES = 10;

/**
 * Where a message is written, Telegram-like:
 * - text with emojis; Enter sends on a computer, a new line on a phone;
 * - 📎 files open a sheet to look at them, add a caption and send (or not);
 * - the mic: hold to record and let go to send, slide left to cancel, slide up
 *   (or just tap) to keep recording hands-free; the bars move with the voice;
 * - the smile: emojis, GIFs and stickers.
 */
export function Composer({
  reply,
  onCancelReply,
  onText,
  onFiles,
  onVoice,
  onGif,
}: {
  reply: Reply | null;
  onCancelReply: () => void;
  onText: (body: string) => void;
  onFiles: (files: File[], caption: string, original?: boolean) => void;
  onVoice: (v: Voice) => void;
  onGif: (g: DmGif) => void;
}) {
  const t = useTranslations("chat");
  const [text, setText] = useState("");
  const [touch, setTouch] = useState(false);
  const [sheet, setSheet] = useState<File[] | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useRecorder(15 * 60);
  // Hold-to-record: where the finger went down, and whether it is locked.
  const [mode, setMode] = useState<"off" | "hold" | "locked">("off");
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const downAt = useRef<{ x: number; y: number; t: number } | null>(null);
  const [levels, setLevels] = useState<number[]>([]);

  useEffect(() => {
    const m = matchMedia("(pointer: coarse)");
    const set = () => setTouch(m.matches);
    const first = setTimeout(set);
    m.addEventListener("change", set);
    return () => {
      clearTimeout(first);
      m.removeEventListener("change", set);
    };
  }, []);

  // The bars while recording: the voice level, sampled ten times a second.
  const level = useRef(0);
  useEffect(() => {
    level.current = rec.level;
  }, [rec.level]);
  const recording = rec.state === "recording";
  // Every level heard, for the message's bars (no decoding of the file after it ends).
  const heard = useRef<number[]>([]);
  useEffect(() => {
    if (!recording) return;
    heard.current = [];
    const timer = setInterval(() => {
      heard.current.push(level.current);
      setLevels((l) => [...l.slice(-(BARS - 1)), level.current]);
    }, 100);
    return () => clearInterval(timer);
  }, [recording]);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const insert = (e: string) => {
    const el = input.current;
    if (!el) return setText((x) => x + e);
    const a = el.selectionStart ?? text.length;
    const b = el.selectionEnd ?? text.length;
    const next = text.slice(0, a) + e + text.slice(b);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + e.length, a + e.length);
      grow(el);
    });
  };

  const sendText = () => {
    const body = text.trim();
    if (!body) return;
    onText(body);
    setText("");
    requestAnimationFrame(() => input.current && grow(input.current));
    input.current?.focus();
  };

  // The microphone takes a moment to open (longer on Android, and the first time
  // it asks for permission): what the finger did meanwhile is kept and done
  // once it is open, so a recording never runs on with no way to stop it.
  const starting = useRef<Promise<void> | null>(null);
  const afterStart = useRef<"send" | "cancel" | null>(null);

  const stopAndSend = async () => {
    setMode("off");
    setDrag({ x: 0, y: 0 });
    if (starting.current) {
      afterStart.current = "send";
      return;
    }
    const r = await rec.stop();
    setLevels([]);
    if (!r || r.seconds < 1) return;
    const file = new File([r.blob], r.name, { type: r.mime });
    // Like Telegram: the bars come from the levels heard, so it goes at once.
    const wave = heard.current.length >= 8 ? waveOfLevels(heard.current) : await waveOf(r.blob);
    onVoice({ file, wave, seconds: r.seconds });
  };
  const cancelVoice = () => {
    setMode("off");
    setDrag({ x: 0, y: 0 });
    setLevels([]);
    if (starting.current) afterStart.current = "cancel";
    rec.cancel();
  };

  // The mic button: down starts, up sends (or locks after a quick tap).
  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (mode === "locked" || recording || starting.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    downAt.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setMode("hold");
    navigator.vibrate?.(10);
    afterStart.current = null;
    starting.current = rec.start().finally(() => {
      starting.current = null;
      const then = afterStart.current;
      afterStart.current = null;
      if (then === "send") void stopAndSend();
      else if (then === "cancel") rec.cancel();
    });
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = downAt.current;
    if (!d || mode !== "hold") return;
    const x = Math.min(0, e.clientX - d.x);
    const y = Math.min(0, e.clientY - d.y);
    setDrag({ x, y });
    if (-x > CANCEL_PX) {
      downAt.current = null;
      cancelVoice();
    } else if (-y > LOCK_PX) {
      downAt.current = null;
      setDrag({ x: 0, y: 0 });
      setMode("locked");
    }
  };
  const onUp = () => {
    const d = downAt.current;
    downAt.current = null;
    if (!d || mode !== "hold") return;
    // A quick tap: keep recording without holding.
    if (Date.now() - d.t < 350) {
      setDrag({ x: 0, y: 0 });
      return setMode("locked");
    }
    void stopAndSend();
  };
  // The phone took the touch away (a permission prompt, a system gesture):
  // nothing is sent; the recording stays, with ✕ and ➤ to decide.
  const onLost = () => {
    downAt.current = null;
    setDrag({ x: 0, y: 0 });
    if (mode === "hold") setMode("locked");
  };

  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setSheet((s) => [...(s ?? []), ...list].slice(0, MAX_FILES));
  };

  // Recording with nothing held (e.g. it opened after the finger left): it shows as locked.
  const shown = recording && mode === "off" ? "locked" : mode;
  const live = recording || shown !== "off";
  return (
    <div className="mx-auto max-w-3xl">
      {reply && (
        <div className="animate-fade-in mb-2 flex items-center gap-2 px-1">
          <CornerUpLeft className="text-primary size-4 shrink-0" />
          <div className="border-primary min-w-0 flex-1 border-l-2 pl-2 text-xs">
            <span className="text-primary block font-semibold">{reply.senderName}</span>
            <span className="text-muted line-clamp-1">
              <KindLabel kind={reply.kind} text={reply.text} />
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={t("cancel")}
            className="text-muted hover:bg-surface-2 grid size-8 place-items-center rounded-full"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,audio/*,application/pdf"
          onChange={(e) => {
            pickFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {live ? (
          <div className="bg-surface-2 flex h-11 min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-2xl px-3">
            {shown === "locked" ? (
              <button
                type="button"
                onClick={cancelVoice}
                aria-label={t("cancel")}
                className="text-danger grid size-8 shrink-0 place-items-center rounded-full"
              >
                <Trash2 className="size-5" />
              </button>
            ) : (
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-[var(--c-rose)]" />
            )}
            <span className="w-10 shrink-0 text-sm font-medium tabular-nums">
              {fmtSeconds(rec.seconds)}
            </span>
            <span className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
              {shape(levels).map((v, i) => (
                <span
                  key={i}
                  className="bg-primary w-[3px] shrink-0 rounded-full transition-[height] duration-100"
                  style={{ height: `${Math.round(v * 100)}%` }}
                />
              ))}
            </span>
            {shown === "hold" && (
              <span
                className="text-muted flex shrink-0 items-center gap-1 text-xs transition-opacity"
                style={{ opacity: 1 - Math.min(1, -drag.x / CANCEL_PX) * 0.7 }}
              >
                <ChevronLeft className="size-4" /> {t("slideCancel")}
              </span>
            )}
          </div>
        ) : (
          <>
            <IconBtn label={t("attach")} onClick={() => fileInput.current?.click()}>
              <Paperclip className="size-5" />
            </IconBtn>
            <div className="bg-surface-2 focus-within:ring-primary/40 flex min-w-0 flex-1 items-end rounded-2xl focus-within:ring-2">
              <textarea
                ref={input}
                value={text}
                rows={1}
                maxLength={4000}
                placeholder={t("typeMessage")}
                aria-label={t("typeMessage")}
                onChange={(e) => {
                  setText(e.target.value);
                  grow(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    sendText();
                  }
                  if (e.key === "Escape") onCancelReply();
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    pickFiles(e.clipboardData.files);
                  }
                }}
                className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 pl-4 text-[15px] leading-6 outline-none"
              />
              <EmojiGif onEmoji={insert} onGif={onGif} />
            </div>
          </>
        )}
        {text.trim() && !live ? (
          <button
            type="button"
            onClick={sendText}
            aria-label={t("send")}
            className="chat-send bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90"
          >
            <SendHorizontal className="size-5" />
          </button>
        ) : shown === "locked" ? (
          <button
            type="button"
            onClick={() => void stopAndSend()}
            aria-label={t("send")}
            className="chat-send bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90"
          >
            <SendHorizontal className="size-5" />
          </button>
        ) : (
          <span className="relative shrink-0">
            {shown === "hold" && (
              // Slide up to lock: the lock rises as the finger goes up.
              <span
                className="bg-surface border-border text-muted absolute bottom-14 left-1/2 grid h-16 w-10 -translate-x-1/2 place-items-center rounded-full border shadow-lg"
                style={{ transform: `translate(-50%, ${Math.max(-LOCK_PX, drag.y) / 2}px)` }}
              >
                <Lock className="size-4" />
              </span>
            )}
            <button
              type="button"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onLost}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={t("record")}
              title={t("recordHint")}
              style={
                shown === "hold" ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined
              }
              className={cn(
                "grid size-11 touch-none place-items-center rounded-full transition-colors select-none",
                shown === "hold"
                  ? "bg-primary text-primary-foreground scale-125 shadow-lg"
                  : "bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {shown === "hold" ? (
                <Square className="size-4 fill-current" />
              ) : (
                <Mic className="size-5" />
              )}
            </button>
          </span>
        )}
      </div>
      {(rec.state === "denied" || rec.state === "nomic" || rec.state === "error") && (
        <p className="text-danger mt-1 px-1 text-xs">{t(`mic.${rec.state}`)}</p>
      )}
      <AttachSheet
        files={sheet}
        caption={text}
        onCaption={setText}
        onAdd={() => fileInput.current?.click()}
        onRemove={(i) => setSheet((s) => (s && s.length > 1 ? s.filter((_, j) => j !== i) : null))}
        onClose={() => setSheet(null)}
        onSend={(original) => {
          if (!sheet?.length) return;
          onFiles(sheet, text.trim(), original);
          setSheet(null);
          setText("");
        }}
      />
    </div>
  );
}

/** Files picked: seen first, a caption added, then sent — or put away. */
function AttachSheet({
  files,
  caption,
  onCaption,
  onAdd,
  onRemove,
  onClose,
  onSend,
}: {
  files: File[] | null;
  caption: string;
  onCaption: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onClose: () => void;
  onSend: (original: boolean) => void;
}) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const [urls, setUrls] = useState<string[]>([]);
  // Photos are made lighter by default (fast, like Telegram); "as a file" keeps them whole.
  const [original, setOriginal] = useState(false);
  const photos = (files ?? []).some((f) => /^image\/(jpeg|png|webp|heic|heif)$/.test(f.type));
  useEffect(() => {
    const made = (files ?? []).map((f) =>
      /^(image|video)\//.test(f.type) ? URL.createObjectURL(f) : "",
    );
    const timer = setTimeout(() => setUrls(made));
    return () => {
      clearTimeout(timer);
      made.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [files]);
  const size = (n: number) =>
    n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
  return (
    <Dialog open={!!files} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t("sendFiles", { n: files?.length ?? 0 })} closeLabel={tc("close")}>
        <div
          className={cn(
            "grid max-h-[50dvh] gap-2 overflow-y-auto",
            (files?.length ?? 0) > 1 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1",
          )}
        >
          {(files ?? []).map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="bg-surface-2 relative overflow-hidden rounded-xl"
            >
              {f.type.startsWith("image/") && urls[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[i]}
                  alt={f.name}
                  className={cn(
                    "w-full object-cover",
                    (files?.length ?? 0) > 1 ? "aspect-square" : "max-h-[45dvh] object-contain",
                  )}
                />
              ) : f.type.startsWith("video/") && urls[i] ? (
                <video
                  src={urls[i]}
                  muted
                  playsInline
                  controls={(files?.length ?? 0) === 1}
                  preload="metadata"
                  className={cn(
                    "w-full bg-black",
                    (files?.length ?? 0) > 1 ? "aspect-square object-cover" : "max-h-[45dvh]",
                  )}
                />
              ) : (
                <div className="flex items-center gap-3 p-3">
                  <span className="bg-primary-soft text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                    {f.type.startsWith("video/") ? (
                      <Video className="size-5" />
                    ) : (
                      <FileText className="size-5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="text-muted block text-xs">{size(f.size)}</span>
                  </span>
                </div>
              )}
              {/^(image|video)\//.test(f.type) && (
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                  {size(f.size)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={t("remove")}
                className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <textarea
          value={caption}
          rows={2}
          maxLength={4000}
          onChange={(e) => onCaption(e.target.value)}
          placeholder={t("caption")}
          aria-label={t("caption")}
          className="bg-surface-2 focus:ring-primary/40 mt-3 w-full resize-none rounded-xl px-3 py-2 text-sm outline-none focus:ring-2"
        />
        {photos && (
          <label className="text-muted mt-2 flex cursor-pointer items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={original}
              onChange={(e) => setOriginal(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            {t("asFile")}
          </label>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onAdd} disabled={(files?.length ?? 0) >= MAX_FILES}>
            <Paperclip /> {t("addMore")}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => onSend(original)}>
              <SendHorizontal /> {t("send")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted hover:bg-surface-2 hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full transition-colors"
    >
      {children}
    </button>
  );
}
