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
  author,
}: {
  /** Shown on the typographic cover when there is no image. */
  author?: string | null;
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
        <TypoCover type={type} title={title} author={author} size={size} Icon={Icon} />
      )}
    </div>
  );
}

/** Deep, calm book-cloth colours for covers made from the title. */
const CLOTH = [
  ["#1e3a8a", "#3b5bdb"],
  ["#134e4a", "#2b8a7e"],
  ["#7f1d1d", "#b0413e"],
  ["#3f2a56", "#6d4c9f"],
  ["#1f3b2c", "#3f7a52"],
  ["#5b3a12", "#a8742c"],
  ["#1e293b", "#475569"],
] as const;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A cover for items without an image: the title set in serif on book cloth,
 * framed like a classic hardcover (colour picked from the title, so it stays
 * the same everywhere).
 */
function TypoCover({
  type,
  title,
  author,
  size,
  Icon,
}: {
  type: string;
  title: string;
  author?: string | null;
  size: "sm" | "md" | "lg";
  Icon: (typeof TYPE_ICON)[keyof typeof TYPE_ICON];
}) {
  const [from, to] = CLOTH[hash(title) % CLOTH.length];
  const portrait = type === "book" || type === "course";
  return (
    <div
      className="absolute inset-0 flex flex-col text-white"
      style={{ background: `linear-gradient(160deg, ${to} 0%, ${from} 70%)` }}
    >
      {/* Spine shadow + a thin gilt frame. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-2 bg-black/20" />
      {size !== "sm" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[7%] rounded-[3px] border border-white/25"
        />
      )}
      {size === "sm" ? (
        <span className="m-auto font-serif text-lg leading-none font-semibold">
          {title.trim().charAt(0).toUpperCase()}
        </span>
      ) : (
        <div
          className={cn(
            "relative flex h-full flex-col items-center px-[14%] text-center",
            portrait ? "justify-center gap-2 py-[16%]" : "justify-center gap-1 py-[8%]",
          )}
        >
          <Icon className="size-4 opacity-60" aria-hidden />
          <span
            className={cn(
              "font-serif leading-tight font-semibold text-balance",
              size === "lg" ? "line-clamp-4 text-xl" : "line-clamp-4 text-sm",
            )}
          >
            {title}
          </span>
          {author && (
            <>
              <span aria-hidden className="h-px w-6 bg-white/40" />
              <span className="line-clamp-2 text-[10px] tracking-wide uppercase opacity-80">
                {author}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { TYPE_ICON };
