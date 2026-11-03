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
import { CoverPicture, SafeImg } from "./cover-picture";
import { TypoCover } from "./cover-typo";

const TYPE_ICON = {
  book: BookOpen,
  course: GraduationCap,
  video: Film,
  lecture: Presentation,
  interview: Mic,
  article: FileText,
  podcast: Headphones,
  file: FileText,
  other: Shapes,
} as const;

/** A cover's picture: our own files as a small copy (lists and cards never need the original). */
export function coverSrc(
  r: { coverFileId?: string | null; coverUrl?: string | null },
  width: 160 | 320 | 480 | 720 = 480,
) {
  return r.coverFileId ? `/api/files/${r.coverFileId}?w=${width}` : r.coverUrl || null;
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
  const typo = <TypoCover type={type} title={title} author={author} size={size} Icon={Icon} />;
  // A picture that cannot be loaded turns into the title cover (never a broken image).
  const face = src ? <CoverPicture src={src} fallback={typo} /> : typo;
  // Books and courses: a little 3D book (it turns on hover and shows its pages).
  if (portrait && size !== "sm")
    return (
      <div className={cn("cover-3d relative shrink-0", dims, className)} style={typeHue(type)}>
        <div className="cover-face bg-surface-2 absolute inset-0 overflow-hidden rounded-[2px_3px_3px_2px]">
          {face}
          <span aria-hidden className="cover-glare" />
        </div>
        <span aria-hidden className="cover-pages" />
        <span aria-hidden className="cover-back" />
      </div>
    );
  // Audio: a vinyl record half out of its sleeve, in a 16:9 frame like videos,
  // with nothing behind them (only the sleeve and the record).
  // On hover the record slides out and turns, its label (the cover) with it.
  if ((type === "podcast" || type === "interview") && size !== "sm")
    return (
      <div
        className={cn(
          "rec relative shrink-0 overflow-hidden",
          size === "lg" ? "aspect-video w-full max-w-sm" : "aspect-video w-full",
          className,
        )}
        style={typeHue(type)}
      >
        <div className="rec-disc absolute top-[9%] bottom-[9%] aspect-square rounded-full">
          <div className="rec-spin absolute inset-0 rounded-full">
            <span className="rec-label absolute inset-[31%] overflow-hidden rounded-full">
              {src ? (
                <SafeImg src={src} className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center bg-[var(--hue)] text-white">
                  <Icon className="size-1/2" />
                </span>
              )}
            </span>
            <span className="rec-hole absolute top-1/2 left-1/2 size-[5%] -translate-1/2 rounded-full" />
          </div>
          <span aria-hidden className="rec-sheen absolute inset-0 rounded-full" />
        </div>
        <div className="rec-sleeve bg-surface-2 absolute top-[7%] bottom-[7%] left-[6%] aspect-square overflow-hidden rounded-md">
          {face}
        </div>
      </div>
    );
  // Articles and files: a sheet of paper.
  if ((type === "article" || type === "file") && size !== "sm")
    return (
      <div
        className={cn(
          "cover-paper bg-surface-2 relative shrink-0 overflow-hidden",
          size === "lg" ? "aspect-[3/4] w-40" : "aspect-[3/4] w-full",
          className,
        )}
        style={typeHue(type)}
      >
        {face}
      </div>
    );
  const motion =
    size === "sm"
      ? ""
      : type === "video" || type === "lecture"
        ? "cover-video"
        : type === "podcast" || type === "interview"
          ? "cover-audio"
          : "";
  return (
    <div
      className={cn(
        "border-border bg-surface-2 relative shrink-0 overflow-hidden rounded-lg border",
        motion,
        dims,
        className,
      )}
      style={typeHue(type)}
    >
      {face}
      {motion === "cover-video" && (
        <span aria-hidden className="cover-play absolute inset-0 grid place-items-center">
          <span className="grid size-12 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-5 fill-current">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
        </span>
      )}
      {motion === "cover-audio" && (
        <span
          aria-hidden
          className="cover-eq absolute inset-x-0 bottom-0 flex h-1/3 items-end justify-center gap-1 bg-gradient-to-t from-black/60 to-transparent pb-2"
        >
          {[0.1, 0.45, 0.2, 0.6, 0.3, 0.5, 0.15].map((d, i) => (
            <span
              key={i}
              className="w-1 origin-bottom rounded-full bg-white/90"
              style={{ height: `${40 + ((i * 17) % 45)}%`, animationDelay: `${d}s` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

export { TYPE_ICON };
