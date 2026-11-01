import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

/** Lucide has no mosque: a dome, a minaret and a crescent in its line style. */
export const MosqueIcon = forwardRef<SVGSVGElement, LucideProps>(function MosqueIcon(
  { size = 24, strokeWidth = 2, ...p },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 21h18" />
      <path d="M20 21V9l-1.5-3L17 9v12" />
      <path d="M4 21v-6a6 6 0 0 1 11 0 2 2 0 0 1 0 1v5" />
      <path d="M9.5 5v3.2" />
      <path d="M10.7 3.2a1.5 1.5 0 1 0 0 2.4 1.9 1.9 0 0 1 0-2.4" />
      <path d="M8 21v-3a1.5 1.5 0 0 1 3 0v3" />
    </svg>
  );
}) as unknown as LucideIcon;
