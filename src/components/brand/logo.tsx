import { cn } from "@/lib/cn";

/**
 * NodiNote symbol: a spiral notebook (cover, rings, ruled lines) with a gold
 * bookmark ribbon and a pencil — "write anything down". Inline SVG, themed
 * through CSS variables so it works in light and dark mode.
 */
export function LogoSymbol({
  className,
  title = "NodiNote",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label={title} className={cn("shrink-0", className)}>
      <rect x="12.5" y="9" width="20.5" height="30" rx="3.2" fill="var(--primary)" />
      <path d="M27.2 9V17.2L29.2 15.6L31.2 17.2V9Z" fill="#E2A93B" />
      <g fill="var(--foreground)">
        <rect x="10.4" y="13.6" width="5" height="2.4" rx="1.2" />
        <rect x="10.4" y="20.6" width="5" height="2.4" rx="1.2" />
        <rect x="10.4" y="27.6" width="5" height="2.4" rx="1.2" />
      </g>
      <g stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="1.7" strokeLinecap="round">
        <path d="M18 21.8H28.6" />
        <path d="M18 26.4H28.6" />
        <path d="M18 31H24.4" />
      </g>
      <g transform="rotate(45 34 31)">
        <rect x="31.6" y="20.6" width="4.8" height="15" rx="1.2" fill="#E2A93B" />
        <path d="M31.6 35.6H36.4L34 40.2Z" fill="#F3DDAA" />
        <path d="M33.3 38.8H34.7L34 40.2Z" fill="var(--foreground)" />
        <rect x="31.6" y="20.6" width="4.8" height="2.6" rx="1.2" fill="#EF8FA6" />
      </g>
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoSymbol className="size-8" />
      {!compact && (
        <span className="text-foreground text-[1.15rem] font-semibold tracking-tight">
          Nodi<span className="text-primary">Note</span>
        </span>
      )}
    </span>
  );
}
