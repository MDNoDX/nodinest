import { cn } from "@/lib/cn";

/**
 * NodiNest "Knowledge Nest" symbol: the letter N drawn as an open book
 * (two page arcs meeting at the spine), resting on an interwoven nest, with
 * a gold knowledge node at the spine. Inline SVG — sharp at every size and
 * themed through CSS variables.
 */
export function LogoSymbol({
  className,
  title = "NodiNest",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label={title} className={cn("shrink-0", className)}>
      <path
        d="M13 33V15.5L35 33V15.5"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 15.5C16.5 12.6 20.6 12.4 24 15C27.4 12.4 31.5 12.6 35 15.5"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 36.2C16 41.8 28.4 42.6 37.2 38.4"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M10.8 38.6C19.6 42.8 32 41.9 38.5 36.2"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="24" cy="15" r="2.6" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoSymbol className="size-8" />
      {!compact && (
        <span className="text-foreground text-[1.15rem] font-semibold tracking-tight">
          Nodi<span className="text-primary">Nest</span>
        </span>
      )}
    </span>
  );
}
