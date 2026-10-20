import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Send } from "lucide-react";
import { FeedbackForm, FeedbackStatusButtons } from "@/components/suggestions/feedback-form";
import { WithdrawButton } from "@/components/suggestions/review-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { pageContext, sp, type SP } from "@/lib/page";
import { listAllFeedback, listMyFeedback } from "@/server/feedback";
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
  // Messages to the admin reach the superadmin account even outside admin mode.
  const owner = !!user.isSuperadmin;
  const tab =
    sp(p.tab) === "catalog" ? "catalog" : sp(p.tab) === "inbox" && owner ? "inbox" : "write";
  const [items, mine, inbox] = await Promise.all([
    tab === "catalog" ? listSuggestions(db, ctx, { scope, status }) : Promise.resolve([]),
    tab === "write" ? listMyFeedback(ctx) : Promise.resolve([]),
    tab === "inbox" ? listAllFeedback(ctx) : Promise.resolve([]),
  ]);
  const link = (o: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({
      tab: "catalog",
      scope: isAdmin ? (scope === "all" ? "review" : "mine") : null,
      status,
      ...o,
    }))
      if (v) u.set(k, v);
    return `/suggestions?${u}`;
  };
  return (
    <>
      <PageHeader section="suggestions" title={t("suggestions.title")} />
      <nav className="border-border mb-5 flex gap-1 overflow-x-auto border-b">
        {(
          [
            ["write", t("feedback.tabWrite")],
            ["catalog", t("feedback.tabCatalog")],
            ...(owner ? [["inbox", t("feedback.tabInbox")] as const] : []),
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={`/suggestions?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
              tab === k
                ? "border-primary text-foreground"
                : "text-muted hover:text-foreground border-transparent",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "write" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section className="card p-5">
            <h2 className="mb-1 font-semibold">{t("feedback.formTitle")}</h2>
            <p className="text-muted mb-4 text-sm">{t("feedback.formHint")}</p>
            <FeedbackForm />
          </section>
          <aside className="flex flex-col gap-4">
            <a
              href="https://t.me/mdnodx"
              target="_blank"
              rel="noopener noreferrer"
              className="card group flex items-center gap-3 p-5 transition-shadow hover:shadow-md"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#229ED9] text-white shadow-sm">
                <Send className="size-5 -translate-x-px" />
              </span>
              <span className="min-w-0">
                <span className="text-muted block text-xs font-semibold tracking-wide uppercase">
                  {t("feedback.contactTitle")}
                </span>
                <span className="block font-semibold group-hover:underline">t.me/mdnodx</span>
                <span className="text-muted block text-xs">{t("feedback.contactHint")}</span>
              </span>
            </a>
            {mine.length > 0 && (
              <section className="card p-4">
                <h3 className="mb-2 text-sm font-semibold">{t("feedback.mine")}</h3>
                <ul className="flex flex-col gap-2">
                  {mine.map((f) => (
                    <li key={f.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">{f.title}</span>
                        <Badge
                          tone={
                            f.status === "done"
                              ? "success"
                              : f.status === "read"
                                ? "primary"
                                : "neutral"
                          }
                        >
                          {t(`feedback.status.${f.status as "new"}`)}
                        </Badge>
                      </div>
                      <div className="text-muted text-xs">
                        {fmtDateTime(f.createdAt, locale, tz)}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {tab === "inbox" &&
        (inbox.length === 0 ? (
          <EmptyState title={t("feedback.inboxEmpty")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {inbox.map((f) => (
              <li key={f.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{f.title}</span>
                  <Badge
                    tone={
                      f.status === "done" ? "success" : f.status === "read" ? "primary" : "warning"
                    }
                  >
                    {t(`feedback.status.${f.status as "new"}`)}
                  </Badge>
                  <span className="ml-auto">
                    <FeedbackStatusButtons id={f.id} status={f.status} />
                  </span>
                </div>
                <p className="mt-2 text-sm whitespace-pre-line">{f.body}</p>
                <div className="text-muted mt-2 text-xs">
                  {f.name} · {f.email}
                  {f.contact ? ` · ${t("feedback.contactShort")}: ${f.contact}` : ""} ·{" "}
                  {fmtDateTime(f.createdAt, locale, tz)}
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === "catalog" && (
        <>
          <p className="text-muted mb-4 text-sm">{t("feedback.catalogExplain")}</p>
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
                        <Badge>
                          {t(`suggestions.origin.${s.origin === "ai" ? "ai" : "manual"}`)}
                        </Badge>
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
      )}
    </>
  );
}
