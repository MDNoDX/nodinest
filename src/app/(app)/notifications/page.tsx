import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Settings2 } from "lucide-react";
import { NotificationCenter } from "@/components/notifications/center";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { followRequests, follows, user as users } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { listNotifications } from "@/server/notifications";
import { followRequestsForMe } from "@/server/social";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("notifications"))("title") };
}

export default async function NotificationsPage() {
  const { ctx, locale, tz } = await pageContext();
  const t = await getTranslations("notifications");
  const [rows, requests] = await Promise.all([listNotifications(ctx), followRequestsForMe(ctx)]);
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = ids.length
    ? await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          image: users.image,
          profilePublic: users.profilePublic,
        })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const mine = ids.length
    ? await db
        .select({ id: follows.followeeId })
        .from(follows)
        .where(and(eq(follows.followerId, ctx.userId), inArray(follows.followeeId, ids)))
    : [];
  const asked = ids.length
    ? await db
        .select({ id: followRequests.targetId })
        .from(followRequests)
        .where(
          and(eq(followRequests.requesterId, ctx.userId), inArray(followRequests.targetId, ids)),
        )
    : [];
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings?tab=notifications">
              <Settings2 /> {t("settings")}
            </Link>
          </Button>
        }
      />
      <NotificationCenter
        requests={[...requests]}
        notes={rows
          .filter((r) => r.kind !== "follow_request")
          .map((r) => ({
            id: r.id,
            kind: r.kind,
            body: r.body,
            href: r.href,
            unread: !r.readAt,
            when: fmtDateTime(r.createdAt, locale, tz),
            actor: actors.find((a) => a.id === r.actorId) ?? null,
            following: mine.some((m) => m.id === r.actorId),
            requested: asked.some((m) => m.id === r.actorId),
          }))}
      />
    </>
  );
}
