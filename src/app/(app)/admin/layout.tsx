import { getTranslations } from "next-intl/server";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHeader } from "@/components/ui/misc";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const full = user.role === "superadmin";
  // An admin (not the superadmin) sees only the parts given to them.
  if (!full && !user.adminPerms.length) redirect("/");
  const has = (p: string) => full || user.adminPerms.includes(p as never);
  const t = await getTranslations("admin");
  return (
    <>
      <PageHeader section="admin" title={t("title")} />
      <AdminTabs
        tabs={[
          full && { href: "/admin", label: t("overview") },
          has("users") && { href: "/admin/users", label: t("users") },
          full && { href: "/admin/categories", label: t("categories") },
          full && {
            href: "/suggestions?scope=review",
            label: (await getTranslations("suggestions"))("review"),
          },
          full && { href: "/admin/archive", label: t("archive") },
          full && { href: "/admin/audit", label: t("audit") },
          full && { href: "/admin/ai", label: t("ai") },
          has("payments") && { href: "/admin/premium", label: "Premium" },
          has("ads") && { href: "/admin/ads", label: t("ads") },
          !full &&
            has("feedback") && { href: "/suggestions?tab=inbox", label: t("perms.feedback") },
        ].filter((x) => !!x)}
      />
      {children}
    </>
  );
}
