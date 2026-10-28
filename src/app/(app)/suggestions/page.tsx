import { Bot } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FeedbackForm, FeedbackStatusButtons } from "@/components/suggestions/feedback-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { pageContext, sp, type SP } from "@/lib/page";
import { listAllFeedback, listMyFeedback } from "@/server/feedback";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("suggestions"))("title") };
}

/**
 * Takliflar: write to the admin (title, text, how to reach you) and the
 * Telegram contact. The superadmin account also has the inbox.
 */
export default async function SuggestionsPage({ searchParams }: { searchParams: SP }) {
  const { ctx, user, locale, tz } = await pageContext();
  const t = await getTranslations();
  const p = await searchParams;
  const owner = !!user.isSuperadmin;
  const tab = sp(p.tab) === "inbox" && owner ? "inbox" : "write";
  const [mine, inbox] = await Promise.all([
    tab === "write" ? listMyFeedback(ctx) : Promise.resolve([]),
    tab === "inbox" ? listAllFeedback(ctx) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader section="suggestions" title={t("suggestions.title")} />
      {owner && (
        <nav className="border-border mb-5 flex gap-1 overflow-x-auto border-b">
          {(
            [
              ["write", t("feedback.tabWrite")],
              ["inbox", t("feedback.tabInbox")],
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
      )}

      {tab === "write" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section className="card p-5">
            <h2 className="mb-1 font-semibold">{t("feedback.formTitle")}</h2>
            <p className="text-muted mb-4 text-sm">{t("feedback.formHint")}</p>
            <FeedbackForm />
          </section>
          <aside className="flex flex-col gap-4">
            <a
              href="https://t.me/nodinest_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="card group flex items-center gap-3 p-5 transition-shadow hover:shadow-md"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#229ED9] text-white shadow-sm">
                <Bot className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="text-muted block text-xs font-semibold tracking-wide uppercase">
                  {t("feedback.botTitle")}
                </span>
                <span className="block font-semibold group-hover:underline">@nodinest_bot</span>
                <span className="text-muted block text-xs">{t("feedback.botHint")}</span>
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
                      {f.reply && (
                        <p className="bg-primary-soft/60 mt-1.5 rounded-lg p-2.5 text-[13px] whitespace-pre-line">
                          <span className="text-primary block text-xs font-semibold">
                            {t("feedback.answer")}
                          </span>
                          {f.reply}
                        </p>
                      )}
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
                {f.reply && (
                  <p className="bg-primary-soft/60 mt-2 rounded-lg p-2.5 text-sm whitespace-pre-line">
                    <span className="text-primary block text-xs font-semibold">
                      {t("feedback.answer")}
                    </span>
                    {f.reply}
                  </p>
                )}
                <div className="text-muted mt-2 text-xs">
                  {f.source === "bot" ? "Telegram bot · " : ""}
                  {f.name ?? ""}
                  {f.email && !f.email.endsWith(".invalid") ? ` · ${f.email}` : ""}
                  {f.contact ? ` · ${t("feedback.contactShort")}: ${f.contact}` : ""} ·{" "}
                  {fmtDateTime(f.createdAt, locale, tz)}
                </div>
              </li>
            ))}
          </ul>
        ))}
    </>
  );
}
