import { cn } from "@/lib/cn";

/**
 * The Premium mark of a reader: a golden seal with an open book and a small
 * star (our own sign, not a messenger's tick).
 */
export function PremiumBadge({
  className,
  label = "Premium",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className={cn("inline size-4 shrink-0 drop-shadow-sm", className)}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id="nn-premium-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd56b" />
          <stop offset="0.55" stopColor="#f5a524" />
          <stop offset="1" stopColor="#e0701b" />
        </linearGradient>
      </defs>
      {/* An eight-pointed seal */}
      <path
        fill="url(#nn-premium-gold)"
        d="M12 1.5l2.2 1.9 2.9-.4 1 2.7 2.7 1-.4 2.9 1.9 2.2-1.9 2.2.4 2.9-2.7 1-1 2.7-2.9-.4L12 22.5l-2.2-1.9-2.9.4-1-2.7-2.7-1 .4-2.9L1.7 12l1.9-2.2-.4-2.9 2.7-1 1-2.7 2.9.4z"
      />
      {/* An open book */}
      <path
        fill="#fff"
        d="M6.6 9.2c1.9-.5 3.7-.2 5 .8v6.3c-1.3-.9-3.1-1.2-5-.7zm10.8 0c-1.9-.5-3.7-.2-5 .8v6.3c1.3-.9 3.1-1.2 5-.7z"
      />
      {/* A spark above it */}
      <path fill="#fff" d="M12 4.6l.55 1.25 1.25.55-1.25.55L12 8.2l-.55-1.25-1.25-.55 1.25-.55z" />
    </svg>
  );
}
