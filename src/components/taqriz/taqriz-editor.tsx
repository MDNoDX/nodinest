"use client";
import { Find, findAll, findKey } from "./find";
import { postResume } from "@/lib/resume-client";
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
  ChevronDown,
  ChevronUp,
  Check,
  CloudOff,
  Heading2,
  Heading3,
  Eraser,
  ExternalLink,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  ListTree,
  Loader2,
  Mic,
  MonitorPlay,
  NotebookPen,
  Paperclip,
  Pilcrow,
  Quote,
  Redo2,
  Search,
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
import { importUrlAction } from "@/app/actions/catalog";
import { storageStatusAction } from "@/app/actions/files";
import { saveNoteAction, saveWriteupAction } from "@/app/actions/personal";
import { ExportMenu } from "@/components/export/export-menu";
import { Cover } from "@/components/library/cover";
import { useRecorder } from "@/components/media/use-recorder";
import { uploadMedia } from "@/lib/upload-media";
import { youtubeIdFromUrl } from "@/lib/youtube";
import { FindBar, RecordingBar } from "./bars";
import { NoteMark } from "./note-mark";
import { Outline } from "./outline";
import {
  OUTLINE_KEY,
  authorText,
  chaptersOf,
  readDraft,
  readOutline,
  subscribeOutline,
  todayWords,
  writeDraft,
  type Draft,
  type SaveState,
} from "./taqriz-store";
import { Tool } from "./tool";
import { AudioNode, FileNode, ImageNode, VideoNode, YouTubeNode } from "./media-nodes";
import { YouTubeDialog } from "./youtube-dialog";
import { cn } from "@/lib/cn";
import { countWords, sanitizeDoc, type WriteupDoc } from "@/lib/writeup-doc";

/**
 * Taqriz: one free-form document per resource. Write plainly, or turn any
 * line / selected sentence into a chapter — chapters build the outline on the
 * left. Autosaves; works offline (draft kept on the device, synced later).
 */
export function TaqrizEditor({
  resource,
  initial,
  focusQuery,
  userId,
  media,
  initialAi,
  initialFull,
  resume,
  mode = "taqriz",
  goalWords,
}: {
  /** "book" = the user's own book ("Kitob yozish"). */
  mode?: "taqriz" | "book";
  goalWords?: number | null;
  /** Where the user stopped last time (account-wide). */
  resume?: {
    docPos: number | null;
    docAnchor: string | null;
    media: DockSource | null;
    mediaSeconds: number | null;
  } | null;
  /** Open "Listen" on "Prepare full text". */
  initialFull?: boolean;
  media?: DockSource | null;
  /** Open the AI panel on this tab (e.g. from "Write the taqriz with AI"). */
  initialAi?: PanelTab | null;
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
  const book = mode === "book";
  const backHref = book ? "/write" : `/library/${resource.id}`;
  const keyActions = useRef<{
    quote: () => void;
    note: () => void;
    chapter: (l: 2 | 3) => void;
    ask: () => void;
    find: () => void;
  } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [ytOpen, setYtOpen] = useState(false);
  const [findQ, setFindQ] = useState("");
  const [replaceQ, setReplaceQ] = useState("");
  const findInput = useRef<HTMLInputElement>(null);
  // AI side panel: stays mounted once opened, so listening goes on when hidden.
  const [ai, setAi] = useState<{ open: boolean; mounted: boolean; tab: PanelTab }>({
    open: !!initialAi,
    mounted: !!initialAi,
    tab: initialAi ?? "write",
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
      NoteMark,
      ImageNode,
      AudioNode,
      VideoNode,
      YouTubeNode,
      FileNode,
      Find,
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
        if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === "KeyF") {
          keyActions.current?.find();
          return true;
        }
        const k = getShortcuts();
        const act = matches(e, k.quote)
          ? () => keyActions.current?.quote()
          : matches(e, k.note)
            ? () => keyActions.current?.note()
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
        // A pasted YouTube link becomes a video in the text.
        const pasted = event.clipboardData?.getData("text/plain").trim() ?? "";
        const yt = /^https?:\/\/\S+$/.test(pasted) ? youtubeIdFromUrl(pasted) : null;
        if (yt) {
          insertYouTube(yt);
          return true;
        }
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

  // ── Continue where I stopped (saved to the account) ──
  // Cursor: a text anchor (the words just before it) survives edits elsewhere.
  useEffect(() => {
    if (!editor) return;
    postResume({ resourceId: resource.id, place: "taqriz" });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const anchorAt = (pos: number) => {
      const $p = editor.state.doc.resolve(pos);
      if (!$p.parent.isTextblock) return "";
      const before = editor.state.doc.textBetween(Math.max($p.start(), pos - 48), pos);
      if (before.trim().length >= 8) return `b:${before}`;
      return `a:${editor.state.doc.textBetween(pos, Math.min($p.end(), pos + 48))}`;
    };
    const save = () => {
      const pos = editor.state.selection.head;
      postResume({ resourceId: resource.id, doc: { pos, anchor: anchorAt(pos) } });
    };
    const onSel = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 2000);
    };
    editor.on("selectionUpdate", onSel);
    window.addEventListener("pagehide", save);
    return () => {
      editor.off("selectionUpdate", onSel);
      window.removeEventListener("pagehide", save);
      if (timer) clearTimeout(timer);
    };
  }, [editor, resource.id]);

  // Opening: put the cursor back (unless a search result was asked for) and
  // load the video / audio at the saved second, paused.
  const restored = useRef(false);
  useEffect(() => {
    if (!editor || !resume || restored.current) return;
    restored.current = true;
    if (!focusQuery && (resume.docAnchor || resume.docPos != null)) {
      let pos: number | null = null;
      const a = resume.docAnchor ?? "";
      const text = a.slice(2);
      if (text.trim()) {
        const hits = findAll(editor.state.doc, text);
        if (hits.length) {
          const near = hits.reduce((x, y) =>
            Math.abs(y.from - (resume.docPos ?? 0)) < Math.abs(x.from - (resume.docPos ?? 0))
              ? y
              : x,
          );
          pos = a.startsWith("b:") ? near.to : near.from;
        }
      }
      if (pos == null && resume.docPos != null)
        pos = Math.min(resume.docPos, editor.state.doc.content.size - 1);
      if (pos != null && pos > 1)
        setTimeout(() => {
          editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
          // Keep the line in the middle of the screen, not under the toolbar.
          const dom = editor.view.domAtPos(pos).node as HTMLElement;
          (dom.nodeType === 1 ? dom : dom.parentElement)?.scrollIntoView({ block: "center" });
        }, 50);
    }
    if (resume.media && resume.mediaSeconds && dock && !dock.source)
      dock.open(resume.media, { at: resume.mediaSeconds, autoplay: false });
  }, [editor, resume, focusQuery, dock]);

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
            words: countWords(
              book
                ? authorText(e.state.doc)
                : e.state.doc.textBetween(0, e.state.doc.content.size, " "),
            ),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            note: e.isActive("note"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
            find: (() => {
              const f = findKey.getState(e.state);
              return { total: f?.matches.length ?? 0, index: f?.index ?? 0 };
            })(),
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

  /** Find in this taqriz; a selected word becomes the query. */
  const openFind = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const sel = from !== to ? editor.state.doc.textBetween(from, to, " ").slice(0, 100) : "";
    const q = sel || findQ;
    setFindQ(q);
    setFindOpen(true);
    editor.commands.setFind(q);
    setTimeout(() => {
      findInput.current?.focus();
      findInput.current?.select();
    }, 0);
  };
  const closeFind = () => {
    setFindOpen(false);
    editor?.chain().findFocusCurrent().setFind("").focus().scrollIntoView().run();
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

  /**
   * The quote button: the selection becomes a quote here AND is kept in the
   * site-wide Quotes for this book. Pressing it inside a quote only removes the
   * styling (the saved quote stays).
   */
  const quoteAndSave = async () => {
    if (!editor) return;
    if (editor.isActive("blockquote")) {
      editor.chain().focus().lift("blockquote").run();
      return;
    }
    const { from, to, $from } = editor.state.selection;
    const text = (
      from !== to ? editor.state.doc.textBetween(from, to, "\n") : $from.parent.textContent
    ).trim();
    makeQuote();
    if (!text) return;
    const r = await saveNoteAction({
      kind: "quote",
      quoteText: text.slice(0, 10_000),
      resourceId: resource.id,
    });
    if (!r.ok) return toast.error(t("quoteSaveFailed"));
    toast.success(t("quoteSaved"), {
      action: { label: t("open"), onClick: () => window.open(`/notes/${r.data}`, "_blank") },
    });
  };

  /**
   * "Qaydnomaga": the selection is saved as a note (in Notes, linked to this
   * book) and highlighted here in the note colour, linked to that note.
   */
  const saveAsNote = async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!text) return;
    const r = await saveNoteAction({
      kind: "note",
      body: text.slice(0, 50_000),
      resourceId: resource.id,
    });
    if (!r.ok) return toast.error(t("noteSaveFailed"));
    // Highlight it, unless the text moved while saving.
    if (
      to <= editor.state.doc.content.size &&
      editor.state.doc.textBetween(from, to, "\n").trim() === text
    )
      editor
        .chain()
        .setTextSelection({ from, to })
        .setMark("note", { noteId: r.data })
        .setTextSelection(to)
        .focus()
        .run();
    toast.success(t("noteSaved"), {
      action: { label: t("open"), onClick: () => window.open(`/notes/${r.data}`, "_blank") },
    });
  };

  useEffect(() => {
    keyActions.current = {
      quote: () => void quoteAndSave(),
      note: () => void saveAsNote(),
      chapter: makeChapter,
      ask: askAi,
      find: openFind,
    };
  });

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

  function insertYouTube(videoId: string) {
    editorRef.current
      ?.chain()
      .focus()
      .insertContent([{ type: "youtube", attrs: { videoId } }, { type: "paragraph" }])
      .run();
    // Then fill in the video's title (shown under it and in exports).
    void importUrlAction(`https://www.youtube.com/watch?v=${videoId}`).then((r) => {
      const ed = editorRef.current;
      if (!r.ok || !r.data.title || !ed) return;
      const tr = ed.state.tr;
      ed.state.doc.descendants((n, pos) => {
        if (n.type.name === "youtube" && n.attrs.videoId === videoId && !n.attrs.title)
          tr.setNodeMarkup(pos, undefined, { ...n.attrs, title: r.data.title });
      });
      if (tr.docChanged) ed.view.dispatch(tr);
    });
  }

  /** Upload → insert as image / audio / video / file block at the cursor. */
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
            : up.mime.startsWith("video/")
              ? "video"
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
        // A full upload space gets a way out: download with media, then clean up.
        const st = await storageStatusAction();
        const full = st.ok && st.data.used + f.size > st.data.quota;
        toast.error(full ? t("spaceFull") : t("uploadFailed"), {
          id,
          description: full ? t("spaceFullHint") : undefined,
          duration: full ? 12_000 : undefined,
        });
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
  const today = book && info ? todayWordsSafe(resource.id, info.words) : 0;
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
    <Outline
      chapters={chapters}
      activePos={activePos}
      onGo={goTo}
      onAdd={addChapter}
      showWords={book}
    />
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
          <button
            type="button"
            onClick={openFind}
            className="text-muted hover:text-foreground hover:bg-surface-2 grid size-8 place-items-center rounded-md"
            aria-label={t("find")}
            title={t("find")}
          >
            <Search className="size-4" />
          </button>
          <Link
            href={backHref}
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
              href={backHref}
              className="text-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
            >
              <ArrowLeft className="size-3" /> {book ? t("backToBooks") : t("back")}
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
        {/* Find in this taqriz — always visible here (⌘F opens the bar with replace). */}
        <div className="px-3 pb-3">
          <label
            htmlFor="taqriz-find-side"
            className="text-muted mb-1 block px-1 text-[11px] font-semibold tracking-wide uppercase"
          >
            {t("findSideLabel")}
          </label>
          <div className="relative">
            <Search className="text-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <input
              id="taqriz-find-side"
              value={findQ}
              placeholder={t("findSidePlaceholder")}
              onChange={(e) => {
                setFindQ(e.target.value);
                editor?.commands.setFind(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editor?.commands.findStep(e.shiftKey ? -1 : 1);
                } else if (e.key === "Escape") closeFind();
              }}
              className="border-border-strong bg-surface focus-visible:outline-ring/40 h-9 w-full rounded-lg border pr-2 pl-8 text-sm"
            />
          </div>
          {findQ && editor && (
            <div className="text-muted mt-1 flex items-center gap-1 px-1 text-xs">
              <span className="tabular-nums">
                {info?.find.total
                  ? t("findCount", { n: info.find.index + 1, total: info.find.total })
                  : t("findNone")}
              </span>
              <button
                type="button"
                onClick={() => editor.commands.findStep(-1)}
                className="hover:text-foreground hover:bg-surface-2 ml-auto rounded p-0.5"
                aria-label={t("findPrev")}
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => editor.commands.findStep(1)}
                className="hover:text-foreground hover:bg-surface-2 rounded p-0.5"
                aria-label={t("findNext")}
              >
                <ChevronDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={openFind}
                className="hover:text-foreground hover:bg-surface-2 rounded px-1 py-0.5"
                title={t("find")}
              >
                {t("replace")}
              </button>
            </div>
          )}
        </div>
        {book && goalWords ? (
          <div className="px-4 pb-3">
            <div className="text-muted mb-1 flex justify-between text-[11px] font-semibold tracking-wide uppercase">
              <span>{t("goal")}</span>
              <span className="tabular-nums">
                {Math.min(100, Math.round(((info?.words ?? 0) / goalWords) * 100))}%
              </span>
            </div>
            <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-[width]"
                style={{ width: `${Math.min(100, ((info?.words ?? 0) / goalWords) * 100)}%` }}
              />
            </div>
            <div className="text-muted mt-1 text-xs tabular-nums">
              {t("goalProgress", { words: info?.words ?? 0, goal: goalWords })}
            </div>
          </div>
        ) : null}
        {book && today > 0 && (
          <p className="px-4 pb-3 text-xs font-medium text-[var(--c-emerald)] tabular-nums">
            {t("today", { n: today })}
          </p>
        )}
        <div className="text-muted px-4 pb-2 text-[11px] font-semibold tracking-wide uppercase">
          {book ? t("chapters") : t("contents")}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">{outline}</div>
      </aside>

      <section className="min-w-0">
        {/* Toolbar */}
        <div className="border-border bg-background/90 sticky top-14 z-20 border-b backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-0.5 overflow-x-auto px-3 py-1.5 sm:px-6 xl:max-w-4xl">
            <Link
              href={backHref}
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
            <Tool label={t("quoteHint")} on={info?.quote} onClick={() => void quoteAndSave()}>
              <Quote className="size-4" />
            </Tool>
            <Tool label={t("saveNoteHint")} on={info?.note} onClick={() => void saveAsNote()}>
              <NotebookPen className="size-4 text-[var(--c-amber)]" />
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
              accept="application/pdf,audio/*,video/mp4,video/webm,video/quicktime"
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
            <Tool label={t("addYoutube")} onClick={() => setYtOpen(true)}>
              <MonitorPlay className="size-4" />
            </Tool>
            <Tool
              label={t("find")}
              on={findOpen}
              onClick={() => (findOpen ? closeFind() : openFind())}
            >
              <Search className="size-4" />
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
                book={book}
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
            <RecordingBar rec={rec} onStop={() => void stopRecording()} />
          )}
          {findOpen && editor && (
            <FindBar
              editor={editor}
              inputRef={findInput}
              findQ={findQ}
              setFindQ={setFindQ}
              replaceQ={replaceQ}
              setReplaceQ={setReplaceQ}
              found={info?.find}
              onClose={closeFind}
            />
          )}
          {outlineOpen && (
            <div className="border-border mx-auto max-w-3xl border-t px-3 py-2 lg:hidden">
              {outline}
            </div>
          )}
        </div>

        <div className="mx-auto max-w-3xl px-4 pt-8 pb-32 sm:px-10 xl:max-w-4xl">
          <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
            {book ? t("bookEyebrow") : t("title")}
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
              {/* The pair: a real quote (→ Quotes) and, right next to it, a note (→ Notes). */}
              <span className="bg-surface-2 mx-0.5 flex items-center gap-0.5 rounded-lg p-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void quoteAndSave()}
                  aria-pressed={info?.quote}
                  title={t("quoteHint")}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2 text-sm",
                    info?.quote
                      ? "bg-primary-soft text-primary"
                      : "text-foreground/80 hover:bg-surface",
                  )}
                >
                  <Quote className="text-primary size-4" /> {t("quoteShort")}
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void saveAsNote()}
                  aria-pressed={info?.note}
                  title={t("saveNoteHint")}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2 text-sm",
                    info?.note
                      ? "text-foreground bg-[var(--c-amber)]/15"
                      : "text-foreground/80 hover:bg-surface",
                  )}
                >
                  <NotebookPen className="size-4 text-[var(--c-amber)]" /> {t("saveNote")}
                </button>
              </span>
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
          {editor && (
            <BubbleMenu
              editor={editor}
              pluginKey="noteMenu"
              shouldShow={({ editor: e, from, to }) => from === to && e.isActive("note")}
              className="border-border bg-surface flex items-center gap-0.5 rounded-xl border p-1 text-sm shadow-lg"
            >
              <span className="text-muted flex items-center gap-1.5 px-2">
                <NotebookPen className="size-4 text-[var(--c-amber)]" /> {t("inNotes")}
              </span>
              <a
                href={`/notes/${editor.getAttributes("note").noteId as string}`}
                target="_blank"
                rel="noopener"
                className="text-primary hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium"
              >
                <ExternalLink className="size-4" /> {t("openNote")}
              </a>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  editor.chain().focus().extendMarkRange("note").unsetMark("note").run()
                }
                className="text-muted hover:text-danger hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2"
              >
                <Eraser className="size-4" /> {t("removeNoteMark")}
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
          <button
            type="button"
            onClick={() => openAi("write")}
            className="text-muted hover:text-primary mt-10 inline-flex items-center gap-1.5 text-xs"
          >
            <Sparkles className="size-3.5" /> {book ? t("askAiBook") : t("askAi")}
          </button>
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
            startFull={initialFull}
            mode={book ? "book" : "taqriz"}
            userId={userId}
            title={resource.title}
            onClose={() => setAi((a) => ({ ...a, open: false }))}
          />
        </aside>
      )}
      <YouTubeDialog open={ytOpen} onOpenChange={setYtOpen} onInsert={insertYouTube} />
    </div>
  );
}

/** todayWords during render: only after hydration (localStorage). */
function todayWordsSafe(id: string, words: number) {
  return typeof window === "undefined" ? 0 : todayWords(id, words);
}
