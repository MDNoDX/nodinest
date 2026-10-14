import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import {
  DeleteCollectionButton,
  RankMoveButtons,
  RemoveItemButton,
} from "@/components/collections/collection-item-remove";
import { ResourceCard } from "@/components/library/resource-card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { pageContext } from "@/lib/page";
import { getCollection } from "@/server/notes";

export const dynamic = "force-dynamic";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db } = await pageContext();
  const t = await getTranslations();
  const d = await getCollection(db, ctx, id);
  if (!d) notFound();
  const name = d.collection.name ?? t(`collections.system.${d.collection.systemKey}`);
  const ranked = d.collection.ranked;
  const order = d.items.map((i) => i.id);
  return (
    <>
      <PageHeader
        section="collections"
        eyebrow={
          <Link href="/collections" className="hover:underline">
            {t("collections.title")}
          </Link>
        }
        title={name}
        subtitle={d.collection.description ?? (ranked ? t("collections.rankedHint") : undefined)}
        actions={
          <>
            <CollectionDialog
              collection={{ id, name, description: d.collection.description, ranked }}
            />
            {!d.collection.systemKey && <DeleteCollectionButton id={id} />}
          </>
        }
      />
      {d.items.length === 0 ? (
        <EmptyState title={t("collections.empty")} />
      ) : (
        <ol className={cn("grid gap-3", !ranked && "xl:grid-cols-2")}>
          {d.items.map((i, idx) =>
            i.resourceId ? (
              <li key={i.id}>
                <ResourceCard
                  rank={ranked ? idx + 1 : undefined}
                  r={{
                    resourceId: i.resourceId,
                    title: i.resourceTitle!,
                    type: i.resourceType!,
                    coverUrl: i.coverUrl,
                    coverFileId: i.coverFileId,
                    authors: i.authors,
                    description: i.description,
                    originalDate: i.originalDate,
                    publicationDate: i.publicationDate,
                    pageCount: i.pageCount,
                    durationSeconds: i.durationSeconds,
                    lessonCount: i.lessonCount,
                    rating: i.myRating,
                    status: i.myStatus,
                  }}
                  aside={
                    <>
                      <RemoveItemButton collectionId={id} target={{ resourceId: i.resourceId }} />
                      {ranked && <RankMoveButtons collectionId={id} order={order} index={idx} />}
                    </>
                  }
                />
              </li>
            ) : i.noteId ? (
              <li key={i.id} className="card flex items-start gap-3 p-4">
                {ranked && (
                  <span className="text-muted w-10 shrink-0 text-center text-xl font-bold">
                    #{idx + 1}
                  </span>
                )}
                <Link href={`/notes/${i.noteId}`} className="min-w-0 flex-1">
                  {i.noteKind === "quote" ? (
                    <blockquote className="border-accent line-clamp-4 border-l-2 pl-3 font-serif italic">
                      “{i.quoteText}”
                    </blockquote>
                  ) : (
                    <p className="line-clamp-3 text-sm">{i.noteTitle ?? i.noteBody}</p>
                  )}
                </Link>
                {ranked && <RankMoveButtons collectionId={id} order={order} index={idx} />}
                <RemoveItemButton collectionId={id} target={{ noteId: i.noteId }} />
              </li>
            ) : null,
          )}
        </ol>
      )}
    </>
  );
}
