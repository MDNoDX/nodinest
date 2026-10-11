import { and, count, eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { TimerChip } from "@/components/journal/timer-chip";
import { db } from "@/db";
import { suggestions } from "@/db/schema";
import { requireUser, toCtx } from "@/lib/auth/session";
import { getOpenSession } from "@/server/journal";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ctx = toCtx(user);
  const [open, pending] = await Promise.all([
    getOpenSession(db, ctx),
    user.role === "superadmin"
      ? db
          .select({ n: count() })
          .from(suggestions)
          .where(and(eq(suggestions.status, "pending")))
      : Promise.resolve([{ n: 0 }]),
  ]);
  return (
    <AppShell
      user={{ name: user.name, email: user.email, image: user.image, role: user.role }}
      pendingSuggestions={Number(pending[0]?.n ?? 0)}
      timerSlot={
        <TimerChip
          session={
            open && {
              id: open.id,
              status: open.status,
              resourceTitle: open.resourceTitle,
              activeSeconds: open.activeSeconds,
              lastResumedAt: open.lastResumedAt?.toISOString() ?? null,
              serverNow: open.serverNow.toISOString(),
            }
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
