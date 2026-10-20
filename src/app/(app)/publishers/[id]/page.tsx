import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { coverSrc } from "@/components/library/cover";
import { CoverTile } from "@/components/library/cover-tile";
import { PublisherDialog } from "@/components/publishers/publisher-dialog";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { shortYear } from "@/lib/dates";
import { fmtMinutes } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { getPublisherDetail } from "@/server/publishers";

export const dynamic = "force-dynamic";

export default async function PublisherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, locale } = await pageContext();
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
        subtitle={[
          t(`publishers.kinds.${p.kind}` as "publishers.kinds.publisher"),
          place,
          t("publishers.items", { count: d.items.length }),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={d.canEdit ? <PublisherDialog publisher={p} /> : undefined}
      />
      {d.mine && d.mine.in_library > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">{t("publishers.whatILearned")}</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["completed", d.mine.completed],
                ["inProgress", d.mine.in_progress],
                d.mine.seconds ? ["hours", fmtMinutes(d.mine.seconds, locale)] : null,
                d.mine.pages ? ["pages", d.mine.pages] : null,
                ["quotes", d.mine.quotes],
                ["notes", d.mine.notes],
                d.mine.words ? ["words", d.mine.words] : null,
              ].filter(Boolean) as [string, number | string][]
            ).map(([k, v]) => (
              <div key={k} className="card p-3">
                <dt className="text-muted text-xs">
                  {t(`publishers.stat.${k}` as "publishers.stat.completed")}
                </dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
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
      {d.items.length === 0 ? (
        <EmptyState title={t("publishers.noBooks")} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {d.items.map((b) => (
            <li key={b.id}>
              <CoverTile
                id={b.id}
                type={b.type as "book"}
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
