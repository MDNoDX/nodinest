import { BarChart3, CircleUserRound } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";

/** My profile's two parts: the profile others see, and my numbers (only I see them). */
export async function ProfileTabs({
  current,
  username,
}: {
  current: "profile" | "stats";
  username: string;
}) {
  const t = await getTranslations("nav");
  const tabs = [
    { key: "profile", href: `/u/${username}`, icon: CircleUserRound, label: t("profile") },
    { key: "stats", href: "/stats", icon: BarChart3, label: t("stats") },
  ] as const;
  return (
    <nav aria-label={t("profile")} className="border-border mb-5 flex gap-1 border-b">
      {tabs.map(({ key, href, icon: Icon, label }) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
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
