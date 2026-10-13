import { hueStyle } from "@/lib/hues";
import { FolderHeart } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import { PageHeader } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { getCollectionStats } from "@/server/stats";
import { listCollections } from "@/server/notes";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("collections"))("title") };
}

export default async function CollectionsPage() {
  const { ctx, db, tz } = await pageContext();
  const t = await getTranslations();
  const [cols, stats] = await Promise.all([
    listCollections(db, ctx),
    getCollectionStats(db, ctx, { timeZone: tz }),
  ]);
  const shelves = (["planned", "in_progress", "completed", "paused"] as const).map((s) => ({
    key: s,
    count: stats.totals[s],
  }));
  return (
    <>
      <PageHeader
        section="collections"
        title={t("collections.title")}
        subtitle={t("collections.subtitle")}
        actions={<CollectionDialog />}
      />
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold">{t("collections.shelves")}</h2>
        <p className="text-muted mb-3 text-xs">{t("collections.shelvesHint")}</p>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {shelves.map((s) => (
            <li key={s.key}>
              <Link
                href={`/library?status=${s.key}`}
                className="card hover:border-border-strong block p-4"
              >
                <div className="text-sm font-medium">{t(`status.${s.key}`)}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{s.count}</div>
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
                  <span className="block truncate text-[15px] font-semibold">
                    {c.name ?? t(`collections.system.${c.systemKey}`)}
                  </span>
                  {c.description && (
                    <span className="text-muted line-clamp-2 block text-xs">{c.description}</span>
                  )}
                  <span className="text-muted flex items-center gap-1.5 text-xs">
                    {t("collections.items", { count: c.count })}
                    {c.ranked && (
                      <span
                        className="chip rounded px-1.5 py-px text-[10px] font-semibold"
                        style={hueStyle("amber")}
                      >
                        {t("collections.ranked")}
                      </span>
                    )}
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
