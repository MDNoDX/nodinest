import { getTranslations } from "next-intl/server";
import { Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { fmtDate } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { memoryInsights } from "@/server/ai/memory";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("admin"))("insights") };
}

/** Superadmin only: what the AI companion has learned about the readers. */
export default async function AdminInsights() {
  const { ctx, locale, tz } = await pageContext({ admin: true });
  const t = await getTranslations("admin");
  const { people, top } = await memoryInsights(ctx);
  if (!people.length) return <EmptyState title={t("insightsEmpty")} />;
  const max = top[0]?.[1] ?? 1;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t("insightsTop")} />
        <ul className="flex flex-col gap-2 px-5 pb-5">
          {top.map(([k, n]) => (
            <li key={k} className="flex items-center gap-3 text-sm">
              <span className="w-48 shrink-0 truncate">{k}</span>
              <span className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-full">
                <span
                  className="bg-primary block h-full rounded-full"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </span>
              <span className="text-muted w-8 text-right tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </Card>
      <ul className="grid gap-3 md:grid-cols-2">
        {people.map((p) => (
          <li key={p.userId} className="card flex flex-col gap-2 p-4 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">
                {p.name} {p.username && <span className="text-muted">@{p.username}</span>}
              </span>
              <span className="text-muted text-xs">{fmtDate(p.updatedAt, locale, tz)}</span>
            </div>
            {p.memory.interests.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {p.memory.interests.map((i) => (
                  <span
                    key={i}
                    className="bg-primary-soft text-primary rounded-full px-2 py-0.5 text-xs"
                  >
                    {i}
                  </span>
                ))}
              </div>
            )}
            {p.memory.level && (
              <p>
                <b>{t("memLevel")}:</b> {p.memory.level}
              </p>
            )}
            {p.memory.language && (
              <p>
                <b>{t("memLanguage")}:</b> {p.memory.language}
              </p>
            )}
            {p.memory.goals.length > 0 && (
              <p>
                <b>{t("memGoals")}:</b> {p.memory.goals.join("; ")}
              </p>
            )}
            {p.memory.facts.length > 0 && (
              <p className="text-muted">{p.memory.facts.join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
