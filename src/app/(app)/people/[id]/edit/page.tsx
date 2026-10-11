import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PersonForm } from "@/components/people/person-form";
import { PageHeader } from "@/components/ui/misc";
import { withUser } from "@/db";
import { pageContext } from "@/lib/page";
import { getPersonSnapshot } from "@/server/catalog";
import { isStorageConfigured } from "@/server/storage";

export const dynamic = "force-dynamic";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { ctx, db, user } = await pageContext();
  const t = await getTranslations();
  const s = await withUser(db, ctx, (tx) => getPersonSnapshot(tx, id));
  if (!s) notFound();
  const str = (x: string | null | undefined) => x ?? "";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        section="people"
        title={user.role === "superadmin" ? t("person.editTitle") : t("resource.suggestEdit")}
        subtitle={
          user.role === "superadmin"
            ? t("resource.newSubtitleAdmin")
            : t("resource.newSubtitleUser")
        }
      />
      <PersonForm
        personId={id}
        isAdmin={user.role === "superadmin"}
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
