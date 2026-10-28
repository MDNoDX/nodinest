"use client";
import { Copy, ExternalLink, NotebookPen, Quote, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Mark } from "@/lib/reader-marks";

export type Sel = { text: string; page: number; context: string; x: number; y: number };

const ITEM =
  "hover:bg-surface-2 flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm whitespace-nowrap";

/** Over the selected text: quote, note, ask the AI, copy. */
export function SelectionMenu({
  sel,
  onQuote,
  onNote,
  onAsk,
  onDone,
}: {
  sel: Sel;
  onQuote: () => void;
  onNote: () => void;
  onAsk: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("reader");
  return (
    <div
      className="border-border bg-surface fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-xl border p-1 font-sans shadow-lg"
      style={{
        left: Math.min(Math.max(sel.x, 170), window.innerWidth - 170),
        top: Math.max(sel.y - 8, 64),
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" onClick={onQuote} className={ITEM} title={t("quoteHint")}>
        <Quote className="text-primary size-4" /> {t("quote")}
      </button>
      <button type="button" onClick={onNote} className={ITEM} title={t("noteHint")}>
        <NotebookPen className="size-4 text-[var(--c-amber)]" /> {t("note")}
      </button>
      <button type="button" onClick={onAsk} className={ITEM}>
        <Sparkles className="text-primary size-4" /> {t("askAi")}
      </button>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(sel.text);
          toast.success(t("copied"));
          onDone();
        }}
        className="text-muted hover:bg-surface-2 grid size-9 place-items-center rounded-lg"
        aria-label={t("copy")}
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}

/** A note on the selected passage, with an optional thought of one's own. */
export function NoteDialog({
  sel,
  onSave,
  onClose,
}: {
  sel: Sel;
  onSave: (thought: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations("reader");
  const [thought, setThought] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("note")}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <form
        className="bg-surface flex w-full max-w-md flex-col gap-3 rounded-2xl p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(thought);
        }}
      >
        <p className="flex items-center gap-2 font-semibold">
          <NotebookPen className="size-4 text-[var(--c-amber)]" />{" "}
          {t("noteTitle", { page: sel.page })}
        </p>
        <blockquote className="line-clamp-5 border-l-2 border-[var(--c-amber)] pl-3 font-serif text-sm italic">
          {sel.text}
        </blockquote>
        <textarea
          autoFocus
          rows={3}
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          placeholder={t("thought")}
          aria-label={t("thought")}
          className="border-border-strong bg-surface rounded-lg border px-3 py-2 text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit">{t("save")}</Button>
        </div>
      </form>
    </div>
  );
}

/** A tap on a saved quote / note: where it is kept, and open it. */
export function MarkMenu({
  m,
  x,
  y,
  onClose,
}: {
  m: Mark;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const t = useTranslations("reader");
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="border-border bg-surface absolute flex items-center gap-1 rounded-xl border p-1 font-sans text-sm shadow-lg"
        style={{ left: Math.min(x, window.innerWidth - 220), top: y + 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-muted flex items-center gap-1.5 px-2">
          {m.kind === "quote" ? (
            <Quote className="text-primary size-4" />
          ) : (
            <NotebookPen className="size-4 text-[var(--c-amber)]" />
          )}
          {m.kind === "quote" ? t("inQuotes") : t("inNotes")}
        </span>
        <a
          href={`/notes/${m.id}`}
          target="_blank"
          rel="noopener"
          className="text-primary hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium"
        >
          <ExternalLink className="size-4" /> {t("open")}
        </a>
      </div>
    </div>
  );
}
