/**
 * Site events for the admin channel: a new suggestion (answer it by replying
 * to the post) and a new account.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { feedback, tgPosts, user } from "@/db/schema";
import { esc, tgConfigured, tgSend } from "./telegram";

const realEmail = (e?: string | null) => (e && !e.endsWith(".invalid") ? e : null);

export async function postFeedback(feedbackId: string) {
  if (!tgConfigured()) return;
  try {
    const [f] = await db
      .select({
        title: feedback.title,
        body: feedback.body,
        contact: feedback.contact,
        source: feedback.source,
        name: user.name,
        username: user.username,
        email: user.email,
      })
      .from(feedback)
      .leftJoin(user, eq(user.id, feedback.userId))
      .where(eq(feedback.id, feedbackId));
    if (!f) return;
    const who = [
      f.name ? `<b>${esc(f.name)}</b>` : null,
      f.username ? `@${esc(f.username)} (saytda)` : null,
      realEmail(f.email) ? esc(f.email) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const id = await tgSend(
      [
        `💬 <b>Yangi taklif</b> · ${f.source === "bot" ? "bot" : "sayt"}`,
        who && `👤 ${who}`,
        f.contact && `📞 ${esc(f.contact)}`,
        "",
        f.source === "bot" ? null : `📝 <b>${esc(f.title)}</b>`,
        esc(f.body),
        "",
        "<i>↩️ Javob berish uçun şu xabarga reply qiling.</i>",
      ]
        .filter((l) => l !== null)
        .join("\n"),
    );
    if (id) await db.insert(tgPosts).values({ messageId: id, kind: "feedback", feedbackId });
  } catch {
    /* monitoring only */
  }
}

export async function notifyNewUser(u: { id: string; name: string; email: string }) {
  if (!tgConfigured()) return;
  const via = u.email.endsWith("@telegram.nodinest.invalid") ? "Telegram" : "Google";
  const [{ n }] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from nodinest."user"`,
  );
  await tgSend(
    `🆕 <b>Yangi foydalanuvçi</b> · ${via}\n👤 ${esc(u.name)}${realEmail(u.email) ? ` · ${esc(u.email)}` : ""}\n👥 Jami: <b>${n}</b>`,
    { silent: true },
  );
}
