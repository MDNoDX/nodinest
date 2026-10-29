import { PremiumAdmin } from "@/components/admin/premium-admin";
import { pageContext } from "@/lib/page";
import { getPremiumSettings, listPayments } from "@/server/premium";

export async function generateMetadata() {
  return { title: "Premium" };
}

export default async function AdminPremium() {
  const { ctx } = await pageContext({ perm: "payments" });
  const [s, list] = await Promise.all([getPremiumSettings(), listPayments(ctx)]);
  return (
    <PremiumAdmin
      initial={s}
      canEdit={ctx.role === "superadmin"}
      payments={list.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        premiumUntil: p.premiumUntil?.toISOString() ?? null,
      }))}
    />
  );
}
