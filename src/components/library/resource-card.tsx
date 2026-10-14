import { Star } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProgressBar } from "@/components/charts/hbar-list";
import { TypeBadge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { shortYear } from "@/lib/dates";
import type { ResourceType } from "@/lib/validation";
import { Cover, coverSrc } from "./cover";
import { StatusRibbon } from "./status-ribbon";

export type ResourceCardData = {
  resourceId: string;
  title: string;
  type: ResourceType;
  coverUrl: string | null;
  coverFileId: string | null;
  authors?: string | null;
  description?: string | null;
  originalDate?: string | null;
  publicationDate?: string | null;
  pageCount?: number | null;
  durationSeconds?: number | null;
  lessonCount?: number | null;
  rating?: number | null;
  status?: string | null;
  progressCurrent?: number | null;
  progressTotal?: number | null;
  progressUnit?: string | null;
};

/**
 * Horizontal card: cover with status ribbon, title, author, a two-line
 * summary and the details that matter (type · year · size · rating).
 */
export async function ResourceCard({
  r,
  rank,
  aside,
  className,
}: {
  r: ResourceCardData;
  /** Ranked collections: #1, #2… */
  rank?: number;
  aside?: React.ReactNode;
  className?: string;
}) {
  const t = await getTranslations();
  const year = shortYear(r.originalDate || r.publicationDate);
  const minutes = r.durationSeconds ? Math.round(r.durationSeconds / 60) : null;
  const size = r.pageCount
    ? t("card.pages", { count: r.pageCount })
    : r.lessonCount
      ? t("card.lessons", { count: r.lessonCount })
      : minutes
        ? minutes >= 60
          ? t("card.hours", { h: Math.floor(minutes / 60), m: minutes % 60 })
          : t("card.minutes", { count: minutes })
        : null;
  const pct =
    r.status === "in_progress" && r.progressTotal
      ? Math.min(100, Math.round(((r.progressCurrent ?? 0) / r.progressTotal) * 100))
      : null;
  const podium = ["var(--c-amber)", "var(--c-slate)", "var(--c-orange)"];

  return (
    <div
      className={cn(
        "card group relative flex gap-4 p-3.5 transition-shadow hover:shadow-md sm:p-4",
        className,
      )}
    >
      {rank != null && (
        <span
          className="w-9 shrink-0 self-center text-center text-2xl font-bold tabular-nums"
          style={{ color: podium[rank - 1] ?? "var(--muted-foreground)" }}
        >
          #{rank}
        </span>
      )}
      <div className="relative shrink-0">
        <Link href={`/library/${r.resourceId}`} tabIndex={-1} aria-hidden>
          <Cover
            type={r.type}
            title={r.title}
            src={coverSrc(r)}
            className="h-32 w-[5.5rem] shadow-sm transition-transform group-hover:-translate-y-0.5"
          />
        </Link>
        <StatusRibbon
          resourceId={r.resourceId}
          type={r.type}
          status={r.status ?? null}
          progress={pct}
          className="left-1 w-7"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/library/${r.resourceId}`}
          className="line-clamp-2 text-[17px] leading-snug font-semibold hover:underline"
        >
          {r.title}
        </Link>
        {r.authors && <p className="text-muted mt-0.5 truncate text-sm">{r.authors}</p>}
        {r.description && (
          <p className="text-foreground/75 mt-1.5 line-clamp-2 text-[13px] leading-relaxed">
            {r.description}
          </p>
        )}
        <div className="text-muted mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-2 text-xs">
          <TypeBadge type={r.type} label={t(`types.${r.type}`)} />
          {year && <span className="tabular-nums">{year}</span>}
          {size && <span>· {size}</span>}
          {r.rating ? (
            <span className="text-foreground inline-flex items-center gap-1 font-semibold tabular-nums">
              <Star className="size-3.5 fill-[var(--c-amber)] text-[var(--c-amber)]" />
              {r.rating}/10
            </span>
          ) : null}
        </div>
        {pct != null && r.progressTotal ? (
          <div className="mt-2">
            <ProgressBar value={r.progressCurrent ?? 0} max={r.progressTotal} label={r.title} />
            <div className="text-muted mt-1 text-[11px] tabular-nums">
              {r.progressCurrent ?? 0} / {r.progressTotal}{" "}
              {r.progressUnit ? t(`progressUnits.${r.progressUnit}`) : ""} · {pct}%
            </div>
          </div>
        ) : null}
      </div>
      {aside && <div className="flex shrink-0 flex-col items-end justify-between">{aside}</div>}
    </div>
  );
}
