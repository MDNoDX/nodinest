import { cn } from "@/lib/cn";

/**
 * NodiNest symbol for the Darsxona: a Central-Asian pointed arch (peshtoq, the
 * doorway of a madrasa) over an open book, with a gold eight-pointed star —
 * the light of knowledge. Inline SVG, themed through CSS variables.
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
        d="M14.5 36V21.8C14.5 15.6 19 11.6 24 8.6C29 11.6 33.5 15.6 33.5 21.8V36"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 33.6C21.6 32.1 19.4 31.7 17.8 32V26.9C19.4 26.6 21.6 27 24 28.5M24 28.5V33.6M24 33.6C26.4 32.1 28.6 31.7 30.2 32V26.9C28.6 26.6 26.4 27 24 28.5"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 37.6H36.5" stroke="#E2A93B" strokeWidth="2.6" strokeLinecap="round" />
      <polygon
        points="24.00,13.50 23.14,15.32 21.24,14.64 21.92,16.54 20.10,17.40 21.92,18.26 21.24,20.16 23.14,19.48 24.00,21.30 24.86,19.48 26.76,20.16 26.08,18.26 27.90,17.40 26.08,16.54 26.76,14.64 24.86,15.32"
        fill="#E2A93B"
      />
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
