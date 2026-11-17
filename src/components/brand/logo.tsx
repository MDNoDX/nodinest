import { cn } from "@/lib/cn";

/**
 * Röznoma symbol: the letter "Ö" of the name (the 2026 Uzbek alphabet) drawn
 * as a paper ring with a journal's ribbon bookmark hanging from it, and its
 * two dots as a sun and a moon — day and night, a book kept every day. The
 * same drawing as the app icon (public/nodinest-icon.svg, src/app/icon.svg;
 * PNGs by scripts/make-icons.mjs), on its own night-blue tile.
 */
export function LogoSymbol({
  className,
  title = "Röznoma",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label={title} className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="rz-bg" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#2E1D78" />
          <stop offset="0.6" stopColor="#1B1450" />
          <stop offset="1" stopColor="#0E0B2C" />
        </linearGradient>
        <linearGradient id="rz-paper" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFF9EC" />
          <stop offset="1" stopColor="#E9C887" />
        </linearGradient>
        <linearGradient id="rz-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF7A7A" />
          <stop offset="1" stopColor="#D62F4D" />
        </linearGradient>
        <radialGradient id="rz-sun" cx="0.38" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#FFE9A8" />
          <stop offset="1" stopColor="#F59E0B" />
        </radialGradient>
        <linearGradient id="rz-moon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3F5FF" />
          <stop offset="1" stopColor="#A7B2EA" />
        </linearGradient>
        <radialGradient id="rz-halo" cx="0.5" cy="0.6" r="0.55">
          <stop offset="0" stopColor="#7C5CFF" stopOpacity="0.5" />
          <stop offset="1" stopColor="#7C5CFF" stopOpacity="0" />
        </radialGradient>
        <mask id="rz-crescent">
          <rect width="48" height="48" fill="#fff" />
          <circle cx="31.7" cy="9.9" r="2.75" fill="#000" />
        </mask>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#rz-bg)" />
      <circle cx="24" cy="27.5" r="17" fill="url(#rz-halo)" />
      <circle cx="24" cy="27.5" r="9.6" fill="none" stroke="url(#rz-paper)" strokeWidth="5.2" />
      <path d="M27.6 31.2V43.2L30.3 40.7L33 43.2V31.2Z" fill="url(#rz-ribbon)" />
      <path d="M27.6 31.2H33V32.8H27.6Z" fill="#9E1F3A" opacity="0.55" />
      <circle cx="18.6" cy="11.4" r="3.2" fill="url(#rz-sun)" />
      <circle cx="29.6" cy="11.4" r="3.3" fill="url(#rz-moon)" mask="url(#rz-crescent)" />
      <circle cx="34.2" cy="8.2" r="0.6" fill="#F3F5FF" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoSymbol className="size-8" />
      {!compact && (
        <span
          className="text-foreground text-[1.3rem] leading-none"
          style={{ fontFamily: "var(--font-brand), serif" }}
        >
          Röz<span className="text-primary">noma</span>
        </span>
      )}
    </span>
  );
}
