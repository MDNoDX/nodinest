import { FolderHeart } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import { PageHeader } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { getStats } from "@/server/stats";
import { listCollections } from "@/server/notes";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("collections"))("title") };
}

export default async function CollectionsPage() {
  const { ctx, db, tz, today } = await pageContext();
  const t = await getTranslations();
  const [cols, stats] = await Promise.all([
    listCollections(db, ctx),
    getStats(db, ctx, { timeZone: tz, today, range: { from: today, to: today } }),
  ]);
  const shelves = (["planned", "in_progress", "completed", "paused", "abandoned"] as const).map(
    (s) => ({ key: s, count: stats.records[s] }),
  );
  return (
    <>
      <PageHeader
        title={t("collections.title")}
        subtitle={t("collections.subtitle")}
        actions={<CollectionDialog />}
      />
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold">{t("collections.shelves")}</h2>
        <p className="text-muted mb-3 text-xs">{t("collections.shelvesHint")}</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shelves.map((s) => (
            <li key={s.key}>
              <Link
                href={`/library?status=${s.key}`}
                className="card hover:border-border-strong block p-4"
              >
                <div className="text-sm font-medium">{t(`status.${s.key}`)}</div>
                <div className="mt-1 font-serif text-2xl font-semibold tabular-nums">{s.count}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("collections.mine")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cols.map((c) => (
            <li key={c.id}>
              <Link
                href={`/collections/${c.id}`}
                className="card hover:border-border-strong flex items-start gap-3 p-4"
              >
                <span className="bg-accent-soft text-accent grid size-10 shrink-0 place-items-center rounded-lg">
                  <FolderHeart className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-serif text-[15px] font-semibold">
                    {c.name ?? t(`collections.system.${c.systemKey}`)}
                  </span>
                  {c.description && (
                    <span className="text-muted line-clamp-2 block text-xs">{c.description}</span>
                  )}
                  <span className="text-muted block text-xs">
                    {t("collections.items", { count: c.count })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
