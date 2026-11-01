import { describe, expect, it } from "vitest";
import { maskEmail } from "@/lib/mask-email";

describe("maskEmail", () => {
  it("keeps the ends and the domain", () => {
    expect(maskEmail("mdnodx@gmail.com")).toBe("md***x@gmail.com");
    expect(maskEmail("anna@mail.ru")).toBe("an***@mail.ru");
  });
  it("hides short names too", () => {
    expect(maskEmail("ab@x.uz")).toBe("a***@x.uz");
    expect(maskEmail("a@x.uz")).toBe("a***@x.uz");
  });
});
