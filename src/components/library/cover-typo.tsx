import { cn } from "@/lib/cn";

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
export function TypoCover({
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
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
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

