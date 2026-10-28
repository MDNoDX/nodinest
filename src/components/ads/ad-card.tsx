/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/cn";

export type AdView = { id: string; title: string; text: string; image: string };

/** A small labelled ad (rel=sponsored); compact in the side menu. */
export function AdCard({ ad, label, compact }: { ad: AdView; label: string; compact?: boolean }) {
  return (
    <a
      href={`/api/ads/${ad.id}`}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={cn(
        "border-border bg-surface hover:border-border-strong group flex gap-3 rounded-xl border transition-colors",
        compact ? "p-2.5 text-xs" : "p-4 text-sm",
      )}
    >
      {ad.image && (
        <img
          src={ad.image}
          alt=""
          referrerPolicy="no-referrer"
          className={cn("shrink-0 rounded-lg object-cover", compact ? "size-10" : "size-16")}
        />
      )}
      <span className="min-w-0">
        <span className="text-muted block text-[10px] font-semibold tracking-wide uppercase">
          {label}
        </span>
        <span className="block font-semibold group-hover:underline">{ad.title}</span>
        {ad.text && (
          <span className={cn("text-muted block", compact && "line-clamp-2")}>{ad.text}</span>
        )}
      </span>
    </a>
  );
}
