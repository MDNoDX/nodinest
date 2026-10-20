import { and, count, eq } from "drizzle-orm";
import { AdminToggle } from "@/components/layout/admin-toggle";
import { AppShell } from "@/components/layout/app-shell";
import { db } from "@/db";
import { suggestions } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getAiSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending =
    user.role === "superadmin"
      ? await db
          .select({ n: count() })
          .from(suggestions)
          .where(and(eq(suggestions.status, "pending")))
      : [{ n: 0 }];
  const ai = await getAiSettings(db);
  return (
    <AppShell
      aiDailyLimit={user.isSuperadmin ? null : ai.dailyLimitPerUser}
      user={{ name: user.name, email: user.email, image: user.image, role: user.role }}
      pendingSuggestions={Number(pending[0]?.n ?? 0)}
      timerSlot={user.isSuperadmin ? <AdminToggle on={user.adminMode} /> : null}
    >
      {children}
    </AppShell>
  );
}
