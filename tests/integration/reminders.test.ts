import { afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { makeUser, testDb } from "../helpers/db";

const sent: { to: number; text: string }[] = [];
vi.mock("@/server/monitor/telegram", async (orig) => ({
  ...(await orig()),
  tgTo: async (to: number, text: string) => {
    sent.push({ to, text });
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig()), after: (fn: () => void) => fn() }));

const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

/** A moment in Tashkent (UTC+5) on 2026-11-10. */
const at = (hm: string) => new Date(`2026-11-10T${hm}:00+05:00`);

describe("plan messages in Telegram", () => {
  it("sends the morning list, a reminder at its time and the evening summary, each once", async () => {
    const r = await import("@/server/roznoma");
    const { setPlanTime } = await import("@/server/notifications");
    const u = await makeUser(db);
    const tg = 900_000_000 + Math.floor(Math.random() * 99_999_999);
    await db.execute(
      sql`insert into nodinest.bot_users (tg_id, user_id) values (${tg}, ${u.userId})`,
    );
    await db.execute(
      sql`update nodinest."user" set timezone = 'Asia/Tashkent', locale = 'uz' where id = ${u.userId}`,
    );
    await r.saveRoutine(u, { title: "Qur’on öqiş", amount: "2 bet" });
    await r.saveRoutine(u, { title: "Darslik", time: "09:00" });
    const mine = () => sent.filter((m) => m.to === tg).map((m) => m.text);

    // 06:59: nothing yet.
    await r.sendReminders(at("06:59"));
    expect(mine()).toEqual([]);

    // 07:10: the day's list, timed plans first; a second run sends nothing more.
    await r.sendReminders(at("07:10"));
    await r.sendReminders(at("07:20"));
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toContain("Bugungi rejalar");
    expect(mine()[0].indexOf("Darslik")).toBeLessThan(mine()[0].indexOf("Qur’on"));
    expect(mine()[0]).toContain("/plans");

    // 09:05: the reminder at its time.
    await r.sendReminders(at("09:05"));
    expect(mine()).toHaveLength(2);
    expect(mine()[1]).toMatch(/⏰ <b>09:00<\/b> Darslik/);

    // 21:40: what is left.
    await r.sendReminders(at("21:40"));
    expect(mine()).toHaveLength(3);
    expect(mine()[2]).toContain("2 ta iş qoldi");

    // Evening turned off: tomorrow it does not come.
    await setPlanTime(u, "eveningAt", "off");
    await r.sendReminders(new Date("2026-11-11T21:40:00+05:00"));
    expect(mine().filter((t) => t.includes("Kun tugayapti"))).toHaveLength(1);
    await expect(setPlanTime(u, "morningAt", "7am")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("writes our words in Cyrillic for uz-Cyrl, never the tags or the plan's own title", async () => {
    const r = await import("@/server/roznoma");
    const u = await makeUser(db);
    const tg = 800_000_000 + Math.floor(Math.random() * 99_999_999);
    await db.execute(
      sql`insert into nodinest.bot_users (tg_id, user_id) values (${tg}, ${u.userId})`,
    );
    await db.execute(
      sql`update nodinest."user" set timezone = 'Asia/Tashkent', locale = 'uz-Cyrl' where id = ${u.userId}`,
    );
    await r.saveRoutine(u, { title: "Sport", time: "06:30" });
    await r.sendReminders(at("07:05"));
    const text = sent.find((m) => m.to === tg)!.text;
    expect(text).toContain("<b>Бугунги режалар</b>");
    expect(text).toContain("<b>06:30</b> Sport");
    expect(text).toMatch(/<a href="[^"]+\/plans">/);
  });
});
