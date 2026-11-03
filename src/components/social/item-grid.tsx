import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cover, coverSrc } from "@/components/library/cover";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { PublicItem } from "@/server/social";

/**
 * Public library items: a cover grid; a tap opens the catalog entry.
 * Phones get three small covers a row, so more of a library is seen at once.
 */
export function ItemGrid({
  items,
  by,
  owner,
  cols = "sm:grid-cols-4 lg:grid-cols-5",
}: {
  items: (PublicItem & { name?: string; username?: string })[];
  by?: boolean;
  /** Whose items these are; none means my own, which open in my library. */
  owner?: string;
  /** Columns from sm up (phones always have three). */
  cols?: string;
}) {
  const t = useTranslations();
  return (
    <ul className={cn("grid grid-cols-3 gap-x-3 gap-y-4 sm:gap-x-4 sm:gap-y-6", cols)}>
      {items.map((it) => (
        <li key={`${it.resourceId}-${it.name ?? ""}`} className="min-w-0">
          <Link
            href={
              (it.username ?? owner)
                ? `/u/${it.username ?? owner}/item/${it.resourceId}`
                : `/library/${it.resourceId}`
            }
            className="group block"
          >
            <Cover
              type={it.type as "book"}
              title={it.title}
              src={coverSrc(it)}
              className="aspect-[2/3] h-auto w-full transition-transform group-hover:-translate-y-0.5"
            />
            <div className="mt-1.5 line-clamp-2 text-xs leading-snug font-medium sm:mt-2 sm:text-sm">
              {it.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs max-sm:hidden">
              <Badge tone={it.status === "completed" ? "success" : "neutral"}>
                {t(`status.${it.status as "planned"}`)}
              </Badge>
              {it.rating ? <span className="text-muted">★ {it.rating}/10</span> : null}
            </div>
            {by && it.name && <div className="text-muted mt-0.5 truncate text-xs">{it.name}</div>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
