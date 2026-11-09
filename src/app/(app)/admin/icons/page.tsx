import { getTranslations } from "next-intl/server";
import { IconsAdmin } from "@/components/admin/icons-admin";
import { pageContext } from "@/lib/page";
import { getPlanIcons } from "@/server/plan-icons";

export async function generateMetadata() {
  return { title: (await getTranslations("admin"))("icons") };
}

export default async function AdminIcons() {
  await pageContext({ admin: true });
  return <IconsAdmin initial={await getPlanIcons()} />;
}
