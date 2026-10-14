import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { coverSrc } from "@/components/library/cover";
import { CoverTile } from "@/components/library/cover-tile";
import { PublisherDialog } from "@/components/publishers/publisher-dialog";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { shortYear } from "@/lib/dates";
import { pageContext } from "@/lib/page";
import { getPublisherDetail } from "@/server/publishers";

export const dynamic = "force-dynamic";

export default async function PublisherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db } = await pageContext();
  const t = await getTranslations();
  const d = await getPublisherDetail(db, ctx, id);
  if (!d) notFound();
  const p = d.publisher;
  const place = [p.city, p.country].filter(Boolean).join(", ");
  return (
    <>
      <PageHeader
        section="publishers"
        eyebrow={
          <Link href="/publishers" className="hover:underline">
            {t("publishers.title")}
          </Link>
        }
        title={p.name}
        subtitle={[place, t("publishers.books", { count: d.books.length })]
          .filter(Boolean)
          .join(" · ")}
        actions={d.canEdit ? <PublisherDialog publisher={p} /> : undefined}
      />
      {(p.description || p.websiteUrl) && (
        <div className="card mb-6 p-5">
          {p.description && (
            <p className="text-foreground/90 text-[15px] leading-relaxed">{p.description}</p>
          )}
          {p.websiteUrl && (
            <a
              href={p.websiteUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary mt-2 inline-flex items-center gap-1.5 text-sm hover:underline"
            >
              <ExternalLink className="size-3.5" /> {new URL(p.websiteUrl).hostname}
            </a>
          )}
        </div>
      )}
      {d.books.length === 0 ? (
        <EmptyState title={t("publishers.noBooks")} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {d.books.map((b) => (
            <li key={b.id}>
              <CoverTile
                id={b.id}
                type="book"
                title={b.title}
                cover={coverSrc({ coverUrl: b.cover_url, coverFileId: b.cover_file_id })}
                line={b.authors}
                status={b.my_status}
                meta={b.publication_date ? <span>{shortYear(b.publication_date)}</span> : null}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
