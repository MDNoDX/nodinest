"use client";
import { CornerDownLeft, Loader2, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { MdView } from "@/components/taqriz/ai/shared";
import { streamAi } from "@/lib/ai-stream";
import { cn } from "@/lib/cn";

export type ReaderAsk = { selection: string; context: string; page: number; n: number };
type Turn = { q: string; quote?: string; a?: string; error?: string; pending?: boolean };

/**
 * The reader's AI companion: explains a selected passage (meaning, people,
 * places, translation) and answers questions about the book — without
 * spoilers beyond the page being read.
 */
export function ReaderAi({
  resourceId,
  page,
  ask,
  onClose,
}: {
  resourceId: string;
  page: number;
  ask: ReaderAsk | null;
  onClose: () => void;
}) {
  const t = useTranslations("reader");
  const te = useTranslations("errors");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const busy = turns.some((x) => x.pending);
  const end = useRef<HTMLDivElement>(null);
  const done = useRef(0);

  const send = async (
    q: string,
    sel: { selection: string; context: string; page: number } | null,
  ) => {
    const history = turns
      .filter((x) => x.a)
      .slice(-4)
      .map((x) => ({ q: x.q || t("explain"), a: x.a! }));
    const base = [...turns, { q, quote: sel?.selection, pending: true }];
    setTurns(base);
    const put = (patch: Partial<Turn>) =>
      setTurns((cur) => cur.map((x, i) => (i === cur.length - 1 ? { ...x, ...patch } : x)));
    const r = await streamAi(
      "ask",
      {
        resourceId,
        from: "book",
        page: sel?.page ?? page,
        selection: sel?.selection ?? "",
        context: sel?.context ?? "",
        question: q,
        history,
      },
      (text) => put({ a: text }),
    );
    put(r.ok ? { a: r.text, pending: false } : { error: te(r.code as "INTERNAL"), pending: false });
  };

  // A new "Ask AI" from the selection menu.
  useEffect(() => {
    if (!ask || ask.n === done.current) return;
    done.current = ask.n;
    void send("", ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  // Keep the newest answer in view (only the panel scrolls, not the page).
  useEffect(() => {
    const box = end.current?.closest<HTMLElement>("[data-scroll]");
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns]);

  const submit = () => {
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    void send(q, null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
        <Sparkles className="text-primary size-4" />
        <span className="text-sm font-semibold">{t("aiTitle")}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:text-foreground ml-auto rounded-md p-1"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!turns.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-sm">{t("aiHint")}</p>
            {[t("s1"), t("s2"), t("s3")].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s, null)}
                className="border-border hover:bg-surface-2 rounded-lg border px-3 py-2 text-left text-sm"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {turns.map((x, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                {x.quote && (
                  <blockquote className="border-primary text-muted line-clamp-4 border-l-2 pl-2 font-serif text-sm italic">
                    {x.quote}
                  </blockquote>
                )}
                {x.q && (
                  <p className="bg-primary-soft self-end rounded-lg px-3 py-1.5 text-sm">{x.q}</p>
                )}
                {x.error ? (
                  <p className="text-danger text-sm">{x.error}</p>
                ) : x.a ? (
                  <div className="text-sm leading-relaxed">
                    <MdView text={x.a} />
                  </div>
                ) : (
                  <p className="text-muted flex items-center gap-1.5 text-sm">
                    <Loader2 className="size-3.5 animate-spin" /> {t("thinking")}
                  </p>
                )}
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>
      <form
        className="border-border flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={t("askPlaceholder")}
          className="border-border-strong bg-surface min-h-10 flex-1 resize-none rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          aria-label={t("send")}
          className={cn(
            "bg-primary text-primary-foreground grid size-10 place-items-center rounded-lg",
            (!draft.trim() || busy) && "opacity-50",
          )}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CornerDownLeft className="size-4" />
          )}
        </button>
      </form>
    </div>
  );
}
