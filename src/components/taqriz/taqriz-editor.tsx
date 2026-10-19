"use client";
import { getShortcuts, matches } from "@/lib/shortcuts";
import { AiPanel, type AskRequest, type PanelTab } from "./ai-panel";
import { useMediaDock, type DockSource, type StampEvent } from "@/components/media/media-dock";
import { Placeholder } from "@tiptap/extensions";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { findWrapping } from "@tiptap/pm/transform";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  ArrowLeft,
  Bold,
  BookmarkPlus,
  Check,
  CloudOff,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  ListTree,
  Loader2,
  Mic,
  Paperclip,
  Pilcrow,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { saveNoteAction, saveWriteupAction } from "@/app/actions/personal";
import { ExportMenu } from "@/components/export/export-menu";
import { Cover } from "@/components/library/cover";
import { fmtSeconds, useRecorder } from "@/components/media/use-recorder";
import { uploadMedia } from "@/lib/upload-media";
import { AudioNode, FileNode, ImageNode } from "./media-nodes";
import { cn } from "@/lib/cn";
import { countWords, sanitizeDoc, type WriteupDoc } from "@/lib/writeup-doc";

type Draft = { doc: WriteupDoc; base: string | null; at: number };
type SaveState = "idle" | "dirty" | "saving" | "saved" | "offline" | "conflict";
type Chapter = { pos: number; level: number; text: string };

const draftKey = (id: string) => `nn:taqriz:${id}`;
function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(id: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(draftKey(id), JSON.stringify(d));
    else localStorage.removeItem(draftKey(id));
  } catch {
    /* storage full / blocked: the server copy still exists */
  }
}

function chaptersOf(editor: Editor | null): Chapter[] {
  if (!editor) return [];
  const out: Chapter[] = [];
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim())
      out.push({ pos, level: node.attrs.level as number, text: node.textContent.trim() });
  });
  return out;
}

function Tool({
  on,
  label,
  onClick,
  disabled,
  children,
}: {
  on?: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md transition-colors disabled:opacity-35",
        on ? "bg-primary-soft text-primary" : "text-foreground/75 hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Taqriz: one free-form document per resource. Write plainly, or turn any
 * line / selected sentence into a chapter — chapters build the outline on the
 * left. Autosaves; works offline (draft kept on the device, synced later).
 */
const OUTLINE_KEY = "nn:taqriz-outline";
function readOutline() {
  try {
    return localStorage.getItem(OUTLINE_KEY) === "hidden";
  } catch {
    return false;
  }
}
function subscribeOutline(cb: () => void) {
  window.addEventListener(OUTLINE_KEY, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(OUTLINE_KEY, cb);
    window.removeEventListener("storage", cb);
  };
}

export function TaqrizEditor({
  resource,
  initial,
  focusQuery,
  userId,
  media,
}: {
  media?: DockSource | null;
  resource: { id: string; title: string; type: string; cover: string | null; authors: string };
  initial: { doc: WriteupDoc | null; updatedAt: string | null };
  focusQuery?: string | null;
  userId: string;
}) {
  const t = useTranslations("taqriz");
  const [state, setState] = useState<SaveState>("idle");
  const base = useRef<string | null>(initial.updatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const conflicted = useRef(false);
  const [activePos, setActivePos] = useState<number | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const pickImage = useRef<HTMLInputElement>(null);
  const pickFile = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const rec = useRecorder();
  const keyActions = useRef<{
    quote: () => void;
    chapter: (l: 2 | 3) => void;
    ask: () => void;
  } | null>(null);
  // AI side panel: stays mounted once opened, so listening goes on when hidden.
  const [ai, setAi] = useState<{ open: boolean; mounted: boolean; tab: PanelTab }>({
    open: false,
    mounted: false,
    tab: "ask",
  });
  const [askReq, setAskReq] = useState<AskRequest | null>(null);
  const openAi = (tab: PanelTab) => setAi({ open: true, mounted: true, tab });
  // The outline column can be folded away for a wider page (remembered on this device).
  const outlineHidden = useSyncExternalStore(
    subscribeOutline,
    () => readOutline(),
    () => false,
  );
  const setOutlineHidden = (v: boolean) => {
    try {
      localStorage.setItem(OUTLINE_KEY, v ? "hidden" : "shown");
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event(OUTLINE_KEY));
  };
  useEffect(() => {
    const root = document.documentElement.style;
    if (ai.open) root.setProperty("--ai-panel", "24rem");
    else root.removeProperty("--ai-panel");
    return () => {
      root.removeProperty("--ai-panel");
    };
  }, [ai.open]);
  const dock = useMediaDock();
  const dockActive = !!(media && dock?.source && dock.keyOf(dock.source) === dock.keyOf(media));
  const stopRecording = async () => {
    const r = await rec.stop();
    if (r) await insertFiles([r.blob], [r.name]);
  };
  /** "Keep mine" after a conflict re-runs save with force (set below). */
  const retry = useRef<((e: Editor, force: boolean) => Promise<void>) | null>(null);

  const save = useCallback(
    async (editor: Editor, force = false) => {
      if (saving.current) return;
      const doc = sanitizeDoc(editor.getJSON());
      writeDraft(resource.id, { doc, base: base.current, at: Date.now() });
      // Waiting for the user's choice: keep the draft locally, don't retry.
      if (conflicted.current && !force) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setState("offline");
        return;
      }
      saving.current = true;
      setState("saving");
      try {
        const r = await saveWriteupAction(resource.id, doc, {
          baseUpdatedAt: base.current,
          force,
        });
        if (r.ok) {
          conflicted.current = false;
          toast.dismiss("taqriz-conflict");
          base.current = r.data.updatedAt;
          writeDraft(resource.id, null);
          setState("saved");
        } else if (r.code === "CONFLICT") {
          setState("conflict");
          conflicted.current = true;
          toast.warning(t("conflict"), {
            id: "taqriz-conflict",
            duration: Infinity,
            action: { label: t("keepMine"), onClick: () => void retry.current?.(editor, true) },
            cancel: { label: t("loadTheirs"), onClick: () => location.reload() },
          });
        } else setState("dirty");
      } catch {
        setState("offline");
      } finally {
        saving.current = false;
      }
    },
    [resource.id, t],
  );

  useEffect(() => {
    retry.current = save;
  }, [save]);

  // A device draft newer than the server copy wins (it was written offline).
  const start = useMemo(() => {
    if (typeof window === "undefined") return { doc: initial.doc, draft: null as Draft | null };
    const d = readDraft(resource.id);
    if (d && (!initial.updatedAt || d.at > new Date(initial.updatedAt).getTime()))
      return { doc: d.doc, draft: d };
    if (d) writeDraft(resource.id, null); // older than the server copy: discard
    return { doc: initial.doc, draft: null };
  }, [initial.doc, initial.updatedAt, resource.id]);
  const startDoc = start.doc;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https"] },
      }),
      ImageNode,
      AudioNode,
      FileNode,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" ? t("chapterPlaceholder") : t("placeholder"),
      }),
    ],
    content: startDoc ?? undefined,
    editorProps: {
      attributes: { class: "taqriz-doc", "aria-label": t("title"), spellcheck: "true" },
      // Quote / chapter shortcuts (Settings) act on exactly the selected text, like the buttons.
      handleKeyDown: (_view, e) => {
        const k = getShortcuts();
        const act = matches(e, k.quote)
          ? () => keyActions.current?.quote()
          : matches(e, k.askAi)
            ? () => keyActions.current?.ask()
            : matches(e, k.chapter)
              ? () => keyActions.current?.chapter(2)
              : matches(e, k.subchapter)
                ? () => keyActions.current?.chapter(3)
                : null;
        if (!act) return false;
        act();
        return true;
      },
      // Drop or paste files straight into the document.
      handleDrop: (_view, event) => {
        const list = (event as DragEvent).dataTransfer?.files;
        if (!list?.length) return false;
        event.preventDefault();
        void insertFiles([...list]);
        return true;
      },
      handlePaste: (_view, event) => {
        const imgs = [...(event.clipboardData?.files ?? [])].filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!imgs.length) return false;
        void insertFiles(imgs);
        return true;
      },
    },
    // Nudge useEditorState once so the outline / word count show immediately
    // (a meta-only transaction: no doc change, so no save).
    onCreate: ({ editor }) => editor.view.dispatch(editor.state.tr.setMeta("nn-init", true)),
    onUpdate: ({ editor }) => {
      setState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(editor), 1100);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Unsynced draft from an earlier offline session → push it now.
  useEffect(() => {
    if (!editor) return;
    let pushDraft: ReturnType<typeof setTimeout> | undefined;
    if (start.draft) {
      base.current = start.draft.base;
      pushDraft = setTimeout(() => void save(editor), 0);
    }
    const online = () => {
      if (readDraft(resource.id)) void save(editor);
    };
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        writeDraft(resource.id, {
          doc: sanitizeDoc(editor.getJSON()),
          base: base.current,
          at: Date.now(),
        });
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(pushDraft);
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [editor, resource.id, save, start.draft]);

  // Jump to a search hit (?q=…).
  // Time stamp from the media dock (button or Alt+T) goes in at the cursor.
  useEffect(() => {
    if (!editor) return;
    const onStamp = (e: Event) => {
      const ev = e as StampEvent;
      editor.chain().focus().insertContent(`[${ev.detail.label}] `).run();
      ev.detail.handled = true;
    };
    window.addEventListener("nn:media-stamp", onStamp);
    return () => window.removeEventListener("nn:media-stamp", onStamp);
  }, [editor]);

  useEffect(() => {
    if (!editor || !focusQuery) return;
    const needle = focusQuery.toLowerCase().split(/\s+/)[0];
    if (!needle) return;
    let found: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found !== null || !node.isText) return found === null;
      const i = node.text!.toLowerCase().indexOf(needle);
      if (i >= 0) found = pos + i;
      return false;
    });
    if (found !== null) {
      const from = found as number;
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to: from + needle.length })
        .scrollIntoView()
        .run();
    }
  }, [editor, focusQuery]);

  const info = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            chapters: chaptersOf(e),
            words: countWords(e.state.doc.textBetween(0, e.state.doc.content.size, " ")),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  // Highlight the chapter being read.
  useEffect(() => {
    if (!editor) return;
    const onScroll = () => {
      let current: number | null = null;
      for (const c of chaptersOf(editor)) {
        const el = editor.view.nodeDOM(c.pos) as HTMLElement | null;
        if (el && el.getBoundingClientRect().top < 160) current = c.pos;
      }
      setActivePos(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [editor, info?.chapters.length]);

  const goTo = (pos: number) => {
    if (!editor) return;
    const el = editor.view.nodeDOM(pos) as HTMLElement | null;
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 1)
      .run();
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOutlineOpen(false);
  };

  /** Selected words → their own chapter; no selection → the current line. */
  /**
   * Cuts the document exactly at the selection's start and end (also across
   * paragraphs and inside text pasted as one block with line breaks), removes
   * the line breaks left at the cut, and returns the range of whole blocks that
   * now hold exactly the selected text.
   */
  const isolateSelection = (tr: Transaction) => {
    const sel = tr.selection;
    let from = sel.from;
    let to = sel.to;
    const brk = (n: PMNode | null | undefined) => n?.type.name === "hardBreak";
    // Trim line breaks / spaces selected at the edges.
    while (from < to && brk(tr.doc.resolve(from).nodeAfter)) from++;
    while (to > from && brk(tr.doc.resolve(to).nodeBefore)) to--;
    if (from >= to) return null;
    // End side first so earlier positions stay valid.
    let $to = tr.doc.resolve(to);
    if ($to.parent.isTextblock) {
      let b = to;
      while (b < $to.end() && brk(tr.doc.resolve(b).nodeAfter)) b++;
      if (b > to) tr.delete(to, b);
      $to = tr.doc.resolve(to);
      if (to < $to.end()) tr.split(to);
    }
    let $from = tr.doc.resolve(from);
    if ($from.parent.isTextblock) {
      let a = from;
      while (a > $from.start() && brk(tr.doc.resolve(a).nodeBefore)) a--;
      if (a < from) {
        tr.delete(a, from);
        to -= from - a;
        from = a;
      }
      $from = tr.doc.resolve(from);
      if (from > $from.start()) {
        tr.split(from);
        from += 2;
        to += 2;
      }
    }
    return tr.doc.resolve(from).blockRange(tr.doc.resolve(to));
  };

  /** Selected words → their own chapter; no selection → the current line. */
  const makeChapter = (level: 2 | 3) => {
    if (!editor) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().toggleHeading({ level }).run();
      return;
    }
    const tr = editor.state.tr;
    const range = isolateSelection(tr);
    if (!range) return;
    tr.setBlockType(range.start, range.end, editor.schema.nodes.heading, { level });
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  };

  /** Exactly the selected words become a quote (or leave it, if already quoted). */
  const makeQuote = () => {
    if (!editor) return;
    if (editor.isActive("blockquote")) {
      editor.chain().focus().lift("blockquote").run();
      return;
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().toggleBlockquote().run();
      return;
    }
    const tr = editor.state.tr;
    const range = isolateSelection(tr);
    if (!range) return;
    const wrapping = findWrapping(range, editor.schema.nodes.blockquote);
    if (!wrapping) return;
    tr.wrap(range, wrapping);
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  };

  /** Selected text (+ its paragraph as context) → the AI panel. */
  const askAi = () => {
    if (!editor) return;
    const { from, to, $from, $to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!selection) return openAi("ask");
    const context = editor.state.doc.textBetween($from.start(), $to.end(), "\n").slice(0, 3000);
    setAskReq({ selection: selection.slice(0, 4000), context, n: Date.now() });
    openAi("ask");
  };

  useEffect(() => {
    keyActions.current = { quote: makeQuote, chapter: makeChapter, ask: askAi };
  });

  /** The selection becomes a quote here AND is kept in "Notes & quotes" for this book. */
  const saveAsQuote = async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!text) return;
    const r = await saveNoteAction({
      kind: "quote",
      quoteText: text.slice(0, 10_000),
      resourceId: resource.id,
    });
    if (!r.ok) return toast.error(t("quoteSaveFailed"));
    if (!editor.isActive("blockquote")) makeQuote();
    toast.success(t("quoteSaved"));
  };

  const addChapter = () => {
    if (!editor) return;
    const end = editor.state.doc.content.size;
    editor
      .chain()
      .insertContentAt(end, [{ type: "heading", attrs: { level: 2 } }, { type: "paragraph" }])
      .focus(end + 1)
      .scrollIntoView()
      .run();
  };

  /** Upload → insert as image / audio / file block at the cursor. */
  async function insertFiles(list: (File | Blob)[], names?: string[]) {
    for (const [i, f] of list.entries()) {
      const name = names?.[i] ?? (f instanceof File ? f.name : "file");
      const id = toast.loading(t("uploading", { name }));
      try {
        const up = await uploadMedia(f, { userId, name, resourceId: resource.id });
        const type = up.mime.startsWith("image/")
          ? "image"
          : up.mime.startsWith("audio/")
            ? "audio"
            : "file";
        editorRef.current
          ?.chain()
          .focus()
          .insertContent([
            {
              type,
              attrs: {
                fileId: up.fileId,
                name: up.name,
                ...(type === "file" ? { mime: up.mime } : {}),
              },
            },
            { type: "paragraph" },
          ])
          .run();
        toast.success(t("added", { name }), { id });
      } catch {
        toast.error(t("uploadFailed"), { id });
      }
    }
  }

  /** Saves pending edits before an export so the file has the latest text. */
  const flush = async () => {
    if (!editor) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await save(editor);
  };

  const chapters = info?.chapters ?? [];
  const status =
    state === "saving" ? (
      <>
        <Loader2 className="size-3 animate-spin" /> {t("saving")}
      </>
    ) : state === "saved" ? (
      <>
        <Check className="text-success size-3" /> {t("saved")}
      </>
    ) : state === "offline" ? (
      <>
        <CloudOff className="text-warning size-3" /> {t("savedOffline")}
      </>
    ) : state === "conflict" ? (
      <span className="text-warning">{t("conflictShort")}</span>
    ) : state === "dirty" ? (
      t("unsaved")
    ) : null;

  const outline = (
    <nav aria-label={t("contents")} className="flex flex-col">
      {chapters.length === 0 ? (
        <p className="text-muted px-3 py-2 text-xs leading-relaxed">{t("noChapters")}</p>
      ) : (
        <ol className="flex flex-col">
          {chapters.map((c, i) => {
            const on = c.pos === activePos;
            return (
              <li key={`${c.pos}-${i}`}>
                <button
                  type="button"
                  onClick={() => goTo(c.pos)}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-baseline gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors",
                    c.level === 3 ? "pl-8 text-[13px]" : "pl-4",
                    on
                      ? "text-primary bg-primary-soft font-semibold"
                      : "text-foreground/80 hover:bg-surface-2",
                  )}
                >
                  {on && (
                    <span
                      aria-hidden
                      className="bg-primary absolute top-1.5 bottom-1.5 left-1 w-[3px] rounded-full"
                    />
                  )}
                  <span className="line-clamp-2">{c.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        onClick={addChapter}
        className="text-primary hover:bg-primary-soft mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium"
      >
        <Heading2 className="size-4" /> {t("addChapter")}
      </button>
    </nav>
  );

  return (
    <div
      className={cn(
        "-mx-4 -my-6 grid min-h-[calc(100dvh-3.5rem)] sm:-mx-6 sm:-my-8",
        outlineHidden ? "lg:grid-cols-[3rem_1fr]" : "lg:grid-cols-[17rem_1fr]",
      )}
    >
      {outlineHidden && (
        <aside className="border-border bg-surface/60 hidden flex-col items-center gap-1 border-r py-3 lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-3.5rem)]">
          <button
            type="button"
            onClick={() => setOutlineHidden(false)}
            className="text-muted hover:text-foreground hover:bg-surface-2 grid size-8 place-items-center rounded-md"
            aria-label={t("showOutline")}
            title={t("showOutline")}
          >
            <PanelLeftOpen className="size-4" />
          </button>
          <Link
            href={`/library/${resource.id}`}
            className="text-muted hover:text-foreground hover:bg-surface-2 grid size-8 place-items-center rounded-md"
            aria-label={t("back")}
            title={t("back")}
          >
            <ArrowLeft className="size-4" />
          </Link>
        </aside>
      )}
      <aside
        className={cn(
          "border-border bg-surface/60 hidden flex-col border-r lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)]",
          !outlineHidden && "lg:flex",
        )}
      >
        <div className="relative flex items-start gap-3 p-4 pr-9">
          <button
            type="button"
            onClick={() => setOutlineHidden(true)}
            className="text-muted hover:text-foreground hover:bg-surface-2 absolute top-3 right-2 grid size-7 place-items-center rounded-md"
            aria-label={t("hideOutline")}
            title={t("hideOutline")}
          >
            <PanelLeftClose className="size-4" />
          </button>
          <Cover
            type={resource.type as "book"}
            title={resource.title}
            src={resource.cover}
            size="sm"
          />
          <div className="min-w-0">
            <Link
              href={`/library/${resource.id}`}
              className="text-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
            >
              <ArrowLeft className="size-3" /> {t("back")}
            </Link>
            <div className="line-clamp-2 text-sm leading-snug font-semibold">{resource.title}</div>
            {resource.authors && (
              <div className="text-muted truncate text-xs">{resource.authors}</div>
            )}
            {media && (
              <button
                type="button"
                onClick={() => (dockActive ? dock?.toggle() : dock?.open(media))}
                className="text-primary hover:bg-primary-soft mt-1.5 -ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium"
              >
                {dockActive && dock?.playing ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {dockActive ? (dock?.playing ? t("mediaPause") : t("mediaPlay")) : t("mediaListen")}
              </button>
            )}
          </div>
        </div>
        <div className="text-muted px-4 pb-2 text-[11px] font-semibold tracking-wide uppercase">
          {t("contents")}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">{outline}</div>
      </aside>

      <section className="min-w-0">
        {/* Toolbar */}
        <div className="border-border bg-background/90 sticky top-14 z-20 border-b backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-0.5 overflow-x-auto px-3 py-1.5 sm:px-6 xl:max-w-4xl">
            <Link
              href={`/library/${resource.id}`}
              className="text-muted hover:text-foreground mr-1 grid size-8 shrink-0 place-items-center rounded-md lg:hidden"
              aria-label={t("back")}
            >
              <ArrowLeft className="size-4" />
            </Link>
            {media && (
              <button
                type="button"
                onClick={() => (dockActive ? dock?.toggle() : dock?.open(media))}
                className="text-primary hover:bg-primary-soft mr-1 grid size-8 shrink-0 place-items-center rounded-md lg:hidden"
                aria-label={t("mediaListen")}
              >
                {dockActive && dock?.playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOutlineOpen((o) => !o)}
              className="text-foreground/75 hover:bg-surface-2 mr-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm lg:hidden"
              aria-expanded={outlineOpen}
            >
              <ListTree className="size-4" /> {chapters.length}
            </button>
            <Tool
              label={t("text")}
              on={!info?.h2 && !info?.h3}
              onClick={() => editor?.chain().focus().setParagraph().run()}
            >
              <Pilcrow className="size-4" />
            </Tool>
            <Tool label={t("chapter")} on={info?.h2} onClick={() => makeChapter(2)}>
              <Heading2 className="size-4" />
            </Tool>
            <Tool label={t("subchapter")} on={info?.h3} onClick={() => makeChapter(3)}>
              <Heading3 className="size-4" />
            </Tool>
            <span className="bg-border mx-1 h-5 w-px shrink-0" />
            <Tool
              label={t("bold")}
              on={info?.bold}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold className="size-4" />
            </Tool>
            <Tool
              label={t("italic")}
              on={info?.italic}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic className="size-4" />
            </Tool>
            <Tool
              label={t("underline")}
              on={info?.underline}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="size-4" />
            </Tool>
            <Tool
              label={t("strike")}
              on={info?.strike}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="size-4" />
            </Tool>
            <span className="bg-border mx-1 h-5 w-px shrink-0" />
            <Tool
              label={t("bullets")}
              on={info?.bullet}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List className="size-4" />
            </Tool>
            <Tool
              label={t("numbers")}
              on={info?.ordered}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="size-4" />
            </Tool>
            <Tool label={t("quote")} on={info?.quote} onClick={makeQuote}>
              <Quote className="size-4" />
            </Tool>
            <span className="bg-border mx-1 h-5 w-px shrink-0" />
            <Tool
              label={t("undo")}
              disabled={!info?.canUndo}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              <Undo2 className="size-4" />
            </Tool>
            <Tool
              label={t("redo")}
              disabled={!info?.canRedo}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              <Redo2 className="size-4" />
            </Tool>
            <span className="bg-border mx-1 h-5 w-px shrink-0" />
            <input
              ref={pickImage}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void insertFiles([...e.target.files]);
                e.target.value = "";
              }}
            />
            <input
              ref={pickFile}
              type="file"
              accept="application/pdf,audio/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void insertFiles([...e.target.files]);
                e.target.value = "";
              }}
            />
            <Tool label={t("addImage")} onClick={() => pickImage.current?.click()}>
              <ImagePlus className="size-4" />
            </Tool>
            <Tool
              label={
                rec.state === "denied" || rec.state === "nomic" || rec.state === "error"
                  ? t(
                      rec.state === "denied"
                        ? "micDenied"
                        : rec.state === "nomic"
                          ? "noMic"
                          : "micError",
                    )
                  : t("recordAudio")
              }
              on={rec.state === "recording"}
              onClick={() => (rec.state === "recording" ? void stopRecording() : void rec.start())}
            >
              <Mic className="size-4" />
            </Tool>
            <Tool label={t("addFile")} onClick={() => pickFile.current?.click()}>
              <Paperclip className="size-4" />
            </Tool>
            <Tool
              label={t("aiPanel")}
              on={ai.open}
              onClick={() => (ai.open ? setAi((a) => ({ ...a, open: false })) : openAi(ai.tab))}
            >
              <Sparkles className="size-4" />
            </Tool>
            <span className="text-muted ml-auto flex shrink-0 items-center gap-3 pl-3 text-xs">
              <ExportMenu
                resourceId={resource.id}
                beforeDownload={flush}
                variant="ghost"
                className="h-8"
              />
              <span className="hidden tabular-nums sm:inline">
                {t("words", { count: info?.words ?? 0 })}
              </span>
              <span className="inline-flex items-center gap-1" aria-live="polite">
                {status}
              </span>
            </span>
          </div>
          {rec.state === "recording" && (
            <div className="border-border mx-auto flex max-w-3xl items-center gap-3 border-t px-4 py-2 sm:px-6">
              <span className="bg-danger size-2.5 animate-pulse rounded-full" />
              <span className="text-sm font-medium tabular-nums">{fmtSeconds(rec.seconds)}</span>
              <span className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded-full">
                <span
                  className="bg-danger block h-full rounded-full"
                  style={{ width: `${Math.round(rec.level * 100)}%` }}
                />
              </span>
              <button
                type="button"
                className="text-muted text-sm hover:underline"
                onClick={rec.cancel}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="bg-danger rounded-lg px-3 py-1 text-sm font-medium text-white"
                onClick={() => void stopRecording()}
              >
                {t("stop")}
              </button>
            </div>
          )}
          {outlineOpen && (
            <div className="border-border mx-auto max-w-3xl border-t px-3 py-2 lg:hidden">
              {outline}
            </div>
          )}
        </div>

        <div className="mx-auto max-w-3xl px-4 pt-8 pb-32 sm:px-10 xl:max-w-4xl">
          <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
            {t("title")}
          </p>
          <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">{resource.title}</h1>
          {editor && (
            <BubbleMenu
              editor={editor}
              shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive("heading")}
              className="border-border bg-surface flex items-center gap-0.5 rounded-xl border p-1 shadow-lg"
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => makeChapter(2)}
                className="bg-primary text-primary-foreground flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium"
              >
                <Heading2 className="size-4" /> {t("makeChapter")}
              </button>
              <Tool
                label={t("bold")}
                on={info?.bold}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="size-4" />
              </Tool>
              <Tool
                label={t("italic")}
                on={info?.italic}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="size-4" />
              </Tool>
              <Tool label={t("quote")} on={info?.quote} onClick={makeQuote}>
                <Quote className="size-4" />
              </Tool>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void saveAsQuote()}
                className="text-foreground/80 hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm"
                title={t("saveQuoteHint")}
              >
                <BookmarkPlus className="size-4 text-[var(--c-violet)]" /> {t("saveQuote")}
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={askAi}
                className="text-foreground/80 hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm"
                title={t("askSelectionHint")}
              >
                <Sparkles className="text-primary size-4" /> {t("askSelection")}
              </button>
            </BubbleMenu>
          )}
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="flex flex-col gap-3" aria-hidden>
              <div className="bg-surface-2 h-5 w-2/3 animate-pulse rounded" />
              <div className="bg-surface-2 h-4 w-full animate-pulse rounded" />
              <div className="bg-surface-2 h-4 w-5/6 animate-pulse rounded" />
            </div>
          )}
          <Link
            href={`/assistant`}
            className="text-muted hover:text-primary mt-10 inline-flex items-center gap-1.5 text-xs"
          >
            <Sparkles className="size-3.5" /> {t("askAi")}
          </Link>
        </div>
      </section>
      {editor && ai.mounted && (
        <aside
          aria-label={t("aiPanel")}
          className={cn(
            // Phones: overlay under the header. Desktop: docked to the window's right
            // edge; the shell makes room for it via --ai-panel.
            "border-border bg-surface fixed inset-x-0 top-14 bottom-0 z-30 border-l shadow-xl sm:left-auto sm:w-[24rem]",
            "lg:top-0 lg:z-40 lg:w-[var(--ai-panel)] lg:shadow-none",
            !ai.open && "hidden",
          )}
        >
          <AiPanel
            editor={editor}
            resourceId={resource.id}
            media={media ?? null}
            tab={ai.tab}
            setTab={(tab) => setAi((a) => ({ ...a, tab }))}
            ask={askReq}
            onClose={() => setAi((a) => ({ ...a, open: false }))}
          />
        </aside>
      )}
    </div>
  );
}
