import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cover, coverSrc } from "@/components/library/cover";
import { Badge } from "@/components/ui/misc";
import type { PublicItem } from "@/server/social";

/** Public library items: a cover grid; a tap opens the catalog entry. */
export function ItemGrid({
  items,
  by,
}: {
  items: (PublicItem & { name?: string })[];
  by?: boolean;
}) {
  const t = useTranslations();
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((it) => (
        <li key={`${it.resourceId}-${it.name ?? ""}`}>
          <Link href={`/library/${it.resourceId}`} className="group block">
            <Cover
              type={it.type as "book"}
              title={it.title}
              src={coverSrc(it)}
              className="aspect-[2/3] h-auto w-full transition-transform group-hover:-translate-y-0.5"
            />
            <div className="mt-2 line-clamp-2 text-sm font-medium">{it.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
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
