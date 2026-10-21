import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ResourceForm } from "@/components/library/resource-form";
import type { ResourceFormValue } from "@/components/library/resource-form-value";
import { PageHeader } from "@/components/ui/misc";
import { withUser } from "@/db";
import { people, publishers } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { canEditCatalog, getResourceSnapshot, listCategories } from "@/server/catalog";
import { isStorageConfigured } from "@/server/storage";

export const dynamic = "force-dynamic";

export default async function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, user, locale } = await pageContext();
  const t = await getTranslations("resource");
  const [snap, cats] = await Promise.all([
    withUser(db, ctx, (tx) => getResourceSnapshot(tx, id)),
    listCategories(db, ctx),
  ]);
  if (!snap) notFound();
  const ids = snap.contributors.map((c) => c.personId!).filter(Boolean);
  const names = ids.length
    ? await withUser(db, ctx, (tx) =>
        tx
          .select({ id: people.id, fullName: people.fullName })
          .from(people)
          .where(inArray(people.id, ids)),
      )
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.fullName]));
  const publisherName = snap.book?.publisherId
    ? (
        await withUser(db, ctx, (tx) =>
          tx
            .select({ name: publishers.name })
            .from(publishers)
            .where(eq(publishers.id, snap.book!.publisherId!)),
        )
      )[0]?.name
    : null;
  const s = (v: string | null | undefined) => v ?? "";
  const initial: ResourceFormValue = {
    type: snap.type,
    title: snap.title,
    originalTitle: s(snap.originalTitle),
    description: s(snap.description),
    coverUrl: s(snap.coverUrl),
    coverFileId: snap.coverFileId ?? null,
    language: s(snap.language),
    originalDate: s(snap.originalDate),
    publicationDate: s(snap.publicationDate),
    sourceUrl: s(snap.sourceUrl),
    contributors: snap.contributors.map((c) => ({
      personId: c.personId!,
      newPersonName: null,
      role: c.role,
      label: nameOf.get(c.personId!) ?? "?",
    })),
    categoryIds: snap.categoryIds,
    tags: snap.tags,
    identifiers: snap.identifiers,
    links: snap.links.map((l) => ({ kind: l.kind, url: l.url, label: s(l.label) })),
    book: {
      publisherId: snap.book?.publisherId ?? null,
      publisherName: snap.book?.publisherId ? (publisherName ?? "") : "",
      pageCount: snap.book?.pageCount ? String(snap.book.pageCount) : "",
      originalLanguage: s(snap.book?.originalLanguage),
      readingUrl: s(snap.book?.readingUrl),
    },
    media: {
      platform: s(snap.media?.platform),
      channel: s(snap.media?.channel),
      durationSeconds: snap.media?.durationSeconds ? String(snap.media.durationSeconds) : "",
      lessonCount: snap.media?.lessonCount ? String(snap.media.lessonCount) : "",
      transcript: s(snap.media?.transcript),
      transcriptUrl: s(snap.media?.transcriptUrl),
    },
  };
  const canEdit = await withUser(db, ctx, (tx) => canEditCatalog(tx, ctx, "resource", id));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        section="library"
        title={canEdit ? t("editTitle") : t("suggestEdit")}
        subtitle={canEdit ? t("newSubtitleAdmin") : t("newSubtitleUser")}
      />
      <ResourceForm
        initial={initial}
        userId={user.id}
        canEditDirectly={canEdit}
        resourceId={id}
        categories={cats}
        isAdmin={user.role === "superadmin"}
        storageEnabled={isStorageConfigured()}
        locale={locale}
      />
    </div>
  );
}
