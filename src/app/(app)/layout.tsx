import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdminToggle } from "@/components/layout/admin-toggle";
import { AppShell } from "@/components/layout/app-shell";
import { db } from "@/db";
import { feedback } from "@/db/schema";
import { requireUser, toCtx } from "@/lib/auth/session";
import { readPrefs } from "@/lib/notify-prefs";
import { unreadCount } from "@/server/notifications";
import { unreadChats } from "@/server/dm";
import { limitsFor, premiumOn } from "@/server/premium";
import { adFor } from "@/server/ads";
import { AdCard } from "@/components/ads/ad-card";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

import { TimezoneSync } from "@/components/layout/timezone-sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // A username is required: the first sign-in sets up the profile.
  if (!user.username) redirect("/welcome");
  // Badge on "Takliflar": new messages to the admin (superadmin account).
  const ctx = toCtx(user);
  const [pending, plan, ad, unread, chats] = await Promise.all([
    user.isSuperadmin || user.adminPerms.includes("feedback")
      ? db.select({ n: count() }).from(feedback).where(eq(feedback.status, "new"))
      : Promise.resolve([{ n: 0 }]),
    limitsFor(ctx),
    adFor(ctx, "sidebar"),
    unreadCount(ctx),
    unreadChats(ctx),
  ]);
  const paid = await premiumOn();
  const tAds = await getTranslations("ads");
  const prefs = readPrefs(user.notify);
  return (
    <AppShell
      aiDailyLimit={user.isSuperadmin ? null : plan.aiDaily}
      sideAd={ad && <AdCard ad={ad} label={tAds("label")} compact />}
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        admin: user.role === "superadmin" || user.adminPerms.length > 0,
        username: user.username,
        premium: user.isPremium,
      }}
      pendingSuggestions={Number(pending[0]?.n ?? 0)}
      unread={unread}
      unreadChats={chats}
      alarms={{ on: prefs.plans, sound: prefs.sound }}
      timerSlot={user.isSuperadmin ? <AdminToggle on={user.adminMode} /> : null}
    >
      {/* Premium switched off: every Premium mark and link disappears. */}
      {!paid && <style>{".premium-only{display:none!important}"}</style>}
      <TimezoneSync current={user.timezone} />
      {children}
    </AppShell>
  );
}
