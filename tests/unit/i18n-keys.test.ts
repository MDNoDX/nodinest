import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("translation keys used in code", () => {
  it('every t("…") key exists (namespaced useTranslations included)', () => {
    const out = (() => {
      try {
        return execFileSync("node", ["scripts/check-i18n-keys.mjs"], { encoding: "utf8" });
      } catch (e) {
        return String((e as { stdout?: string }).stdout ?? e);
      }
    })();
    expect(out.trim()).toBe("all keys present");
  });
});
