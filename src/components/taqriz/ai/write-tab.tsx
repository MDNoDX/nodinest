"use client";
import type { Editor, JSONContent } from "@tiptap/react";
import { Check, Copy, CornerDownLeft, Loader2, PenLine, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { streamAi } from "@/lib/ai-stream";
import { cn } from "@/lib/cn";
import { markdownToNodes } from "@/lib/writeup-doc";
import { Interview } from "./interview";
import { MdView, SmallBtn } from "./shared";
// ── Write ──────────────────────────────────────────────────────────────────

type WriteAction =
  | "outline"
  | "intro"
  | "continue"
  | "conclusion"
  | "improve"
  | "custom"
  | "nextChapter"
  | "polish"
  | "interviewQuestion"
  | "interviewWrite"
  | "proofread";

const REPLACING: WriteAction[] = ["improve", "polish", "proofread"];

/** The chapter around the cursor as a range (heading excluded), for proofreading. */
function chapterRange(editor: Editor) {
  const at = editor.state.selection.from;
  let from = 0;
  let to = editor.state.doc.content.size;
  editor.state.doc.forEach((n, pos) => {
    if (n.type.name !== "heading") return;
    if (pos <= at) from = pos + n.nodeSize;
    else if (to === editor.state.doc.content.size && pos > at) to = pos;
  });
  const text = editor.state.doc.textBetween(from, to, "\n").trim();
  return text ? { from, to, text } : null;
}

/** Words of the corrected text, marked where they differ from the original. */
function diffWords(before: string, after: string) {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/(\s+)/);
  const words = b.filter((w) => w.trim());
  if (a.length * words.length > 900_000) return b.map((w) => ({ w, changed: false }));
  // Longest common subsequence of words (small texts only).
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(words.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = words.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === words[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < words.length;)
    if (a[i] === words[j]) {
      keep.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  let k = 0;
  return b.map((w) => (w.trim() ? { w, changed: !keep.has(k++) } : { w, changed: false }));
}

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

/** The chapter (last heading before the cursor; the first one at the top). */
function currentChapter(editor: Editor) {
  const at = editor.state.selection.from;
  let current = "";
  let first = "";
  editor.state.doc.forEach((n, pos) => {
    if (n.type.name !== "heading") return;
    first ||= n.textContent;
    if (pos <= at) current = n.textContent;
  });
  return current || first;
}

export function WriteTab({
  editor,
  resourceId,
  mode = "taqriz",
}: {
  editor: Editor;
  resourceId: string;
  mode?: "taqriz" | "book";
}) {
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

  const go = async (
    action: WriteAction,
    label: string,
    instruction = "",
    extra: { question?: string; answer?: string } = {},
  ) => {
    const { from, to } = editor.state.selection;
    const selected = from !== to ? editor.state.doc.textBetween(from, to, "\n").trim() : "";
    if ((action === "improve" || action === "polish") && !selected) return toast(t("selectFirst"));
    // Proofreading: the selection, else the chapter around the cursor.
    const chapter = action === "proofread" && !selected ? chapterRange(editor) : null;
    if (action === "proofread" && !selected && (!chapter || chapter.text.length > 4000))
      return toast(t(chapter ? "proofTooLong" : "selectFirst"));
    setBusy(action);
    const sel = selected ? { from, to, text: selected } : chapter;
    const r = await streamAi<{ used: { notes: number; transcript: string | null } }>(
      "write",
      {
        resourceId,
        action,
        mode,
        instruction,
        doc: docText(editor),
        selection: (sel?.text ?? "").slice(0, 4000),
        ...extra,
      },
      // Show the draft while it is being written.
      (text) => setRes({ action, label, text, used: { notes: 0, transcript: null }, sel }),
    );
    setBusy(null);
    if (!r.ok) return toast.error(te(r.code as "INTERNAL"));
    setRes({ action, label, text: r.text, used: r.meta.used, sel });
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

  const chips: [WriteAction, string][] =
    mode === "book"
      ? [
          ["proofread", t("wProofread")],
          ["outline", t("bOutline")],
          ["intro", t("bIntro")],
          ["nextChapter", t("bNextChapter")],
          ["continue", t("wContinue")],
          ["polish", t("bPolish")],
          ["conclusion", t("bConclusion")],
        ]
      : [
          ["proofread", t("wProofread")],
          ["outline", t("wOutline")],
          ["intro", t("wIntro")],
          ["continue", t("wContinue")],
          ["conclusion", t("wConclusion")],
          ["improve", t("wImprove")],
        ];
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <p className="text-muted text-xs">{t(mode === "book" ? "bookHint" : "writeHint")}</p>
      {mode === "book" && (
        <Interview
          busy={!!busy}
          ask={async () => {
            const chapter = currentChapter(editor);
            const r = await streamAi(
              "write",
              {
                resourceId,
                action: "interviewQuestion",
                mode,
                doc: docText(editor),
                instruction: chapter ? `The chapter being written now: "${chapter}".` : "",
              },
              () => {},
            );
            if (!r.ok) {
              toast.error(te(r.code as "INTERNAL"));
              return null;
            }
            return r.text;
          }}
          write={(question, answer) =>
            void go("interviewWrite", t("interviewDraft"), "", { question, answer })
          }
        />
      )}
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
      {res && (
        <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
          <div className="text-primary text-xs font-medium">{res.label}</div>
          {res.action === "proofread" && res.sel && !busy ? (
            <ProofView before={res.sel.text} after={res.text} />
          ) : (
            <MdView text={res.text} />
          )}
          <div className={cn("flex flex-wrap gap-1", busy && "hidden")}>
            {REPLACING.includes(res.action) && res.sel ? (
              <SmallBtn onClick={replace} icon={<Check />}>
                {res.action === "proofread" ? t("applyFixes") : t("replaceSelection")}
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
          <p className={cn("text-muted text-[11px]", busy && "hidden")}>
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

/** The corrected text with every changed word highlighted, and how many. */
function ProofView({ before, after }: { before: string; after: string }) {
  const t = useTranslations("taqrizAi");
  const parts = diffWords(before, after);
  const n = parts.filter((p) => p.changed).length;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">{n ? t("proofChanges", { n }) : t("proofClean")}</p>
      <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
        {parts.map((p, i) =>
          p.changed ? (
            <mark key={i} className="rounded bg-[var(--c-emerald)]/20 px-0.5 text-inherit">
              {p.w}
            </mark>
          ) : (
            <span key={i}>{p.w}</span>
          ),
        )}
      </p>
    </div>
  );
}
