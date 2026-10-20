"use client";
import type { Editor, JSONContent } from "@tiptap/react";
import {
  AudioLines,
  Check,
  Copy,
  CornerDownLeft,
  Download,
  FileText,
  Loader2,
  MessageSquareText,
  PenLine,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  TextCursorInput,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  askAboutSelectionAction,
  deleteTranscriptAction,
  listTranscriptsAction,
  startTranscriptAction,
  stepTranscriptAction,
  transcribeSegmentAction,
  transcriptTextAction,
  writeHelpAction,
} from "@/app/actions/ai";
import { fmtClock, useMediaDock, type DockSource } from "@/components/media/media-dock";
import { PREFERRED } from "@/components/media/use-recorder";
import { cn } from "@/lib/cn";
import { markdownToNodes, type DocNode } from "@/lib/writeup-doc";
import type { TranscriptInfo } from "@/server/ai/transcripts";

export type AskRequest = { selection: string; context: string; n: number };
export type PanelTab = "write" | "ask" | "listen";

/** Length of one listening segment (one AI request per segment). */
const SEGMENT = 60;

/**
 * Right-hand AI panel of the taqriz editor:
 *  - "Ask": explains the selected word / passage, with follow-up questions;
 *    answers can be put into the taqriz at the cursor.
 *  - "Listen": while the video / audio plays in the dock, the AI writes the
 *    speech out (verbatim or as a konspekt), minute by minute, at the end of
 *    the taqriz, where the user can correct it at any time.
 */
export function AiPanel({
  editor,
  resourceId,
  media,
  tab,
  setTab,
  ask,
  onClose,
  startFull,
}: {
  startFull?: boolean;
  editor: Editor;
  resourceId: string;
  media: DockSource | null;
  tab: PanelTab;
  setTab: (t: PanelTab) => void;
  ask: AskRequest | null;
  onClose: () => void;
}) {
  const t = useTranslations("taqrizAi");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex items-center gap-1 border-b px-3 py-2">
        <Sparkles className="text-primary size-4" />
        <div role="tablist" className="bg-surface-2 ml-1 flex rounded-lg p-0.5 text-xs">
          {(["write", "ask", "listen"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 font-medium whitespace-nowrap",
                tab === k
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {k === "write" ? (
                <PenLine className="size-3.5" />
              ) : k === "ask" ? (
                <MessageSquareText className="size-3.5" />
              ) : (
                <AudioLines className="size-3.5" />
              )}
              {t(k === "write" ? "tabWrite" : k === "ask" ? "tabAsk" : "tabListen")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:text-foreground ml-auto rounded-md p-1"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>
      {/* All stay mounted: switching tabs never stops listening or loses a draft. */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto", tab !== "write" && "hidden")}>
        <WriteTab editor={editor} resourceId={resourceId} />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", tab !== "ask" && "hidden")}>
        <AskTab key={ask?.n ?? 0} editor={editor} resourceId={resourceId} ask={ask} />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", tab !== "listen" && "hidden")}>
        <ListenModes editor={editor} resourceId={resourceId} media={media} startFull={startFull} />
      </div>
    </div>
  );
}

// ── Write ──────────────────────────────────────────────────────────────────

type WriteAction = "outline" | "intro" | "continue" | "conclusion" | "improve" | "custom";

/** The taqriz as plain text with "## " chapter headings (context for the AI). */
function docText(editor: Editor) {
  const out: string[] = [];
  editor.state.doc.forEach((n) => {
    const text = n.textContent.trim();
    if (!text) return;
    out.push(n.type.name === "heading" ? `${"#".repeat(n.attrs.level ?? 2)} ${text}` : text);
  });
  return out.join("\n\n");
}

function WriteTab({ editor, resourceId }: { editor: Editor; resourceId: string }) {
  const t = useTranslations("taqrizAi");
  const te = useTranslations("errors");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<WriteAction | null>(null);
  const [res, setRes] = useState<{
    action: WriteAction;
    label: string;
    text: string;
    used: { notes: number; transcript: string | null };
    sel: { from: number; to: number; text: string } | null;
  } | null>(null);

  const go = async (action: WriteAction, label: string, instruction = "") => {
    const { from, to } = editor.state.selection;
    const selected = from !== to ? editor.state.doc.textBetween(from, to, "\n").trim() : "";
    if (action === "improve" && !selected) return toast(t("selectFirst"));
    setBusy(action);
    const r = await writeHelpAction({
      resourceId,
      action,
      instruction,
      doc: docText(editor),
      selection: selected.slice(0, 4000),
    }).catch(() => null);
    setBusy(null);
    if (!r || !r.ok) return toast.error(te(r && !r.ok ? r.code : "INTERNAL"));
    setRes({
      action,
      label,
      text: r.data.text,
      used: r.data.used,
      sel: selected ? { from, to, text: selected } : null,
    });
  };

  const nodes = (text: string) => markdownToNodes(text) as JSONContent[];
  const atCursor = () => {
    if (!res) return;
    editor.chain().focus().insertContent(nodes(res.text)).run();
    toast.success(t("inserted"));
  };
  const atEnd = () => {
    if (!res) return;
    editor
      .chain()
      .insertContentAt(editor.state.doc.content.size, nodes(res.text), { updateSelection: false })
      .run();
    toast.success(t("inserted"));
  };
  const replace = () => {
    if (!res?.sel) return;
    const { from, to, text } = res.sel;
    if (editor.state.doc.textBetween(from, to, "\n").trim() !== text)
      return toast.error(t("selectionChanged"));
    editor.chain().focus().insertContentAt({ from, to }, nodes(res.text)).run();
    toast.success(t("replaced"));
  };

  const chips: [WriteAction, string][] = [
    ["outline", t("wOutline")],
    ["intro", t("wIntro")],
    ["continue", t("wContinue")],
    ["conclusion", t("wConclusion")],
    ["improve", t("wImprove")],
  ];
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <p className="text-muted text-xs">{t("writeHint")}</p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([a, label]) => (
          <button
            key={a}
            type="button"
            disabled={!!busy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void go(a, label)}
            className="border-border hover:bg-surface-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
          >
            {busy === a && <Loader2 className="size-3 animate-spin" />}
            {label}
          </button>
        ))}
      </div>
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const q = draft.trim();
          if (!q || busy) return;
          void go("custom", q, q);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
              e.currentTarget.form?.requestSubmit();
          }}
          rows={3}
          placeholder={t("writePlaceholder")}
          className="border-border-strong bg-surface focus-visible:outline-ring/40 min-h-20 rounded-lg border px-2.5 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!!busy || !draft.trim()}
          className="bg-primary text-primary-foreground flex items-center justify-center gap-2 self-end rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {busy === "custom" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PenLine className="size-3.5" />
          )}
          {t("writeSend")}
        </button>
      </form>
      {busy && (
        <p className="text-muted flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" /> {t("writing")}
        </p>
      )}
      {res && !busy && (
        <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
          <div className="text-primary text-xs font-medium">{res.label}</div>
          <MdView text={res.text} />
          <div className="flex flex-wrap gap-1">
            {res.action === "improve" && res.sel ? (
              <SmallBtn onClick={replace} icon={<Check />}>
                {t("replaceSelection")}
              </SmallBtn>
            ) : (
              <>
                <SmallBtn onClick={atCursor} icon={<CornerDownLeft />}>
                  {t("insertCursor")}
                </SmallBtn>
                <SmallBtn onClick={atEnd} icon={<CornerDownLeft />}>
                  {t("insertEnd")}
                </SmallBtn>
              </>
            )}
            <SmallBtn
              onClick={() =>
                void go(res.action, res.label, res.action === "custom" ? res.label : "")
              }
              icon={<RotateCcw />}
            >
              {t("again")}
            </SmallBtn>
            <SmallBtn
              onClick={() => {
                void navigator.clipboard?.writeText(res.text);
                toast(t("copied"));
              }}
              icon={<Copy />}
            >
              {t("copy")}
            </SmallBtn>
          </div>
          <p className="text-muted text-[11px]">
            {t("usedMaterial", {
              notes: res.used.notes,
              rec: res.used.transcript
                ? t(res.used.transcript === "notes" ? "usedKonspekt" : "usedTranscript")
                : t("usedNone"),
            })}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Ask ────────────────────────────────────────────────────────────────────

type Turn = { q: string; label: string; a?: string; error?: string; pending?: boolean };

function AskTab({
  editor,
  resourceId,
  ask,
}: {
  editor: Editor;
  resourceId: string;
  ask: AskRequest | null;
}) {
  const t = useTranslations("taqrizAi");
  const te = useTranslations("errors");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const busy = turns.some((x) => x.pending);
  const end = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (q: string, label: string, base: Turn[], req: AskRequest) => {
      const history = base
        .filter((x) => x.a)
        .slice(-4)
        .map((x) => ({ q: x.q || label, a: x.a! }));
      setTurns([...base, { q, label, pending: true }]);
      let a: string | undefined;
      let error: string | undefined;
      try {
        const r = await askAboutSelectionAction({
          resourceId,
          selection: req.selection,
          context: req.context,
          question: q,
          history,
        });
        if (r.ok) a = r.data.answer;
        else error = te(r.code);
      } catch {
        error = te("INTERNAL");
      }
      setTurns((cur) => cur.map((x, i) => (i === cur.length - 1 ? { q, label, a, error } : x)));
    },
    [resourceId, te],
  );

  // Each new selection (this component is keyed by it) opens with an explanation.
  const started = useRef(false);
  useEffect(() => {
    if (!ask || started.current) return;
    started.current = true;
    void send("", t("explain"), [], ask);
  }, [ask, send, t]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  if (!ask)
    return (
      <div className="text-muted flex flex-col items-center gap-2 px-6 py-10 text-center text-sm">
        <TextCursorInput className="size-8 opacity-50" />
        {t("askEmpty")}
      </div>
    );

  const chips: [string, string][] = [
    [t("chipMeaning"), t("qMeaning")],
    [t("chipContext"), t("qContext")],
    [t("chipEssay"), t("qEssay")],
    [t("chipDeeper"), t("qDeeper")],
  ];
  const insert = (text: string) => {
    editor
      .chain()
      .focus()
      .insertContent(markdownToNodes(text) as JSONContent[])
      .run();
    toast.success(t("inserted"));
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <blockquote className="border-primary/50 bg-surface-2/60 text-foreground/90 line-clamp-6 rounded-r-lg border-l-2 px-3 py-2 text-sm italic">
        {ask.selection}
      </blockquote>
      {turns.map((x, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          {x.label && (
            <div className="bg-primary-soft text-primary w-fit max-w-full rounded-lg px-2.5 py-1 text-xs font-medium">
              {x.label}
            </div>
          )}
          {x.pending ? (
            <div className="text-muted flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> {t("thinking")}
            </div>
          ) : x.error ? (
            <p className="text-danger text-sm">{x.error}</p>
          ) : (
            <>
              <MdView text={x.a ?? ""} />
              <div className="flex gap-1">
                <SmallBtn onClick={() => insert(x.a ?? "")} icon={<CornerDownLeft />}>
                  {t("insert")}
                </SmallBtn>
                <SmallBtn
                  onClick={() => {
                    void navigator.clipboard?.writeText(x.a ?? "");
                    toast(t("copied"));
                  }}
                  icon={<Copy />}
                >
                  {t("copy")}
                </SmallBtn>
              </div>
            </>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([label, q]) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            onClick={() => void send(q, label, turns, ask)}
            className="border-border hover:bg-surface-2 rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const q = draft.trim();
          if (!q || busy) return;
          setDraft("");
          void send(q, q, turns, ask);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("askPlaceholder")}
          className="border-border-strong bg-surface focus-visible:outline-ring/40 h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg disabled:opacity-50"
          aria-label={t("send")}
        >
          <CornerDownLeft className="size-4" />
        </button>
      </form>
      <p className="text-muted text-[11px]">{t("askNote")}</p>
      <div ref={end} />
    </div>
  );
}

// ── Listen and write ──────────────────────────────────────────────────────

type Seg = {
  key: string;
  from: number;
  to: number;
  status: "queued" | "working" | "done" | "empty" | "error";
  text?: string;
  error?: string;
  inserted?: boolean;
  clip?: { mime: string; data: string };
};

const toB64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Live writing while listening, or a full transcript prepared ahead of time. */
function ListenModes({
  startFull,
  ...props
}: {
  editor: Editor;
  resourceId: string;
  media: DockSource | null;
  startFull?: boolean;
}) {
  const t = useTranslations("taqrizAi");
  const [mode, setMode] = useState<"live" | "full">(startFull ? "full" : "live");
  return (
    <>
      <div className="border-border flex gap-1 border-b px-3 pt-3 pb-2">
        {(["live", "full"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium",
              mode === m
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {t(m === "live" ? "liveMode" : "fullMode")}
          </button>
        ))}
      </div>
      {/* Both stay mounted so neither stops when you switch. */}
      <div className={cn(mode !== "live" && "hidden")}>
        <ListenTab {...props} />
      </div>
      <div className={cn(mode !== "full" && "hidden")}>
        <FullTranscript {...props} />
      </div>
    </>
  );
}

function ListenTab({
  editor,
  resourceId,
  media,
}: {
  editor: Editor;
  resourceId: string;
  media: DockSource | null;
}) {
  const t = useTranslations("taqrizAi");
  const te = useTranslations("errors");
  const dock = useMediaDock();
  const [live, setLive] = useState(false);
  // Only the faithful transcript, always written with full care.
  const mode = "transcript" as const;
  const deep = true;
  const [auto, setAuto] = useState(true);
  const [segs, setSegs] = useState<Seg[]>([]);
  const segsRef = useRef<Seg[]>([]);
  const working = useRef(false);
  const opts = useRef({ mode, deep, auto });
  useEffect(() => {
    opts.current = { mode, deep, auto };
  }, [mode, deep, auto]);

  const src = dock?.source ?? null;
  const ours = !!src && src.resourceId === resourceId;
  const yt = ours && src?.kind === "youtube" ? src.id : null;
  const fileSrc = ours && src?.kind === "file" ? src : null;
  const capturable = !!fileSrc && fileSrc.src.startsWith("/");

  const update = (key: string, patch: Partial<Seg>) => {
    segsRef.current = segsRef.current.map((s) => (s.key === key ? { ...s, ...patch } : s));
    setSegs(segsRef.current);
  };
  const add = (s: Seg) => {
    if (segsRef.current.some((x) => x.key === s.key)) return false;
    segsRef.current = [...segsRef.current, s].sort((a, b) => a.from - b.from);
    setSegs(segsRef.current);
    return true;
  };

  const insertSeg = useCallback(
    (s: Seg) => {
      if (!s.text) return;
      const stamp: DocNode = {
        type: "paragraph",
        content: [{ type: "text", text: `[${fmtClock(s.from)}]`, marks: [{ type: "bold" }] }],
      };
      editor
        .chain()
        .insertContentAt(
          editor.state.doc.content.size,
          [stamp, ...markdownToNodes(s.text)] as JSONContent[],
          { updateSelection: false },
        )
        .run();
      update(s.key, { inserted: true });
    },
    [editor],
  );

  // One request at a time, in playback order.
  const pump = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    try {
      for (;;) {
        const next = segsRef.current.find((s) => s.status === "queued");
        if (!next) return;
        update(next.key, { status: "working" });
        const prev = segsRef.current.filter((s) => s.to <= next.from + 1 && s.text).at(-1)?.text;
        const r = await transcribeSegmentAction({
          resourceId,
          source: next.clip ? { kind: "clip", ...next.clip } : { kind: "youtube", id: yt },
          from: next.from,
          to: next.to,
          mode: opts.current.mode,
          deep: opts.current.deep,
          previous: prev ?? "",
        }).catch(() => ({ ok: false as const, code: "INTERNAL" as const }));
        if (r.ok) {
          const text = r.data.text;
          update(next.key, { status: text ? "done" : "empty", text, clip: undefined });
          const s = segsRef.current.find((x) => x.key === next.key);
          if (text && opts.current.auto && s) insertSeg(s);
          continue;
        }
        update(next.key, { status: "error", error: te(r.code) });
        if (r.code === "AI_QUOTA" || r.code === "RATE_LIMITED" || r.code === "AI_UNAVAILABLE") {
          setLive(false);
          toast.error(te(r.code));
          return;
        }
      }
    } finally {
      working.current = false;
    }
  }, [resourceId, yt, insertSeg, te]);

  // YouTube: the AI reads the video itself — queue the minute being heard
  // (and the next one shortly before it starts, so the text keeps up).
  const time = dock?.time ?? 0;
  const playing = !!dock?.playing;
  const duration = dock?.duration ?? 0;
  useEffect(() => {
    if (!live || !yt || !playing) return;
    const cut = (i: number) => ({
      from: i * SEGMENT,
      to: duration ? Math.min((i + 1) * SEGMENT, duration) : (i + 1) * SEGMENT,
    });
    for (const i of new Set([Math.floor(time / SEGMENT), Math.floor((time + 15) / SEGMENT)])) {
      const c = cut(i);
      if (c.to - c.from < 2) continue;
      add({ key: `${yt}:${mode}:${i}`, ...c, status: "queued" });
    }
    void pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, yt, playing, Math.floor(time / 5), duration, mode]);

  // Files: record what is played, a minute at a time, and send each clip.
  const recorder = useRef<MediaRecorder | null>(null);
  useEffect(() => {
    if (!live || !capturable || !playing || !dock) return;
    const stream = dock.captureStream();
    if (!stream) return;
    const mime = PREFERRED.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startClip = () => {
      const from = dock.time;
      const startedAt = performance.now();
      const parts: Blob[] = [];
      const r = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined,
      );
      recorder.current = r;
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.onstop = async () => {
        const secs = ((performance.now() - startedAt) / 1000) * (dock.rate || 1);
        if (secs >= 4) {
          const blob = new Blob(parts, { type: r.mimeType || mime || "audio/webm" });
          const data = await toB64(blob);
          add({
            key: `clip:${Math.round(from)}:${mode}`,
            from,
            to: from + secs,
            status: "queued",
            clip: { mime: blob.type.split(";")[0], data },
          });
          void pump();
        }
        if (!stopped) startClip();
      };
      r.start();
      timer = setTimeout(
        () => r.state === "recording" && r.stop(),
        (SEGMENT * 1000) / (dock.rate || 1),
      );
    };
    startClip();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, capturable, playing, mode]);

  const start = () => {
    if (!ours && media) {
      dock?.open(media);
    } else if (ours && !playing) dock?.toggle();
    setLive(true);
  };

  const unsupported = !!fileSrc && !capturable;
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      {!media && !ours ? (
        <p className="text-muted">{t("noMedia")}</p>
      ) : (
        <>
          <p className="text-muted text-xs">{t("modeTranscriptHint")}</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            {t("autoInsert")}
          </label>
          {unsupported ? (
            <p className="text-warning text-xs">{t("cannotCapture")}</p>
          ) : live ? (
            <button
              type="button"
              onClick={() => setLive(false)}
              className="bg-danger-soft text-danger flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium"
            >
              <Square className="size-4" /> {t("stop")}
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="bg-primary text-primary-foreground flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium"
            >
              <Play className="size-4" /> {t("start")}
            </button>
          )}
          {live && (
            <p className="text-muted flex items-center gap-1.5 text-xs">
              <span className="relative flex size-2">
                <span className="bg-danger absolute inline-flex size-full animate-ping rounded-full opacity-60" />
                <span className="bg-danger relative inline-flex size-2 rounded-full" />
              </span>
              {playing ? t("listening") : t("waitingPlay")}
            </p>
          )}
        </>
      )}
      <ol className="flex flex-col gap-2">
        {segs.map((s) => (
          <li key={s.key} className="border-border rounded-lg border p-2.5">
            <div className="mb-1 flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => dock?.seekTo(s.from)}
                className="text-primary font-semibold tabular-nums hover:underline"
              >
                {fmtClock(s.from)}–{fmtClock(s.to)}
              </button>
              <span className="text-muted">
                {s.status === "queued"
                  ? t("queued")
                  : s.status === "working"
                    ? t("working")
                    : s.status === "empty"
                      ? t("noSpeech")
                      : s.status === "error"
                        ? ""
                        : s.inserted
                          ? t("insertedShort")
                          : ""}
              </span>
              {s.status === "working" && <Loader2 className="text-muted size-3.5 animate-spin" />}
              <span className="ml-auto flex gap-1">
                {s.status === "done" && !s.inserted && (
                  <SmallBtn onClick={() => insertSeg(s)} icon={<CornerDownLeft />}>
                    {t("insert")}
                  </SmallBtn>
                )}
                {s.status === "error" && (s.clip || yt) && (
                  <SmallBtn
                    onClick={() => {
                      update(s.key, { status: "queued", error: undefined });
                      void pump();
                    }}
                    icon={<RotateCcw />}
                  >
                    {t("retry")}
                  </SmallBtn>
                )}
              </span>
            </div>
            {s.error && <p className="text-danger text-xs">{s.error}</p>}
            {s.text && (
              <div className="text-foreground/85 line-clamp-6 text-xs leading-relaxed">
                <MdView text={s.text} />
              </div>
            )}
          </li>
        ))}
      </ol>
      {segs.length > 0 && <p className="text-muted text-[11px]">{t("listenNote")}</p>}
    </div>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

function SmallBtn({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted hover:text-foreground hover:bg-surface-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium [&_svg]:size-3.5"
    >
      {icon}
      {children}
    </button>
  );
}

/** Renders the light Markdown the AI returns (same rules as markdownToNodes). */
function MdView({ text }: { text: string }) {
  const render = (n: DocNode, i: number): React.ReactNode => {
    const kids = n.content?.map(render);
    switch (n.type) {
      case "text": {
        let el: React.ReactNode = n.text;
        for (const m of n.marks ?? [])
          el = m.type === "bold" ? <strong key={i}>{el}</strong> : <em key={i}>{el}</em>;
        return <span key={i}>{el}</span>;
      }
      case "bulletList":
        return (
          <ul key={i} className="list-disc pl-5">
            {kids}
          </ul>
        );
      case "orderedList":
        return (
          <ol key={i} className="list-decimal pl-5">
            {kids}
          </ol>
        );
      case "listItem":
        return <li key={i}>{kids}</li>;
      case "blockquote":
        return (
          <blockquote key={i} className="border-border border-l-2 pl-2 italic">
            {kids}
          </blockquote>
        );
      case "heading":
        return (
          <p key={i} className="font-semibold">
            {kids}
          </p>
        );
      default:
        return <p key={i}>{kids}</p>;
    }
  };
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed">
      {markdownToNodes(text).map(render)}
    </div>
  );
}

// ── Full transcript, prepared ahead and downloadable ──────────────────────

function FullTranscript({
  editor,
  resourceId,
  media,
}: {
  editor: Editor;
  resourceId: string;
  media: DockSource | null;
}) {
  const t = useTranslations("taqrizAi");
  const te = useTranslations("errors");
  const dock = useMediaDock();
  // Only the faithful transcript, always written with full care.
  const mode = "transcript" as const;
  const deep = true;
  const [list, setList] = useState<TranscriptInfo[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const stop = useRef(false);

  const fileId =
    media?.kind === "file" ? /^\/api\/files\/([0-9a-f-]{36})$/i.exec(media.src)?.[1] : null;
  const source =
    media?.kind === "youtube"
      ? { kind: "youtube" as const, id: media.id }
      : fileId
        ? { kind: "file" as const, fileId }
        : null;
  const ours = !!dock?.source && !!media && dock.keyOf(dock.source) === dock.keyOf(media);
  const duration = ours ? Math.floor(dock?.duration ?? 0) : 0;

  const refresh = useCallback(async () => {
    const r = await listTranscriptsAction(resourceId).catch(() => null);
    if (r?.ok) setList(r.data);
  }, [resourceId]);
  useEffect(() => {
    let alive = true;
    void listTranscriptsAction(resourceId).then((r) => {
      if (alive && r.ok) setList(r.data);
    });
    return () => {
      alive = false;
    };
  }, [resourceId]);

  const run = useCallback(
    async (id: string) => {
      setRunning(id);
      stop.current = false;
      try {
        let failures = 0;
        for (;;) {
          if (stop.current) break;
          const r = await stepTranscriptAction(id).catch(() => null);
          if (!r || !r.ok) {
            const code = r && !r.ok ? r.code : "INTERNAL";
            // Network hiccups and slow answers: wait and try the same step again.
            const transient = code === "INTERNAL" || code === "AI_UNAVAILABLE";
            if (transient && ++failures <= 3) {
              await new Promise((ok) => setTimeout(ok, 5000 * failures));
              continue;
            }
            toast.error(te(code));
            break;
          }
          failures = 0;
          setList((cur) => (cur ?? []).map((x) => (x.id === id ? r.data : x)));
          if (r.data.status === "done") {
            toast.success(t("fullReady"));
            break;
          }
        }
      } finally {
        setRunning(null);
        void refresh();
      }
    },
    [refresh, t, te],
  );

  const begin = async (secs: number) => {
    if (!source) return;
    const r = await startTranscriptAction({
      resourceId,
      source,
      mode,
      deep,
      durationSeconds: secs,
    });
    setWaiting(false);
    if (!r.ok) return toast.error(te(r.code));
    setList((cur) => [r.data, ...(cur ?? [])]);
    void run(r.data.id);
  };

  // The length comes from the player: open it (paused) when needed.
  useEffect(() => {
    if (!waiting || !duration) return;
    void Promise.resolve(duration).then(begin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, duration]);
  const start = () => {
    if (duration) return void begin(duration);
    if (media) dock?.open(media, { autoplay: false });
    setWaiting(true);
  };

  const insert = async (id: string) => {
    const r = await transcriptTextAction(id);
    if (!r.ok) return toast.error(te(r.code));
    editor
      .chain()
      .insertContentAt(
        editor.state.doc.content.size,
        markdownToNodes(r.data.text) as JSONContent[],
        {
          updateSelection: false,
        },
      )
      .run();
    toast.success(t("inserted"));
  };
  const remove = async (id: string) => {
    if (running === id) stop.current = true;
    const r = await deleteTranscriptAction(id);
    if (r.ok) setList((cur) => (cur ?? []).filter((x) => x.id !== id));
  };

  if (!media) return <p className="text-muted p-3 text-sm">{t("noMedia")}</p>;
  if (!source) return <p className="text-warning p-3 text-xs">{t("cannotCapture")}</p>;

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <p className="text-muted text-xs">{t("fullHint")}</p>
      <button
        type="button"
        disabled={!!running || waiting}
        onClick={start}
        className="bg-primary text-primary-foreground flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium disabled:opacity-60"
      >
        {waiting ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
        {waiting ? t("fullGettingLength") : t("fullStart")}
      </button>

      <ul className="flex flex-col gap-2">
        {(list ?? []).map((x) => {
          const pct = x.status === "done" ? 100 : Math.round((x.done / x.durationSeconds) * 100);
          const busy = running === x.id;
          return (
            <li key={x.id} className="border-border rounded-lg border p-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">
                  {t(x.mode === "notes" ? "modeNotes" : "modeTranscript")}
                </span>
                <span className="text-muted tabular-nums">{fmtClock(x.durationSeconds)}</span>
                <button
                  type="button"
                  onClick={() => void remove(x.id)}
                  className="text-muted hover:text-danger ml-auto rounded p-0.5"
                  aria-label={t("delete")}
                  title={t("delete")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {x.status !== "done" && (
                <>
                  <div className="bg-surface-2 mt-2 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-[width]"
                      style={{ width: `${Math.max(busy && !x.studied ? 3 : 0, pct)}%` }}
                    />
                  </div>
                  <div className="text-muted mt-1 flex items-center gap-1.5 text-xs">
                    {busy && <Loader2 className="size-3.5 animate-spin" />}
                    {!x.studied
                      ? t(busy ? "fullStudying" : "fullNotStarted")
                      : x.done >= x.durationSeconds - 1
                        ? t("fullFinishing")
                        : t("fullProgress", {
                            done: fmtClock(x.done),
                            total: fmtClock(x.durationSeconds),
                          })}
                    {x.error && <span className="text-danger">· {te(x.error as "INTERNAL")}</span>}
                    {!busy && !running && (
                      <button
                        type="button"
                        onClick={() => void run(x.id)}
                        className="text-primary ml-auto font-medium hover:underline"
                      >
                        {t("fullResume")}
                      </button>
                    )}
                    {busy && (
                      <button
                        type="button"
                        onClick={() => (stop.current = true)}
                        className="text-muted hover:text-foreground ml-auto"
                      >
                        {t("stop")}
                      </button>
                    )}
                  </div>
                </>
              )}
              {x.status === "done" && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {(["pdf", "docx", "md", "txt"] as const).map((f) => (
                    <a
                      key={f}
                      href={`/api/export/transcript/${x.id}?format=${f}`}
                      className="border-border hover:bg-surface-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
                    >
                      <Download className="size-3" />
                      {f === "docx" ? "Word" : f.toUpperCase()}
                    </a>
                  ))}
                  <SmallBtn onClick={() => void insert(x.id)} icon={<CornerDownLeft />}>
                    {t("insert")}
                  </SmallBtn>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-muted text-[11px]">{t("fullNote")}</p>
    </div>
  );
}
