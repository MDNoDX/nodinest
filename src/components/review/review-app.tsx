"use client";
import {
  Brain,
  Check,
  ChevronDown,
  Download,
  Eye,
  Loader2,
  Pencil,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addCardAction,
  deleteCardAction,
  deleteDeckAction,
  dueCardsAction,
  generateCardsAction,
  improveCardsAction,
  listCardsAction,
  pickResourcesAction,
  reviewCardAction,
  updateCardAction,
} from "@/app/actions/cards";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/hooks";
import { intervalLabel, schedule, type Grade } from "@/lib/srs";

type Deck = {
  deck: string;
  total: number;
  due: number;
  learned: number;
  resourceId: string | null;
};
type Card = {
  id: string;
  deck: string;
  question: string;
  answer: string;
  explanation: string | null;
  source: string | null;
  kind: string;
  ease: number;
  intervalDays: number;
  reps: number;
};
type Session = { label: string; cards: Card[]; i: number; practice: boolean; done: number };

/**
 * "Takrorlash": make the most important questions from your resources with the
 * AI, then remember them with spaced repetition (each card comes back just
 * before you would forget it). Practice mode shows a whole deck without
 * changing the schedule.
 */
export function ReviewApp({
  decks,
  openDeck,
  preselect,
}: {
  decks: Deck[];
  openDeck: string | null;
  preselect: string | null;
}) {
  const t = useTranslations("review");
  const te = useTranslations("errors");
  const [session, setSession] = useState<Session | null>(null);
  const [expanded, setExpanded] = useState<string | null>(openDeck);
  const dueTotal = decks.reduce((a, d) => a + d.due, 0);

  const start = async (deck: string | null, practice = false) => {
    const r = practice ? await listCardsAction(deck!) : await dueCardsAction(deck);
    if (!r.ok) return toast.error(te(r.code));
    if (!r.data.length) return toast(t("nothingDue"));
    const cards = practice ? [...r.data].sort(() => Math.random() - 0.5) : r.data;
    setSession({ label: deck ?? t("allDecks"), cards, i: 0, practice, done: 0 });
  };

  if (session) return <SessionView s={session} setS={setSession} />;

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
        <span className="bg-primary-soft text-primary grid size-12 shrink-0 place-items-center rounded-2xl">
          <Brain className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">
            {dueTotal ? t("dueToday", { n: dueTotal }) : t("allCaughtUp")}
          </div>
          <p className="text-muted text-sm">{t("srsHint")}</p>
        </div>
        <Button disabled={!dueTotal} onClick={() => void start(null)}>
          <Play /> {t("startReview")}
        </Button>
      </section>

      <Maker preselect={preselect} onMade={(deck) => setExpanded(deck)} />

      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("decks")}</h2>
        {decks.length === 0 ? (
          <p className="text-muted text-sm">{t("noDecks")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {decks.map((d) => (
              <DeckRow
                key={d.deck}
                d={d}
                open={expanded === d.deck}
                setOpen={(o) => setExpanded(o ? d.deck : null)}
                onReview={() => void start(d.deck)}
                onPractice={() => void start(d.deck, true)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Make questions with the AI ─────────────────────────────────────────────

type Picked = { id: string; title: string; authors?: string };

function Maker({
  preselect,
  onMade,
}: {
  preselect: string | null;
  onMade: (deck: string) => void;
}) {
  const t = useTranslations("review");
  const te = useTranslations("errors");
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const [hits, setHits] = useState<Picked[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [count, setCount] = useState(15);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHits, setShowHits] = useState(false);

  useEffect(() => {
    let alive = true;
    void pickResourcesAction(query).then((r) => {
      if (!alive || !r.ok) return;
      setHits(r.data.map((x) => ({ id: x.id, title: x.title, authors: x.authors })));
      if (preselect && !query) {
        const p = r.data.find((x) => x.id === preselect);
        if (p) setPicked((cur) => (cur.length ? cur : [{ id: p.id, title: p.title }]));
      }
    });
    return () => {
      alive = false;
    };
  }, [query, preselect]);

  const make = async () => {
    setBusy(true);
    const r = await generateCardsAction({
      resourceIds: picked.map((p) => p.id),
      count,
      focus,
    }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return toast.error(te(r && !r.ok ? r.code : "INTERNAL"));
    toast.success(t("made", { n: r.data.created, deck: r.data.deck }));
    if (r.data.thinMaterial) toast(t("thinMaterial"));
    setPicked([]);
    setFocus("");
    onMade(r.data.deck);
    router.refresh();
  };

  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="text-primary size-4" /> {t("makeTitle")}
      </h2>
      <p className="text-muted mb-3 text-xs">{t("makeHint")}</p>
      <div className="relative">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShowHits(true);
          }}
          onFocus={() => setShowHits(true)}
          onBlur={() => setTimeout(() => setShowHits(false), 150)}
          placeholder={t("pickPlaceholder")}
          className="border-border-strong bg-surface h-10 w-full rounded-lg border px-3 text-sm"
        />
        {showHits && hits.length > 0 && (
          <ul className="border-border bg-surface absolute inset-x-0 top-11 z-20 max-h-64 overflow-y-auto rounded-lg border p-1 shadow-lg">
            {hits.map((h) => {
              const on = picked.some((p) => p.id === h.id);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setPicked((cur) =>
                        on ? cur.filter((p) => p.id !== h.id) : [...cur, h].slice(0, 8),
                      )
                    }
                    className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border",
                        on
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border-strong",
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{h.title}</span>
                    {h.authors && (
                      <span className="text-muted max-w-[40%] truncate text-xs">{h.authors}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {picked.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span
              key={p.id}
              className="bg-primary-soft text-primary inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-medium"
            >
              {p.title}
              <button
                type="button"
                onClick={() => setPicked((cur) => cur.filter((x) => x.id !== p.id))}
                className="rounded-full p-0.5 hover:bg-black/10"
                aria-label={t("unpick")}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label={t("count")}
          className="border-border-strong bg-surface h-10 rounded-lg border px-2 text-sm"
        >
          {[10, 15, 20, 30, 50].map((n) => (
            <option key={n} value={n}>
              {t("nQuestions", { n })}
            </option>
          ))}
        </select>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder={t("focusPlaceholder")}
          className="border-border-strong bg-surface h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"
        />
        <Button disabled={!picked.length || busy} onClick={() => void make()}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy ? t("making") : t("make")}
        </Button>
      </div>
    </section>
  );
}

// ── Decks ───────────────────────────────────────────────────────────────────

function DeckRow({
  d,
  open,
  setOpen,
  onReview,
  onPractice,
}: {
  d: Deck;
  open: boolean;
  setOpen: (o: boolean) => void;
  onReview: () => void;
  onPractice: () => void;
}) {
  const t = useTranslations("review");
  const pct = d.total ? Math.round((d.learned / d.total) * 100) : 0;
  return (
    <li className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn("text-muted size-4 shrink-0 transition-transform", open && "rotate-180")}
          />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{d.deck}</span>
            <span className="text-muted text-xs">
              {t("deckStats", { total: d.total, due: d.due, learned: pct })}
            </span>
          </span>
        </button>
        <div className="bg-surface-2 hidden h-1.5 w-24 overflow-hidden rounded-full sm:block">
          <div className="bg-success h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <Button size="sm" disabled={!d.due} onClick={onReview}>
          <Play /> {t("reviewN", { n: d.due })}
        </Button>
        <Button size="sm" variant="outline" onClick={onPractice}>
          <Repeat /> {t("practice")}
        </Button>
      </div>
      {open && <DeckCards deck={d.deck} />}
    </li>
  );
}

function DeckCards({ deck }: { deck: string }) {
  const t = useTranslations("review");
  const te = useTranslations("errors");
  const router = useRouter();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await listCardsAction(deck);
    if (r.ok) setCards(r.data);
  }, [deck]);
  useEffect(() => {
    let alive = true;
    void listCardsAction(deck).then((r) => {
      if (alive && r.ok) setCards(r.data);
    });
    return () => {
      alive = false;
    };
  }, [deck]);

  const improve = async () => {
    setImproving(true);
    const r = await improveCardsAction(deck, instruction).catch(() => null);
    setImproving(false);
    if (!r || !r.ok) return toast.error(te(r && !r.ok ? r.code : "INTERNAL"));
    toast.success(t("improved", { n: r.data.improved }));
    setInstruction("");
    void load();
  };
  const download = () => {
    if (!cards) return;
    const md = [
      `# ${deck}`,
      "",
      ...cards.flatMap((c, i) => [
        `## ${i + 1}. ${c.question}`,
        "",
        c.answer,
        ...(c.explanation ? ["", `> ${c.explanation}`] : []),
        ...(c.source ? ["", `_${c.source}_`] : []),
        "",
      ]),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    a.download = `${deck.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!cards)
    return (
      <div className="text-muted flex items-center gap-2 border-t px-4 py-3 text-sm">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  return (
    <div className="border-border border-t px-4 py-3">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={t("improvePlaceholder")}
          className="border-border-strong bg-surface h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm"
        />
        <Button size="sm" variant="secondary" disabled={improving} onClick={() => void improve()}>
          {improving ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {improving ? t("improving") : t("improve")}
        </Button>
        <Button size="sm" variant="ghost" onClick={download}>
          <Download /> {t("download")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (!window.confirm(t("deleteDeckConfirm", { deck }))) return;
            const r = await deleteDeckAction(deck);
            if (r.ok) router.refresh();
          }}
        >
          <Trash2 /> {t("deleteDeck")}
        </Button>
      </div>
      <ol className="divide-border flex flex-col divide-y">
        {cards.map((c, i) =>
          editing === c.id ? (
            <CardEditor
              key={c.id}
              initial={c}
              onCancel={() => setEditing(null)}
              onSave={async (v) => {
                const r = await updateCardAction(c.id, v);
                if (!r.ok) return toast.error(te(r.code));
                setEditing(null);
                void load();
              }}
            />
          ) : (
            <li key={c.id} className="group flex gap-3 py-2.5 text-sm">
              <span className="text-muted w-6 shrink-0 text-right tabular-nums">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.question}</div>
                <div className="text-muted mt-0.5 whitespace-pre-line">{c.answer}</div>
                {c.source && <div className="text-muted/80 mt-0.5 text-xs italic">{c.source}</div>}
              </div>
              <div className="flex shrink-0 items-start gap-0.5 opacity-60 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setEditing(c.id)}
                  className="hover:bg-surface-2 rounded p-1"
                  aria-label={t("edit")}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await deleteCardAction(c.id);
                    if (r.ok) setCards((cur) => cur?.filter((x) => x.id !== c.id) ?? null);
                  }}
                  className="hover:bg-surface-2 hover:text-danger rounded p-1"
                  aria-label={t("delete")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ),
        )}
      </ol>
      {adding ? (
        <CardEditor
          initial={null}
          onCancel={() => setAdding(false)}
          onSave={async (v) => {
            const r = await addCardAction(deck, v);
            if (!r.ok) return toast.error(te(r.code));
            setAdding(false);
            void load();
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-primary mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          <Plus className="size-4" /> {t("addCard")}
        </button>
      )}
    </div>
  );
}

function CardEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Card | null;
  onSave: (v: { question: string; answer: string; explanation: string; source: string }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("review");
  const [v, setV] = useState({
    question: initial?.question ?? "",
    answer: initial?.answer ?? "",
    explanation: initial?.explanation ?? "",
    source: initial?.source ?? "",
  });
  const field = "border-border-strong bg-surface w-full rounded-lg border px-2.5 py-1.5 text-sm";
  return (
    <form
      className="bg-surface-2/50 my-2 flex flex-col gap-2 rounded-lg p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.question.trim() && v.answer.trim()) onSave(v);
      }}
    >
      <textarea
        rows={2}
        value={v.question}
        onChange={(e) => setV({ ...v, question: e.target.value })}
        placeholder={t("question")}
        className={field}
        autoFocus
      />
      <textarea
        rows={3}
        value={v.answer}
        onChange={(e) => setV({ ...v, answer: e.target.value })}
        placeholder={t("answer")}
        className={field}
      />
      <input
        value={v.explanation}
        onChange={(e) => setV({ ...v, explanation: e.target.value })}
        placeholder={t("explanation")}
        className={field}
      />
      <input
        value={v.source}
        onChange={(e) => setV({ ...v, source: e.target.value })}
        placeholder={t("source")}
        className={field}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" size="sm">
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

// ── Review session ────────────────────────────────────────────────────────

const GRADES: { g: Grade; key: string; cls: string }[] = [
  { g: 1, key: "again", cls: "border-danger/40 text-danger hover:bg-danger-soft" },
  { g: 2, key: "hard", cls: "border-warning/40 text-warning hover:bg-warning-soft" },
  { g: 3, key: "good", cls: "border-success/40 text-success hover:bg-success-soft" },
  { g: 4, key: "easy", cls: "border-primary/40 text-primary hover:bg-primary-soft" },
];

function SessionView({ s, setS }: { s: Session; setS: (s: Session | null) => void }) {
  const t = useTranslations("review");
  const te = useTranslations("errors");
  const locale = useLocale() === "en" ? "en" : "uz";
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState("");
  const [busy, setBusy] = useState(false);
  const card = s.cards[s.i];
  const finished = !card;
  const live = useRef({ revealed, busy, card });
  useEffect(() => {
    live.current = { revealed, busy, card };
  });

  const grade = useCallback(
    async (g: Grade) => {
      const c = live.current.card;
      if (!c || live.current.busy) return;
      setBusy(true);
      if (!s.practice) {
        const r = await reviewCardAction(c.id, g).catch(() => null);
        if (!r || !r.ok) {
          setBusy(false);
          return toast.error(te(r && !r.ok ? r.code : "INTERNAL"));
        }
      }
      // "Again" comes back at the end of this session.
      const cards = g === 1 ? [...s.cards, { ...c, reps: 0 }] : s.cards;
      setS({ ...s, cards, i: s.i + 1, done: s.done + 1 });
      setRevealed(false);
      setAttempt("");
      setBusy(false);
    },
    [s, setS, te],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "TEXTAREA" || target.tagName === "INPUT";
      if (e.key === "Escape") return setS(null);
      if (typing && !(e.key === "Enter" && (e.metaKey || e.ctrlKey))) return;
      if (!live.current.revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (live.current.revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void grade(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade, setS]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold">{s.label}</span>
        {s.practice && (
          <span className="bg-surface-2 rounded-full px-2 py-0.5 text-xs">{t("practiceMode")}</span>
        )}
        <span className="text-muted ml-auto tabular-nums">
          {Math.min(s.i + 1, s.cards.length)} / {s.cards.length}
        </span>
        <button
          type="button"
          onClick={() => {
            setS(null);
            router.refresh();
          }}
          className="text-muted hover:text-foreground rounded p-1"
          aria-label={t("exit")}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="bg-surface-2 h-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${(s.i / Math.max(1, s.cards.length)) * 100}%` }}
        />
      </div>

      {finished ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <Check className="text-success size-10" />
          <div className="text-lg font-semibold">{t("sessionDone", { n: s.done })}</div>
          <Button
            onClick={() => {
              setS(null);
              router.refresh();
            }}
          >
            {t("backToDecks")}
          </Button>
        </div>
      ) : (
        <div className="card flex min-h-[18rem] flex-col gap-4 p-6">
          <span className="text-muted text-xs font-semibold tracking-wide uppercase">
            {t(`kind.${card.kind}` as "kind.recall")} · {card.deck}
          </span>
          <div className="text-xl leading-snug font-semibold">{card.question}</div>
          {!revealed ? (
            <>
              <textarea
                value={attempt}
                onChange={(e) => setAttempt(e.target.value)}
                rows={3}
                placeholder={t("tryAnswer")}
                className="border-border-strong bg-surface rounded-lg border px-3 py-2 text-sm"
              />
              <Button className="self-start" onClick={() => setRevealed(true)}>
                <Eye /> {t("showAnswer")}
              </Button>
            </>
          ) : (
            <>
              {attempt.trim() && (
                <div className="bg-surface-2/60 rounded-lg px-3 py-2 text-sm">
                  <div className="text-muted mb-0.5 text-xs">{t("yourAnswer")}</div>
                  <div className="whitespace-pre-line">{attempt}</div>
                </div>
              )}
              <div className="border-success/40 bg-success-soft/40 rounded-lg border px-4 py-3">
                <div className="whitespace-pre-line">{card.answer}</div>
                {card.explanation && (
                  <div className="text-muted mt-2 text-sm">💡 {card.explanation}</div>
                )}
                {card.source && <div className="text-muted mt-1 text-xs italic">{card.source}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map(({ g, key, cls }) => (
                  <button
                    key={g}
                    type="button"
                    disabled={busy}
                    onClick={() => void grade(g)}
                    className={cn(
                      "flex flex-col items-center rounded-xl border px-2 py-2 text-sm font-medium transition-colors disabled:opacity-50",
                      cls,
                    )}
                  >
                    <span>
                      {g}. {t(`grade.${key}` as "grade.good")}
                    </span>
                    {!s.practice && (
                      <span className="text-muted text-xs font-normal tabular-nums">
                        {intervalLabel(schedule(card, g).intervalDays, locale)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="text-muted mt-auto text-[11px]">{t("keysHint")}</p>
        </div>
      )}
    </div>
  );
}
