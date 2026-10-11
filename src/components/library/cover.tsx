/* eslint-disable @next/next/no-img-element */
import {
  BookOpen,
  FileText,
  Film,
  GraduationCap,
  Headphones,
  Mic,
  Presentation,
  Shapes,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { typeHue } from "@/lib/hues";

const TYPE_ICON = {
  book: BookOpen,
  course: GraduationCap,
  video: Film,
  lecture: Presentation,
  interview: Mic,
  article: FileText,
  podcast: Headphones,
  other: Shapes,
} as const;

export function coverSrc(r: { coverFileId?: string | null; coverUrl?: string | null }) {
  return r.coverFileId ? `/api/files/${r.coverFileId}` : r.coverUrl || null;
}

/** Book-like covers are portrait; media thumbnails are landscape. */
export function Cover({
  type,
  title,
  src,
  className,
  size = "md",
}: {
  type: keyof typeof TYPE_ICON;
  title: string;
  src: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = TYPE_ICON[type] ?? Shapes;
  const portrait = type === "book" || type === "course";
  const dims =
    size === "sm"
      ? portrait
        ? "w-10 h-14"
        : "w-16 h-10"
      : size === "lg"
        ? portrait
          ? "w-40 h-56"
          : "w-full max-w-sm aspect-video"
        : portrait
          ? "w-full aspect-[2/3]"
          : "w-full aspect-video";
  return (
    <div
      className={cn(
        "border-border bg-surface-2 relative shrink-0 overflow-hidden rounded-lg border",
        dims,
        className,
      )}
      style={typeHue(type)}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center"
          style={{
            color: "var(--hue)",
            background:
              "linear-gradient(155deg, color-mix(in oklab, var(--hue) 30%, var(--surface)) 0%, color-mix(in oklab, var(--hue) 7%, var(--surface)) 75%)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1.5 opacity-60"
            style={{ background: "var(--hue)" }}
          />
          <Icon className={cn(size === "sm" ? "size-4" : "size-8")} aria-hidden />
          {size !== "sm" && (
            <span className="text-foreground/80 line-clamp-3 text-xs leading-tight font-medium">
              {title}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { TYPE_ICON };
