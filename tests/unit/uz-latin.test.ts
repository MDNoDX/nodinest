import { describe, expect, it } from "vitest";
import { toNewUz, toNewUzMessage } from "@/lib/uz-latin";

describe("new Uzbek alphabet", () => {
  it("replaces oʻ gʻ sh ch, keeps ng, the tutuq and foreign words", () => {
    expect(toNewUz("O‘zbekiston, g‘oya, shahar, Chiroyli, ma’lumot, ming")).toBe(
      "Özbekiston, ğoya, şahar, Çiroyli, ma’lumot, ming",
    );
    expect(toNewUz("Chrome yoki Shift tugmasi")).toBe("Chrome yoki Shift tugmasi");
    expect(toNewUz("Is’hoq SHAHAR https://t.sh/ch")).toBe("Is’hoq ŞAHAR https://t.sh/ch");
  });
  it("leaves ICU arguments, keywords and tags", () => {
    expect(toNewUzMessage("{count, plural, one {# ta o‘qish} other {# ta o‘qish}} · {shown}")).toBe(
      "{count, plural, one {# ta öqiş} other {# ta öqiş}} · {shown}",
    );
    expect(toNewUzMessage("Shartlar <terms>shu yerda</terms>")).toBe(
      "Şartlar <terms>şu yerda</terms>",
    );
  });
});
