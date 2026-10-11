/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/cn";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  return image ? (
    <img
      src={image}
      alt=""
      referrerPolicy="no-referrer"
      className={cn("size-8 rounded-full object-cover", className)}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "bg-primary-soft text-primary grid size-8 place-items-center rounded-full text-xs font-semibold",
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}
