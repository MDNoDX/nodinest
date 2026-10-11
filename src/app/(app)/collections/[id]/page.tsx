import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import {
  DeleteCollectionButton,
  RemoveItemButton,
} from "@/components/collections/collection-item-remove";
import { Cover, coverSrc } from "@/components/library/cover";
import { EmptyState, PageHeader } from "@/components/ui/misc";
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
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/collections" className="hover:underline">
            {t("collections.title")}
          </Link>
        }
        title={name}
        subtitle={d.collection.description ?? undefined}
        actions={
          <>
            <CollectionDialog collection={{ id, name, description: d.collection.description }} />
            <DeleteCollectionButton id={id} />
          </>
        }
      />
      {d.items.length === 0 ? (
        <EmptyState title={t("collections.empty")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {d.items.map((i) =>
            i.resourceId ? (
              <li key={i.id} className="card flex items-center gap-3 p-3">
                <Cover
                  type={i.resourceType!}
                  title={i.resourceTitle!}
                  src={coverSrc({ coverFileId: i.coverFileId, coverUrl: i.coverUrl })}
                  size="sm"
                />
                <Link href={`/library/${i.resourceId}`} className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium hover:underline">
                    {i.resourceTitle}
                  </span>
                  <span className="text-muted text-xs">{t(`types.${i.resourceType}`)}</span>
                </Link>
                <RemoveItemButton collectionId={id} target={{ resourceId: i.resourceId }} />
              </li>
            ) : i.noteId ? (
              <li key={i.id} className="card flex items-start gap-3 p-4">
                <Link href={`/notes/${i.noteId}`} className="min-w-0 flex-1">
                  {i.noteKind === "quote" ? (
                    <blockquote className="border-accent line-clamp-4 border-l-2 pl-3 font-serif italic">
                      “{i.quoteText}”
                    </blockquote>
                  ) : (
                    <p className="line-clamp-3 text-sm">{i.noteTitle ?? i.noteBody}</p>
                  )}
                </Link>
                <RemoveItemButton collectionId={id} target={{ noteId: i.noteId }} />
              </li>
            ) : null,
          )}
        </ul>
      )}
    </>
  );
}
