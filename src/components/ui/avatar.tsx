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
  // The initials sit under the picture: a picture that fails to load (an old
  // Google link, a removed file) leaves them showing instead of an empty hole.
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary-soft text-primary relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold",
        className,
      )}
    >
      {initials(name) || "?"}
      {image && (
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      )}
    </span>
  );
}
