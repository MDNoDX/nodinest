import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PersonForm } from "@/components/people/person-form";
import { PageHeader } from "@/components/ui/misc";
import { withUser } from "@/db";
import { pageContext } from "@/lib/page";
import { canEditCatalog, getPersonSnapshot } from "@/server/catalog";
import { isStorageConfigured } from "@/server/storage";

export async function generateMetadata() {
  return { title: (await getTranslations("common"))("edit") };
}

export const dynamic = "force-dynamic";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, user } = await pageContext();
  const t = await getTranslations();
  const [s, canEdit] = await Promise.all([
    withUser(db, ctx, (tx) => getPersonSnapshot(tx, id)),
    canEditCatalog(db, ctx, "person", id),
  ]);
  if (!s) notFound();
  const str = (x: string | null | undefined) => x ?? "";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        section="people"
        title={canEdit ? t("person.editTitle") : t("resource.suggestEdit")}
        subtitle={canEdit ? t("resource.newSubtitleAdmin") : t("resource.newSubtitleUser")}
      />
      <PersonForm
        personId={id}
        canEditDirectly={canEdit}
        userId={user.id}
        storageEnabled={isStorageConfigured()}
        initial={{
          fullName: s.fullName,
          aliases: s.aliases,
          shortDescription: str(s.shortDescription),
          biography: str(s.biography),
          birthDate: str(s.birthDate),
          deathDate: str(s.deathDate),
          nationality: str(s.nationality),
          roles: s.roles,
          activityAreas: str(s.activityAreas),
          portraitUrl: str(s.portraitUrl),
          portraitFileId: s.portraitFileId ?? null,
          websiteUrl: str(s.websiteUrl),
          links: s.links.map((l) => ({ kind: l.kind, url: l.url, label: str(l.label) })),
          verification: s.verification,
        }}
      />
    </div>
  );
}
