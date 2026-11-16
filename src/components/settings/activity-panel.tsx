"use client";
import { CheckSquare, Loader2, MessageCircle, Square, ThumbsUp, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { myActivityAction, removeActivityAction } from "@/app/actions/social";
import { ask } from "@/components/ui/ask";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/cn";
import { errorToast } from "@/lib/error-toast";
import type { ActivityItem, ActivityKind } from "@/server/activity";

type Page = {
  items: ActivityItem[];
  more: boolean;
  totals: Record<ActivityKind, number>;
};
type Range = "all" | "7" | "30" | "custom";

const KINDS: { k: ActivityKind; icon: typeof ThumbsUp }[] = [
  { k: "likes", icon: ThumbsUp },
  { k: "comments", icon: MessageCircle },
  { k: "commentLikes", icon: ThumbsUp },
];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Settings → My activity (like Instagram's "Your activity → Interactions"):
 * the posts I said "great" to, my comments and replies, and the comments I
 * liked. Newest or oldest first, a date range, and removal one by one or
 * many at once (select mode, "select all").
 */
export function ActivityPanel({ initial, today }: { initial: Page; today: string }) {
  const t = useTranslations("activity");
  const te = useTranslations("errors");
  const f = useFormatter();
  const [kind, setKind] = useState<ActivityKind>("likes");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [range, setRange] = useState<Range>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState<Page>(initial);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const first = useRef(true);
  const seq = useRef(0);

  const bounds = () => {
    if (range === "custom") return { from: from || null, to: to || null };
    if (range === "all") return { from: null, to: null };
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - Number(range) + 1);
    return { from: dayKey(d), to: null };
  };

  const load = async (offset: number) => {
    const k = ++seq.current;
    setLoading(true);
    const r = await myActivityAction({ kind, sort, offset, ...bounds() }).catch(() => null);
    if (k !== seq.current) return;
    setLoading(false);
    if (!r?.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    setPage((p) => (offset ? { ...r.data, items: [...p.items, ...r.data.items] } : r.data));
  };

  // A new tab, order or range starts again from the top (the first view came with the page).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPicked(new Set());
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, sort, range, from, to]);

  const remove = async (keys: string[]) => {
    if (!keys.length) return;
    const yes = await ask({
      message: t(`ask.${kind}`, { count: keys.length }),
      confirmLabel: t(`do.${kind}`),
      remove: kind === "comments",
    });
    if (!yes) return;
    setRemoving(true);
    const r = await removeActivityAction(kind, keys).catch(() => null);
    setRemoving(false);
    if (!r?.ok) return errorToast(te, r && !r.ok ? r : "INTERNAL");
    const gone = new Set(keys);
    setPage((p) => ({
      ...p,
      items: p.items.filter((i) => !gone.has(i.key)),
      totals: { ...p.totals, [kind]: Math.max(0, p.totals[kind] - r.data) },
    }));
    setPicked(new Set());
    if (selecting && page.items.length - keys.length <= 0) setSelecting(false);
    toast.success(t(`done.${kind}`, { count: r.data }));
  };

  const toggle = (key: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const allPicked = page.items.length > 0 && page.items.every((i) => picked.has(i.key));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">{t("intro")}</p>

      <div role="tablist" className="bg-surface-2 grid grid-cols-3 gap-1 rounded-xl p-1">
        {KINDS.map(({ k, icon: Icon }) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              setSelecting(false);
            }}
            className={cn(
              "flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:flex-row sm:justify-center sm:gap-1.5 sm:text-sm",
              kind === k
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1">
              <Icon className="size-4" />
              {k === "commentLikes" && <MessageCircle className="-ml-1.5 size-3" />}
            </span>
            <span className="truncate">{t(`tabs.${k}`)}</span>
            <span className="text-muted tabular-nums">{page.totals[k]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "new" | "old")}
          aria-label={t("sort")}
          className="border-border bg-surface h-9 rounded-lg border px-2 text-sm"
        >
          <option value="new">{t("newest")}</option>
          <option value="old">{t("oldest")}</option>
        </select>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          aria-label={t("range")}
          className="border-border bg-surface h-9 rounded-lg border px-2 text-sm"
        >
          <option value="all">{t("all")}</option>
          <option value="7">{t("days", { count: 7 })}</option>
          <option value="30">{t("days", { count: 30 })}</option>
          <option value="custom">{t("custom")}</option>
        </select>
        <span className="ml-auto">
          {page.items.length > 0 && (
            <Button
              size="sm"
              variant={selecting ? "primary" : "outline"}
              onClick={() => {
                setSelecting((s) => !s);
                setPicked(new Set());
              }}
            >
              {selecting ? <X /> : <CheckSquare />} {selecting ? t("cancel") : t("select")}
            </Button>
          )}
        </span>
      </div>
      {range === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted">{t("from")}</span>
            <DatePicker value={from} onChange={setFrom} today={today} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted">{t("to")}</span>
            <DatePicker value={to} onChange={setTo} today={today} min={from || undefined} />
          </label>
        </div>
      )}

      {selecting && (
        <div className="bg-primary-soft animate-fade-in sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
          <button
            type="button"
            onClick={() => setPicked(allPicked ? new Set() : new Set(page.items.map((i) => i.key)))}
            className="flex items-center gap-2 text-sm font-medium"
          >
            {allPicked ? (
              <CheckSquare className="text-primary size-4" />
            ) : (
              <Square className="size-4" />
            )}
            {t("selectAll")}
          </button>
          <span className="text-muted text-sm">{t("picked", { count: picked.size })}</span>
          <Button
            size="sm"
            variant="danger"
            className="ml-auto"
            disabled={!picked.size || removing}
            onClick={() => void remove([...picked])}
          >
            {removing ? <Loader2 className="animate-spin" /> : <Trash2 />} {t(`do.${kind}`)}
          </Button>
        </div>
      )}

      {page.items.length === 0 ? (
        loading ? (
          <Loader2 className="text-muted mx-auto my-8 size-5 animate-spin" />
        ) : (
          <p className="text-muted py-10 text-center text-sm">{t(`empty.${kind}`)}</p>
        )
      ) : (
        <ul className={cn("divide-border card divide-y overflow-hidden", loading && "opacity-60")}>
          {page.items.map((i) => {
            const on = picked.has(i.key);
            return (
              <li
                key={i.key}
                className={cn(
                  "group relative flex items-start gap-3 px-3 py-3",
                  on && "bg-primary-soft/60",
                )}
              >
                {selecting && (
                  <button
                    type="button"
                    onClick={() => toggle(i.key)}
                    aria-pressed={on}
                    aria-label={t("selectOne")}
                    className="mt-3 shrink-0"
                  >
                    {on ? (
                      <CheckSquare className="text-primary size-5" />
                    ) : (
                      <Square className="text-muted size-5" />
                    )}
                  </button>
                )}
                <Link
                  href={i.href}
                  onClick={(e) => {
                    if (selecting) {
                      e.preventDefault();
                      toggle(i.key);
                    }
                  }}
                  className="flex min-w-0 flex-1 items-start gap-3"
                >
                  <span className="bg-surface-2 grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg">
                    {i.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.cover} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Avatar name={i.title} image={null} className="size-8" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{i.title}</span>
                    <span className="text-muted block truncate text-xs">
                      @{i.owner.username}
                      {i.hidden && ` · ${t("hidden")}`}
                    </span>
                    {(i.body || i.gif) && (
                      <span className="bg-surface-2 mt-1.5 block rounded-xl px-2.5 py-1.5 text-sm">
                        {i.author && (
                          <span className="block text-xs font-semibold">{i.author.name}</span>
                        )}
                        {i.reply && (
                          <span className="text-muted mr-1 text-xs">{t("replyMark")}</span>
                        )}
                        {i.body ? (
                          <span className="line-clamp-3 break-words whitespace-pre-wrap">
                            {i.body}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">GIF</span>
                        )}
                      </span>
                    )}
                    <span className="text-muted mt-1 block text-[11px]">
                      {f.dateTime(new Date(i.at), { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </span>
                </Link>
                {!selecting && (
                  <button
                    type="button"
                    onClick={() => void remove([i.key])}
                    aria-label={t(`do.${kind}`)}
                    title={t(`do.${kind}`)}
                    className="text-muted hover:text-danger hover:bg-surface-2 grid size-8 shrink-0 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 max-lg:opacity-100"
                  >
                    {kind === "comments" ? <Trash2 className="size-4" /> : <X className="size-4" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {page.more && (
        <Button
          variant="outline"
          className="self-center"
          disabled={loading}
          onClick={() => void load(page.items.length)}
        >
          {loading && <Loader2 className="animate-spin" />} {t("more")}
        </Button>
      )}
    </div>
  );
}
