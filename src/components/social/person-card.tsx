import Link from "next/link";
import { useTranslations } from "next-intl";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { Avatar } from "@/components/ui/avatar";
import type { PersonCard as P } from "@/server/social";

export function PersonCard({ p }: { p: P }) {
  const t = useTranslations("social");
  return (
    <Link
      href={`/u/${p.username}`}
      className="card hover:border-border-strong flex items-center gap-3 p-3 transition-colors"
    >
      <Avatar name={p.name} image={p.image} className="size-11" />
      <span className="min-w-0">
        <span className="flex items-center gap-1 truncate font-semibold">
          {p.name} {p.premium && <PremiumBadge />}
        </span>
        <span className="text-muted block truncate text-xs">
          @{p.username} · {t("itemsN", { n: p.items })}
        </span>
      </span>
    </Link>
  );
}
