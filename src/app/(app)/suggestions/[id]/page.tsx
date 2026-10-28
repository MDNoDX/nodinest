import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ReviewActions, WithdrawButton } from "@/components/suggestions/review-actions";
import { Badge, Card, PageHeader } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { getSuggestionForReview } from "@/server/suggestions";

export async function generateMetadata() {
  return { title: (await getTranslations("nav"))("suggestions") };
}

export const dynamic = "force-dynamic";

function show(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v))
    return v.length
      ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("\n")
      : "—";
  if (typeof v === "object") return JSON.stringify(v, null, 1);
  return String(v);
}

export default async function SuggestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, user, locale, tz } = await pageContext();
  const t = await getTranslations();
  const d = await getSuggestionForReview(db, ctx, id);
  if (!d) notFound();
  const s = d.suggestion;
  const proposed = (s.payload ?? {}) as Record<string, unknown>;
  const current = (d.current ?? {}) as Record<string, unknown>;
  const base = (s.baseSnapshot ?? null) as Record<string, unknown> | null;
  const keys = [...new Set([...Object.keys(proposed), ...Object.keys(current)])];
  const rows = keys
    .map((k) => ({
      k,
      before: show(current[k]),
      after: s.operation === "archive" ? "—" : show(proposed[k]),
    }))
    .filter((r) => (s.operation === "create" ? r.after !== "—" : r.before !== r.after));
  const stale = base && d.current && JSON.stringify(base) !== JSON.stringify(d.current);
  const targetHref = s.targetId ?? s.appliedTargetId;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        section="suggestions"
        eyebrow={
          <Link href="/suggestions" className="hover:underline">
            {t("suggestions.title")}
          </Link>
        }
        title={`${t(`suggestions.operations.${s.operation}`)} ${t(`suggestions.targets.${s.targetType}`)}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {d.author && t("suggestions.submittedBy", { name: d.author.name })} ·{" "}
            {fmtDateTime(s.createdAt, locale, tz)}
            <Badge
              tone={
                s.status === "pending" ? "warning" : s.status === "approved" ? "success" : "neutral"
              }
            >
              {t(`suggestions.statuses.${s.status}`)}
            </Badge>
            <Badge>{t(`suggestions.origin.${s.origin === "ai" ? "ai" : "manual"}`)}</Badge>
          </span>
        }
        actions={
          targetHref ? (
            <Link
              className="text-primary text-sm font-medium hover:underline"
              href={`/${s.targetType === "person" ? "people" : "library"}/${targetHref}`}
            >
              {t("suggestions.viewTarget")} →
            </Link>
          ) : undefined
        }
      />
      {stale && s.status === "pending" && (
        <p className="bg-warning-soft text-warning mb-4 rounded-lg px-4 py-2 text-sm">
          {t("suggestions.staleWarning")}
        </p>
      )}
      {s.explanation && (
        <Card className="mb-4 p-4">
          <div className="text-muted text-xs font-semibold uppercase">
            {t("suggestions.explanation")}
          </div>
          <p className="prose-nn mt-1 text-sm">{s.explanation}</p>
          {s.sourceUrls.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {s.sourceUrls.map((u) => (
                <li key={u}>
                  <a
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary hover:underline"
                  >
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Card className="mb-6 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-muted p-4 text-sm">{t("suggestions.noChanges")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-border text-muted border-b text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">{t("suggestions.field")}</th>
                {s.operation !== "create" && (
                  <th className="px-4 py-2 font-medium">{t("suggestions.before")}</th>
                )}
                <th className="px-4 py-2 font-medium">{t("suggestions.after")}</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y align-top">
              {rows.map((r) => (
                <tr key={r.k}>
                  <th scope="row" className="text-muted px-4 py-2 font-mono text-xs font-normal">
                    {r.k}
                  </th>
                  {s.operation !== "create" && (
                    <td className="text-danger/90 decoration-danger/40 max-w-xs px-4 py-2 break-words whitespace-pre-wrap line-through">
                      {r.before}
                    </td>
                  )}
                  <td className="text-success max-w-xs px-4 py-2 break-words whitespace-pre-wrap">
                    {r.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {s.status === "pending" && user.role === "superadmin" && <ReviewActions id={s.id} />}
      {s.status === "pending" && user.role !== "superadmin" && s.userId === user.id && (
        <WithdrawButton id={s.id} />
      )}
      {s.reviewNote && (
        <p className="text-muted mt-4 text-sm">
          {t("suggestions.reviewNote")}: {s.reviewNote}
        </p>
      )}
    </div>
  );
}
