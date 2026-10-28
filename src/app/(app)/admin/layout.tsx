import { getTranslations } from "next-intl/server";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHeader } from "@/components/ui/misc";
import { requireSuperadminPage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadminPage();
  const t = await getTranslations("admin");
  return (
    <>
      <PageHeader section="admin" title={t("title")} />
      <AdminTabs
        tabs={[
          { href: "/admin", label: t("overview") },
          { href: "/admin/users", label: t("users") },
          { href: "/admin/categories", label: t("categories") },
          {
            href: "/suggestions?scope=review",
            label: (await getTranslations("suggestions"))("review"),
          },
          { href: "/admin/archive", label: t("archive") },
          { href: "/admin/audit", label: t("audit") },
          { href: "/admin/ai", label: t("ai") },
          { href: "/admin/premium", label: "Premium" },
          { href: "/admin/ads", label: t("ads") },
        ]}
      />
      {children}
    </>
  );
}
