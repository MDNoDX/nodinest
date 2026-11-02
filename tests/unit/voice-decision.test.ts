import { describe, expect, it } from "vitest";
import { voiceDecision } from "@/lib/voice-decision";

describe("a spoken answer to a card", () => {
  it("hears yes and no in the site's languages", () => {
    for (const s of ["Ha", "ha, tasdiqla", "Xo‘p", "tasdiqlayman", "Да", "yes please"])
      expect(voiceDecision(s), s).toBe("yes");
    for (const s of ["Yo‘q", "bekor qil", "Нет", "no"]) expect(voiceDecision(s), s).toBe("no");
  });
  it("leaves anything longer or different to the AI", () => {
    expect(voiceDecision("ha lekin avval menga uning profilini ko'rsat")).toBeNull();
    expect(voiceDecision("bugun nima o'qiyman")).toBeNull();
    expect(voiceDecision("")).toBeNull();
  });
});
