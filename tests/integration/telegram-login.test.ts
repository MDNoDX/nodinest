import { createHash, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const TOKEN = "777000:integration-test-token";
process.env.TELEGRAM_BOT_TOKEN = TOKEN;
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-integration-test-secret";

function signed(d: Record<string, string | number>) {
  const check = Object.keys(d)
    .sort()
    .map((k) => `${k}=${d[k]}`)
    .join("\n");
  const key = createHash("sha256").update(TOKEN).digest();
  return { ...d, hash: createHmac("sha256", key).update(check).digest("hex") };
}

const tgId = 900_000_000 + Math.floor(Math.random() * 1_000_000);
const post = async (body: unknown) => {
  const { auth } = await import("@/lib/auth/config");
  return auth.handler(
    new Request("http://localhost:3000/api/auth/telegram/callback", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    }),
  );
};

describe("Telegram sign-in", () => {
  afterAll(async () => {
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    await db.delete(user).where(eq(user.email, `tg${tgId}@telegram.nodinest.invalid`));
  });

  it("creates the user once and signs in with a session cookie", async () => {
    const data = {
      id: tgId,
      first_name: "Test",
      last_name: "User",
      auth_date: Math.floor(Date.now() / 1000),
    };
    const r1 = await post(signed(data));
    expect(r1.status).toBe(200);
    expect(r1.headers.get("set-cookie") ?? "").toMatch(/session_token=/);
    const r2 = await post(signed(data));
    expect(r2.status).toBe(200);
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const rows = await db
      .select()
      .from(user)
      .where(eq(user.email, `tg${tgId}@telegram.nodinest.invalid`));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Test User");
    expect(rows[0].role).toBe("user");
  });

  it("refuses forged data", async () => {
    const r = await post({
      ...signed({ id: tgId, auth_date: Math.floor(Date.now() / 1000) }),
      id: 1,
    });
    expect(r.status).toBe(401);
  });
});
