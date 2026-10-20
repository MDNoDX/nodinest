"use client";
import type { Editor, JSONContent } from "@tiptap/react";
import { Copy, CornerDownLeft, Loader2, TextCursorInput } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { streamAi } from "@/lib/ai-stream";
import { markdownToNodes } from "@/lib/writeup-doc";
import { MdView, SmallBtn } from "./shared";
import type { AskRequest } from "./types";
// ── Ask ────────────────────────────────────────────────────────────────────

type Turn = { q: string; label: string; a?: string; error?: string; pending?: boolean };

export function AskTab({
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
      const put = (patch: Partial<Turn>) =>
        setTurns((cur) => cur.map((x, i) => (i === cur.length - 1 ? { ...x, ...patch } : x)));
      // The answer appears while the AI writes it.
      const r = await streamAi(
        "ask",
        { resourceId, selection: req.selection, context: req.context, question: q, history },
        (text) => put({ a: text, pending: false }),
      );
      if (r.ok) put({ a: r.text, pending: false });
      else put({ a: undefined, error: te(r.code as "INTERNAL"), pending: false });
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
