import Link from "next/link";
import { CONTACT_EMAIL } from "@/content/legal";
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
  const owner = user.isSuperadmin || user.adminPerms.includes("feedback");
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
          <section className="card relative overflow-hidden p-5 sm:p-6">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-[var(--c-violet)]/15 blur-3xl"
            />
            <h2 className="relative mb-1 text-lg font-semibold">{t("feedback.formTitle")}</h2>
            <p className="text-muted relative mb-5 text-sm">{t("feedback.formHint")}</p>
            <div className="relative">
              <FeedbackForm />
            </div>
            <div className="border-border relative mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
              <a
                href="https://t.me/nodinest_bot"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                title="Telegram · @nodinest_bot"
                className="grid size-10 place-items-center rounded-full bg-[#229ED9] text-white shadow-sm transition-transform hover:scale-110"
              >
                <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
                  <path d="M21.9 4.4 18.7 19.5c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.3 13.2l-4.8-1.5c-1-.3-1-1 .2-1.5L20.6 2.9c.9-.3 1.6.2 1.3 1.5z" />
                </svg>
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                aria-label="Email"
                title={CONTACT_EMAIL}
                className="grid size-10 place-items-center rounded-full bg-white text-[#EA4335] shadow-sm ring-1 ring-black/10 transition-transform hover:scale-110"
              >
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                  <path fill="#4285F4" d="M2 6.5v11A1.5 1.5 0 0 0 3.5 19H6V9.8L2 6.5z" />
                  <path fill="#34A853" d="M18 19h2.5a1.5 1.5 0 0 0 1.5-1.5v-11L18 9.8z" />
                  <path fill="#FBBC04" d="M18 5.5v4.3l4-3.3V5a1.5 1.5 0 0 0-2.4-1.2z" />
                  <path fill="#EA4335" d="M6 9.8V5.5l6 4.6 6-4.6v4.3l-6 4.6z" />
                  <path fill="#C5221F" d="M2 5v1.5l4 3.3V5.5L4.4 3.8A1.5 1.5 0 0 0 2 5z" />
                </svg>
              </a>
            </div>
          </section>
          <aside className="flex flex-col gap-4">
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
