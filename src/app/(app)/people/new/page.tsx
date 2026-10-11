import { getTranslations } from "next-intl/server";
import { PersonForm } from "@/components/people/person-form";
import { emptyPerson } from "@/components/people/person-form-value";
import { PageHeader } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";
import { isStorageConfigured } from "@/server/storage";

export const dynamic = "force-dynamic";

export default async function NewPersonPage() {
  const { user } = await pageContext();
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        section="people"
        title={t("person.newTitle")}
        subtitle={
          user.role === "superadmin"
            ? t("resource.newSubtitleAdmin")
            : t("resource.newSubtitleUser")
        }
      />
      <PersonForm
        initial={emptyPerson}
        isAdmin={user.role === "superadmin"}
        storageEnabled={isStorageConfigured()}
      />
    </div>
  );
}
