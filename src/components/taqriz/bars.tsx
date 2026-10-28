"use client";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { fmtSeconds, type useRecorder } from "@/components/media/use-recorder";
import { Tool } from "./tool";

/** Under the toolbar while a voice note is being recorded. */
export function RecordingBar({
  rec,
  onStop,
}: {
  rec: ReturnType<typeof useRecorder>;
  onStop: () => void;
}) {
  const t = useTranslations("taqriz");
  return (
    <div className="border-border mx-auto flex max-w-3xl items-center gap-3 border-t px-4 py-2 sm:px-6">
      <span className="bg-danger size-2.5 animate-pulse rounded-full" />
      <span className="text-sm font-medium tabular-nums">{fmtSeconds(rec.seconds)}</span>
      <span className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded-full">
        <span
          className="bg-danger block h-full rounded-full"
          style={{ width: `${Math.round(rec.level * 100)}%` }}
        />
      </span>
      <button type="button" className="text-muted text-sm hover:underline" onClick={rec.cancel}>
        {t("cancel")}
      </button>
      <button
        type="button"
        className="bg-danger rounded-lg px-3 py-1 text-sm font-medium text-white"
        onClick={onStop}
      >
        {t("stop")}
      </button>
    </div>
  );
}

/** Find & replace under the toolbar (matches are decorations, see find.ts). */
export function FindBar({
  editor,
  inputRef,
  findQ,
  setFindQ,
  replaceQ,
  setReplaceQ,
  found,
  onClose,
}: {
  editor: Editor;
  inputRef: React.RefObject<HTMLInputElement | null>;
  findQ: string;
  setFindQ: (v: string) => void;
  replaceQ: string;
  setReplaceQ: (v: string) => void;
  found?: { index: number; total: number };
  onClose: () => void;
}) {
  const t = useTranslations("taqriz");
  return (
    <form
      className="border-border mx-auto flex max-w-3xl flex-wrap items-center gap-1.5 border-t px-3 py-1.5 sm:px-6 xl:max-w-4xl"
      onSubmit={(e) => e.preventDefault()}
    >
      <Search className="text-muted size-4 shrink-0" />
      <input
        ref={inputRef}
        value={findQ}
        placeholder={t("findPlaceholder")}
        aria-label={t("find")}
        onChange={(e) => {
          setFindQ(e.target.value);
          editor.commands.setFind(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editor.commands.findStep(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") onClose();
        }}
        className="border-border-strong bg-surface h-8 w-44 min-w-0 flex-1 rounded-md border px-2 text-sm sm:flex-none"
      />
      <span className="text-muted w-14 text-center text-xs tabular-nums">
        {findQ ? `${found?.total ? found.index + 1 : 0}/${found?.total ?? 0}` : ""}
      </span>
      <Tool label={t("findPrev")} onClick={() => editor.commands.findStep(-1)}>
        <ChevronUp className="size-4" />
      </Tool>
      <Tool label={t("findNext")} onClick={() => editor.commands.findStep(1)}>
        <ChevronDown className="size-4" />
      </Tool>
      <input
        value={replaceQ}
        placeholder={t("replaceWith")}
        aria-label={t("replaceWith")}
        onChange={(e) => setReplaceQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editor.chain().replaceCurrent(replaceQ).findStep(1).run();
          } else if (e.key === "Escape") onClose();
        }}
        className="border-border-strong bg-surface h-8 w-36 min-w-0 rounded-md border px-2 text-sm"
      />
      <button
        type="button"
        disabled={!found?.total}
        onClick={() => editor.chain().replaceCurrent(replaceQ).run()}
        className="hover:bg-surface-2 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40"
      >
        {t("replace")}
      </button>
      <button
        type="button"
        disabled={!found?.total}
        onClick={() => editor.chain().replaceAll(replaceQ).run()}
        className="hover:bg-surface-2 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40"
      >
        {t("replaceAll")}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="text-muted hover:text-foreground ml-auto rounded-md p-1"
        aria-label={t("closeFind")}
      >
        <X className="size-4" />
      </button>
    </form>
  );
}
