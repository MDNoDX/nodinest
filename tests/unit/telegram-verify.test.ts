import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { botIdOf, verifyTelegram } from "@/lib/auth/telegram-verify";

const TOKEN = "123456:ABC-test-token";
function sign(d: Record<string, string | number>) {
  const check = Object.keys(d)
    .sort()
    .map((k) => `${k}=${d[k]}`)
    .join("\n");
  const key = createHash("sha256").update(TOKEN).digest();
  return { ...d, hash: createHmac("sha256", key).update(check).digest("hex") };
}

describe("verifyTelegram", () => {
  const now = 1_800_000_000_000;
  const base = { id: 42, first_name: "Ali", username: "ali", auth_date: now / 1000 - 30 };

  it("accepts correctly signed, fresh data", () => {
    expect(verifyTelegram(sign(base), TOKEN, now)?.id).toBe(42);
  });
  it("rejects a changed field, a wrong token and old data", () => {
    expect(verifyTelegram({ ...sign(base), id: 43 }, TOKEN, now)).toBeNull();
    expect(verifyTelegram(sign(base), "999:other", now)).toBeNull();
    expect(verifyTelegram(sign({ ...base, auth_date: now / 1000 - 7200 }), TOKEN, now)).toBeNull();
    expect(verifyTelegram({ ...base, hash: "zz" }, TOKEN, now)).toBeNull();
  });
  it("reads the bot id from the token", () => {
    expect(botIdOf(TOKEN)).toBe("123456");
    expect(botIdOf("")).toBeNull();
  });
});
