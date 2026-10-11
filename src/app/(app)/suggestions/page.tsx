import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WithdrawButton } from "@/components/suggestions/review-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { pageContext, sp, type SP } from "@/lib/page";
import { listSuggestions } from "@/server/suggestions";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("suggestions"))("title") };
}
const TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  withdrawn: "neutral",
} as const;

export default async function SuggestionsPage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, user, locale, tz } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const isAdmin = user.role === "superadmin";
  const scope = isAdmin && sp(p.scope) !== "mine" ? "all" : "mine";
  const statusParam = sp(p.status);
  const status = ["pending", "approved", "rejected", "withdrawn"].includes(statusParam ?? "")
    ? statusParam!
    : scope === "all"
      ? "pending"
      : null;
  const items = await listSuggestions(db, ctx, { scope, status });
  const link = (o: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({
      scope: isAdmin ? (scope === "all" ? "review" : "mine") : null,
      status,
      ...o,
    }))
      if (v) u.set(k, v);
    return `/suggestions?${u}`;
  };
  return (
    <>
      <PageHeader
        section="suggestions"
        title={t("suggestions.title")}
        subtitle={t("suggestions.subtitle")}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {isAdmin && (
          <nav className="bg-surface-2 inline-flex rounded-lg p-1">
            {(
              [
                ["review", t("suggestions.review")],
                ["mine", t("suggestions.mine")],
              ] as const
            ).map(([k, label]) => (
              <Link
                key={k}
                href={link({ scope: k, status: null })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  (k === "review" ? scope === "all" : scope === "mine")
                    ? "bg-surface shadow-sm"
                    : "text-muted",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        <nav className="flex flex-wrap gap-1">
          {(["pending", "approved", "rejected", "withdrawn"] as const).map((s) => (
            <Link
              key={s}
              href={link({ status: status === s ? null : s })}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                status === s ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted",
              )}
            >
              {t(`suggestions.statuses.${s}`)}
            </Link>
          ))}
        </nav>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t("suggestions.empty")} />
      ) : (
        <ul className="card divide-border divide-y">
          {items.map((s) => {
            const pl = s.payload as { fullName?: string; title?: string };
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/suggestions/${s.id}`} className="font-medium hover:underline">
                    {t(`suggestions.operations.${s.operation}`)}{" "}
                    {t(`suggestions.targets.${s.targetType}`)}:{" "}
                    {pl.fullName ?? pl.title ?? s.targetId?.slice(0, 8)}
                  </Link>
                  <div className="text-muted mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span>{fmtDateTime(s.createdAt, locale, tz)}</span>
                    <Badge>{t(`suggestions.origin.${s.origin === "ai" ? "ai" : "manual"}`)}</Badge>
                    {s.reviewNote && <span>· {s.reviewNote}</span>}
                  </div>
                </div>
                <Badge tone={TONE[s.status]}>{t(`suggestions.statuses.${s.status}`)}</Badge>
                {s.status === "pending" && s.userId === user.id && <WithdrawButton id={s.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
