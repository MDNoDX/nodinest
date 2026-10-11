import { inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ResourceForm } from "@/components/library/resource-form";
import type { ResourceFormValue } from "@/components/library/resource-form-value";
import { PageHeader } from "@/components/ui/misc";
import { withUser } from "@/db";
import { people } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { getResourceSnapshot, listCategories } from "@/server/catalog";
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
  const s = (v: string | null | undefined) => v ?? "";
  const initial: ResourceFormValue = {
    type: snap.type,
    title: snap.title,
    originalTitle: s(snap.originalTitle),
    description: s(snap.description),
    coverUrl: s(snap.coverUrl),
    coverFileId: snap.coverFileId ?? null,
    language: s(snap.language),
    publicationDate: s(snap.publicationDate),
    sourceUrl: s(snap.sourceUrl),
    sourceNote: s(snap.sourceNote),
    verification: snap.verification,
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
      publisher: s(snap.book?.publisher),
      edition: s(snap.book?.edition),
      pageCount: snap.book?.pageCount ? String(snap.book.pageCount) : "",
      originalLanguage: s(snap.book?.originalLanguage),
      tableOfContents: s(snap.book?.tableOfContents),
      readingUrl: s(snap.book?.readingUrl),
      purchaseUrl: s(snap.book?.purchaseUrl),
      fileFormat: s(snap.book?.fileFormat),
    },
    media: {
      platform: s(snap.media?.platform),
      channel: s(snap.media?.channel),
      durationMinutes: snap.media?.durationSeconds
        ? String(Math.round(snap.media.durationSeconds / 60))
        : "",
      transcript: s(snap.media?.transcript),
      transcriptUrl: s(snap.media?.transcriptUrl),
    },
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={user.role === "superadmin" ? t("editTitle") : t("suggestEdit")}
        subtitle={user.role === "superadmin" ? t("newSubtitleAdmin") : t("newSubtitleUser")}
      />
      <ResourceForm
        initial={initial}
        resourceId={id}
        categories={cats}
        isAdmin={user.role === "superadmin"}
        storageEnabled={isStorageConfigured()}
        locale={locale}
      />
    </div>
  );
}
