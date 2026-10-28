import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/** The blue tick of a premium account. */
export function PremiumBadge({
  className,
  label = "Premium",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <BadgeCheck
      className={cn("inline size-4 shrink-0 fill-[#1d9bf0] text-white", className)}
      aria-label={label}
    >
      <title>{label}</title>
    </BadgeCheck>
  );
}
