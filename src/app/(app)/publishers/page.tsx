import { Building2 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublisherDialog } from "@/components/publishers/publisher-dialog";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { hueFor, hueStyle } from "@/lib/hues";
import { pageContext } from "@/lib/page";
import { listPublishers } from "@/server/publishers";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("publishers"))("title") };
}

export default async function PublishersPage() {
  const { ctx, db } = await pageContext();
  const t = await getTranslations();
  const list = await listPublishers(db, ctx);
  return (
    <>
      <PageHeader
        section="publishers"
        title={t("publishers.title")}
        subtitle={t("publishers.subtitle")}
        actions={<PublisherDialog />}
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={t("publishers.empty")}
          body={t("publishers.emptyBody")}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                href={`/publishers/${p.id}`}
                className="card hover:border-border-strong flex items-center gap-3 p-4 transition-colors"
              >
                <span
                  className="chip grid size-11 shrink-0 place-items-center rounded-xl text-lg font-bold"
                  style={hueStyle(hueFor(p.id))}
                  aria-hidden
                >
                  {p.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="text-muted block text-xs">
                    {[p.city, t("publishers.books", { count: p.books })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
