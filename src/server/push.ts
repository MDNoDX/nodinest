/**
 * Web Push: a notification on the phone or computer even when Röznoma is closed
 * (browsers and installed web apps; iOS from 16.4 once added to the Home Screen).
 * Works when the VAPID keys are set (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY,
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY for the page); otherwise nothing is sent.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import { db, withUser, type AppContext } from "@/db";
import { pushSubscriptions } from "@/db/schema";

let ready: boolean | null = null;
function setup() {
  if (ready != null) return ready;
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  ready = !!(pub && priv);
  if (ready)
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@roznoma.uz", pub!, priv!);
  return ready;
}

const subSchema = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function savePush(ctx: AppContext, raw: unknown) {
  const s = subSchema.parse(raw);
  await withUser(db, ctx, async (tx) => {
    // An address moves to whoever subscribes on that browser now.
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
    await tx.insert(pushSubscriptions).values({
      endpoint: s.endpoint,
      userId: ctx.userId,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
    });
  });
}

export async function dropPush(ctx: AppContext, endpoint: string) {
  await withUser(db, ctx, (tx) =>
    tx
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.userId, ctx.userId), eq(pushSubscriptions.endpoint, endpoint)),
      ),
  );
}

/** Sends to every browser this person subscribed; dead addresses are forgotten. */
export async function pushTo(
  userId: string,
  msg: {
    /** Asked for only when there is a browser to send to. */
    title: () => Promise<string>;
    body?: string | null;
    url?: string | null;
    tag?: string;
  },
) {
  if (!setup()) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (!subs.length) return;
  const payload = JSON.stringify({
    title: (await msg.title()).slice(0, 120),
    body: (msg.body ?? "").slice(0, 200),
    url: msg.url ?? "/",
    tag: msg.tag,
  });
  const dead: string[] = [];
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          {
            TTL: 3600,
            timeout: 8000,
          },
        )
        .catch((e: { statusCode?: number }) => {
          if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint);
        }),
    ),
  );
  if (dead.length)
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
}
