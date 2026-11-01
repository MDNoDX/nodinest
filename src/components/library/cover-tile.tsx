import { Star } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ResourceType } from "@/lib/validation";
import { Cover } from "./cover";
import { StatusRibbon } from "./status-ribbon";

/** Grid tile: cover + status ribbon, title, a muted line and the user's rating. */
export function CoverTile({
  id,
  type,
  title,
  cover,
  line,
  meta,
  status,
  progress,
  rating,
  className,
  href,
}: {
  /** Where the tile leads, when not the entry's own page. */
  href?: string;
  id: string;
  type: ResourceType;
  title: string;
  cover: string | null;
  line?: string | null;
  meta?: React.ReactNode;
  status: string | null;
  progress?: number | null;
  rating?: number | null;
  className?: string;
}) {
  const to = href ?? `/library/${id}`;
  return (
    <div className={cn("group relative", className)}>
      <div className="relative">
        <Link href={to} className="block rounded-lg" tabIndex={-1} aria-hidden>
          <Cover
            type={type}
            title={title}
            src={cover}
            author={line}
            className={
              type === "book" || type === "course" ? "aspect-[2/3] h-auto w-full" : "w-full"
            }
          />
        </Link>
        <StatusRibbon resourceId={id} type={type} status={status} progress={progress} />
      </div>
      <Link
        href={to}
        className="mt-2 line-clamp-2 block text-[15px] leading-snug font-semibold hover:underline"
      >
        {title}
      </Link>
      {line && <p className="text-muted mt-0.5 line-clamp-1 text-xs">{line}</p>}
      <div className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
        {meta}
        {rating ? (
          <span className="text-foreground inline-flex items-center gap-1 font-semibold tabular-nums">
            <Star className="size-3 fill-[var(--c-amber)] text-[var(--c-amber)]" /> {rating}/10
          </span>
        ) : null}
      </div>
    </div>
  );
}
