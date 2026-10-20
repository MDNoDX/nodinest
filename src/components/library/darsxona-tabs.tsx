import { BookOpen, Building2, Users } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";

/** Darsxona's sections: my resources, people, publishers & channels. */
export async function DarsxonaTabs({ current }: { current: "library" | "people" | "publishers" }) {
  const t = await getTranslations("nav");
  const tabs = [
    { key: "library", href: "/library", icon: BookOpen, label: t("libraryTab") },
    { key: "people", href: "/people", icon: Users, label: t("people") },
    { key: "publishers", href: "/publishers", icon: Building2, label: t("publishers") },
  ] as const;
  return (
    <nav
      aria-label={t("library")}
      className="border-border -mt-3 mb-5 flex gap-1 overflow-x-auto border-b"
    >
      {tabs.map(({ key, href, icon: Icon, label }) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? "page" : undefined}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
            current === key
              ? "border-primary text-foreground"
              : "text-muted hover:text-foreground border-transparent",
          )}
        >
          <Icon className="size-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}
