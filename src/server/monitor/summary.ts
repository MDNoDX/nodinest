/**
 * The daily summary for the admin channel (Vercel cron, and "/stat" in the
 * channel): users, activity, AI use, suggestions, errors and the health of
 * the setup (database region, row-level security, bot).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { errorCounts } from "./report";
import { envLine, esc, tgSend } from "./telegram";

type Row = Record<string, number | string | null>;

export async function dailySummary() {
  const [r] = await db.execute<Row>(sql`
    select
      (select count(*)::int from nodinest."user") as users,
      (select count(*)::int from nodinest."user" where created_at > now() - interval '1 day') as new_users,
      (select count(distinct user_id)::int from nodinest.session where updated_at > now() - interval '1 day') as active,
      (select count(*)::int from nodinest.notes where created_at > now() - interval '1 day') as notes,
      (select count(*)::int from nodinest.learning_records where created_at > now() - interval '1 day') as records,
      (select coalesce(sum(count), 0)::int from nodinest.rate_limits
         where key like 'ai:%' and window_start > now() - interval '1 day') as ai,
      (select count(*)::int from nodinest.feedback where status = 'new') as open_feedback,
      (select count(*)::int from nodinest.bot_users where not blocked) as bot_users,
      (select coalesce(sum(size_bytes), 0)::bigint from nodinest.files where deleted_at is null) as storage,
      (select pg_database_size(current_database())) as db_size,
      (select inet_server_addr()::text) as db_addr`);
  // Housekeeping while we are here.
  await db.execute(
    sql`delete from nodinest.telegram_logins where expires_at < now() - interval '1 day'`,
  );
  await db.execute(
    sql`delete from nodinest.rate_limits where window_start < now() - interval '2 days' and key not like 'adclick:%'`,
  );

  const mb = (b: unknown) => `${(Number(b) / 1024 / 1024).toFixed(1)} MB`;
  const rls = (process.env.DB_RLS_ROLE ?? "nodinest_app") !== "";
  const eu = !!process.env.EU_DATABASE_URL;
  const errs = [...errorCounts.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  const lines = [
    `📊 <b>Kunlik hisobot</b>`,
    ``,
    `👥 Foydalanuvçilar: <b>${r.users}</b> (+${r.new_users} yangi)`,
    `🔥 Faol (24 soat): <b>${r.active}</b>`,
    `📚 Yangi yozuvlar: ${r.records} manba, ${r.notes} qayd`,
    `✨ AI sörovlari (24 soat): <b>${r.ai}</b>`,
    `💬 Javobsiz takliflar: <b>${r.open_feedback}</b>`,
    `🤖 Bot foydalanuvçilari: ${r.bot_users}`,
    `🗂 Fayllar: ${mb(r.storage)} · baza: ${mb(r.db_size)}`,
    ``,
    `🛡 RLS: ${rls ? "✅ yoqilgan" : "⚠️ ÖÇIQ (DB_RLS_ROLE boş)"} · baza: ${eu ? "Frankfurt" : "AQŞ"}`,
    errs.length
      ? `🔴 Xatolar (şu server nusxasida):\n${errs.map((e) => `• ${e.n}× ${esc(e.title.slice(0, 90))}`).join("\n")}`
      : `🟢 Şu server nusxasida xato yöq`,
    ``,
    `<i>${esc(envLine())}</i>`,
  ];
  await tgSend(lines.join("\n"), { silent: true });
}
