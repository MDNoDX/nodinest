import { getTranslations } from "next-intl/server";
import { PremiumPanel } from "@/components/premium/premium-panel";
import { PageHeader } from "@/components/ui/misc";
import { pageContext } from "@/lib/page";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: "Premium" };
}

export default async function PremiumPage() {
  const { ctx, user } = await pageContext();
  const t = await getTranslations("premium");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader section="settings" title="Premium" subtitle={t("subtitle")} />
      <PremiumPanel ctx={ctx} user={user} />
    </div>
  );
}
