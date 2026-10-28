import { getTranslations } from "next-intl/server";
import { GuideView } from "@/components/guide/guide-view";
import { PageHeader } from "@/components/ui/misc";
import { guideFor } from "@/content/guide";
import { pageContext } from "@/lib/page";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getTranslations("guide"))("title") };
}

/** Qo'llanma: every part of the site explained, section by section. */
export default async function GuidePage() {
  const { locale } = await pageContext();
  const t = await getTranslations("guide");
  return (
    <>
      <PageHeader section="guide" title={t("title")} subtitle={t("subtitle")} />
      <GuideView sections={guideFor(locale)} />
    </>
  );
}
