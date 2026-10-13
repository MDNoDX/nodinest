import { getTranslations } from "next-intl/server";
import { ResourceForm } from "@/components/library/resource-form";
import { emptyResource } from "@/components/library/resource-form-value";
import { PageHeader } from "@/components/ui/misc";
import { RESOURCE_TYPES, type ResourceType } from "@/lib/validation";
import { pageContext, sp, type SP } from "@/lib/page";
import { listCategories } from "@/server/catalog";
import { isStorageConfigured } from "@/server/storage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getTranslations("resource"))("newTitle") };
}

export default async function NewResourcePage({ searchParams }: { searchParams: SP }) {
  const { ctx, db, user, locale } = await pageContext();
  const t = await getTranslations("resource");
  const type = sp((await searchParams).type);
  const cats = await listCategories(db, ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        section="library"
        title={t("newTitle")}
        subtitle={t("newSubtitleAdmin")}
      />
      <ResourceForm
        userId={user.id}
        canEditDirectly
        initial={emptyResource(
          (RESOURCE_TYPES as readonly string[]).includes(type ?? "")
            ? (type as ResourceType)
            : "book",
        )}
        categories={cats}
        isAdmin={user.role === "superadmin"}
        storageEnabled={isStorageConfigured()}
        locale={locale}
      />
    </div>
  );
}
