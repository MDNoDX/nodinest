import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

process.env.TELEGRAM_BOT_TOKEN = "777000:integration-test-token-integration-test";
process.env.TELEGRAM_BOT_USERNAME = "test_bot";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-integration-test-secret";
// No real messages to Telegram from tests.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ ok: true, result: {} }))),
);

const tgId = 900_000_000 + Math.floor(Math.random() * 1_000_000);
const email = `tg${tgId}@telegram.nodinest.invalid`;
const call = async (path: string, body: unknown, cookie = "") => {
  const { auth } = await import("@/lib/auth/config");
  return auth.handler(
    new Request(`http://localhost:3000/api/auth/telegram/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
      body: JSON.stringify(body),
    }),
  );
};
const browserCookie = (r: Response) =>
  (r.headers.get("set-cookie") ?? "").match(/nn_tg_login=([^;]+)/)?.[0] ?? "";

describe("Telegram sign-in through the bot", () => {
  afterAll(async () => {
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    await db.delete(user).where(eq(user.email, email));
  });

  it("waits, then signs in once the bot confirmed — only in the same browser", async () => {
    const start = await call("start", {});
    expect(start.status).toBe(200);
    const { code, link } = (await start.json()) as { code: string; link: string };
    expect(link).toBe(`https://t.me/test_bot?start=login_${code}`);
    const cookie = browserCookie(start);
    expect(cookie).toMatch(/^nn_tg_login=/);

    expect(await (await call("poll", { code }, cookie)).json()).toEqual({ state: "pending" });

    const { approveLogin } = await import("@/server/telegram-login");
    expect(await approveLogin(code, { id: tgId, first_name: "Test", last_name: "User" })).toBe(
      true,
    );

    // Another browser (no cookie) cannot use the code.
    expect(await (await call("poll", { code })).json()).toEqual({ state: "gone" });

    const ok = await call("poll", { code }, cookie);
    expect(await ok.json()).toEqual({ state: "ok" });
    expect(ok.headers.get("set-cookie") ?? "").toMatch(/session_token=/);
    // The code is used up.
    expect(await (await call("poll", { code }, cookie)).json()).toEqual({ state: "gone" });

    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const [u] = await db.select().from(user).where(eq(user.email, email));
    expect(u.firstName).toBe("Test");
    expect(u.lastName).toBe("User");
    expect(u.role).toBe("user");
  });

  it("a second sign-in finds the same account", async () => {
    const start = await call("start", {});
    const { code } = (await start.json()) as { code: string };
    const { approveLogin } = await import("@/server/telegram-login");
    await approveLogin(code, { id: tgId, first_name: "Test" });
    expect(await (await call("poll", { code }, browserCookie(start))).json()).toEqual({
      state: "ok",
    });
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    expect(await db.select().from(user).where(eq(user.email, email))).toHaveLength(1);
  });
});
