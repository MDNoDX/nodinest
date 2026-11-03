import { BookOpen, Brain, Building2, FolderHeart, Play, Quote, Users } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import { pageContext } from "@/lib/page";
import { dueCount } from "@/server/study-cards";

/**
 * Darsxona's sections: my resources, review (questions due today, counted on
 * the tab and offered on top of the library when there are any), quotes,
 * collections, people, channels.
 */
export async function DarsxonaTabs({
  current,
}: {
  current: "library" | "review" | "notes" | "collections" | "people" | "publishers";
}) {
  const t = await getTranslations("nav");
  const tr = await getTranslations("review");
  const { ctx } = await pageContext();
  const due = await dueCount(ctx).catch(() => 0);
  const tabs = [
    { key: "library", href: "/library", icon: BookOpen, label: t("libraryTab") },
    { key: "notes", href: "/notes", icon: Quote, label: t("notes") },
    { key: "collections", href: "/collections", icon: FolderHeart, label: t("collections") },
    { key: "people", href: "/people", icon: Users, label: t("people") },
    { key: "publishers", href: "/publishers", icon: Building2, label: t("publishers") },
  ] as const;
  return (
    <>
      <nav
        aria-label={t("library")}
        className="border-border -mt-3 mb-5 flex gap-1 overflow-x-auto border-b max-sm:gap-0"
      >
        {tabs.map(({ key, href, icon: Icon, label }) => (
          <Link
            key={key}
            href={href}
            aria-current={current === key ? "page" : undefined}
            aria-label={label}
            title={label}
            className={cn(
              // Phones: only the icon, big enough for a thumb; the name from sm up.
              "-mb-px flex shrink-0 items-center justify-center gap-1.5 border-b-2 py-2 text-sm font-medium max-sm:h-11 max-sm:flex-1 sm:px-3",
              current === key
                ? "border-primary text-foreground"
                : "text-muted hover:text-foreground border-transparent",
            )}
          >
            <Icon className="size-5 sm:size-4" />
            <span className="max-sm:sr-only">{label}</span>
          </Link>
        ))}
      </nav>
      {current === "library" && due > 0 && (
        <Link
          href="/review"
          className="border-primary/30 bg-primary-soft hover:border-primary/60 mb-5 flex items-center gap-3 rounded-2xl border p-3 transition-colors"
        >
          <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl">
            <Brain className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{tr("dueToday", { n: due })}</span>
            <span className="text-muted block text-xs">{tr("dueHint")}</span>
          </span>
          <span className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold">
            <Play className="size-4 fill-current" /> {tr("start")}
          </span>
        </Link>
      )}
    </>
  );
}
