import { count, eq } from "drizzle-orm";
import { AdminToggle } from "@/components/layout/admin-toggle";
import { AppShell } from "@/components/layout/app-shell";
import { db } from "@/db";
import { feedback } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getAiSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Badge on "Takliflar": new messages to the admin (superadmin account).
  const pending = user.isSuperadmin
    ? await db.select({ n: count() }).from(feedback).where(eq(feedback.status, "new"))
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
