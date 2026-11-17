import { cn } from "@/lib/cn";

/**
 * Röznoma symbol: a golden sun rising behind an open book — "röz" (the day)
 * and "noma" (the book): something learned and written every day. The same
 * drawing as the app icon (public/nodinest-icon.svg, src/app/icon.svg; PNGs by
 * scripts/make-icons.mjs), on its own indigo tile so it reads in both themes.
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
        <linearGradient id="rz-bg" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#5B4BF5" />
          <stop offset="0.55" stopColor="#3B2FC4" />
          <stop offset="1" stopColor="#1E1A5E" />
        </linearGradient>
        <radialGradient id="rz-sun" cx="0.5" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#FFE9A3" />
          <stop offset="0.55" stopColor="#FBBF24" />
          <stop offset="1" stopColor="#F08A0B" />
        </radialGradient>
        <linearGradient id="rz-page" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E9E6FF" />
        </linearGradient>
        <radialGradient id="rz-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FBBF24" stopOpacity="0.45" />
          <stop offset="1" stopColor="#FBBF24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#rz-bg)" />
      <circle cx="24" cy="24.5" r="15" fill="url(#rz-glow)" />
      <g stroke="#FCD34D" strokeWidth="2" strokeLinecap="round">
        <path d="M24 9.6V12.4" />
        <path d="M14.2 13.7L16.1 15.6" />
        <path d="M33.8 13.7L31.9 15.6" />
        <path d="M10.3 22.4H13" />
        <path d="M37.7 22.4H35" />
      </g>
      <circle cx="24" cy="24.5" r="7.6" fill="url(#rz-sun)" />
      <path
        d="M24 37.6C20.1 34.6 14.9 33.9 9.6 35.2V26.6C14.9 25.3 20.1 26 24 29Z"
        fill="url(#rz-page)"
      />
      <path
        d="M24 37.6C27.9 34.6 33.1 33.9 38.4 35.2V26.6C33.1 25.3 27.9 26 24 29Z"
        fill="url(#rz-page)"
      />
      <path d="M24 29V37.6" stroke="#B9B3F0" strokeWidth="0.9" />
      <g stroke="#8F86E6" strokeOpacity="0.55" strokeWidth="0.9" strokeLinecap="round" fill="none">
        <path d="M12.4 29.4C15.6 28.8 18.6 29.1 21.2 30.3" />
        <path d="M12.4 32.4C15.6 31.8 18.6 32.1 21.2 33.3" />
        <path d="M35.6 29.4C32.4 28.8 29.4 29.1 26.8 30.3" />
        <path d="M35.6 32.4C32.4 31.8 29.4 32.1 26.8 33.3" />
      </g>
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
