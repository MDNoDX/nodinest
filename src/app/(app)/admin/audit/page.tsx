import { getTranslations } from "next-intl/server";
import { Card, EmptyState, Pagination } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/format";
import { pageContext, spInt, type SP } from "@/lib/page";
import { listAudit } from "@/server/admin";

export default async function AdminAudit({ searchParams }: { searchParams: SP }) {
  const { ctx, db, locale, tz } = await pageContext({ admin: true });
  const t = await getTranslations();
  const page = spInt((await searchParams).page);
  const rows = await listAudit(db, ctx, { page });
  if (rows.length === 0 && page === 1) return <EmptyState title={t("admin.auditEmpty")} />;
  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-border text-muted border-b text-xs">
            <tr>
              <th className="px-4 py-2 font-medium">{t("admin.when")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.actor")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.action")}</th>
              <th className="px-4 py-2 font-medium">{t("admin.entity")}</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y align-top">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-muted px-4 py-2 text-xs whitespace-nowrap">
                  {fmtDateTime(r.createdAt, locale, tz)}
                </td>
                <td className="px-4 py-2 text-xs">{r.actorName ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-2 text-xs">
                  {r.entityType}{" "}
                  <span className="text-muted font-mono">{r.entityId?.slice(0, 8)}</span>
                  {r.meta ? (
                    <details className="mt-1">
                      <summary className="text-muted cursor-pointer">meta</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto text-[11px] whitespace-pre-wrap">
                        {JSON.stringify(r.meta, null, 1)}
                      </pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pagination
        page={page}
        total={rows.length === 50 ? page * 50 + 1 : (page - 1) * 50 + rows.length}
        pageSize={50}
        hrefFor={(n) => `/admin/audit?page=${n}`}
        labels={{ previous: t("common.previous"), next: t("common.next"), page: String(page) }}
      />
    </>
  );
}
