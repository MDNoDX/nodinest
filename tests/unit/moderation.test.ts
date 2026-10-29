import { describe, expect, it } from "vitest";
import { moderationIssue } from "@/lib/moderation";

describe("moderationIssue", () => {
  it("lets ordinary text through", () => {
    for (const s of [
      "Öqigan kitoblarim va taqrizlarim",
      "Sukunat (roman)",
      "Dickens — Oliver Twist",
      "Ömar Xayyom ruboiylari",
      "Skeptik fikrlash",
      "Analiz va sintez",
      "Тарих фани",
      "Islom tarixi",
      "Sexton Blake",
      "Crisis management",
      "Philip K. Dick",
    ])
      expect(moderationIssue(s), s).toBeNull();
  });
  it("catches obscene words, also disguised", () => {
    for (const s of ["f.u.c.k you", "FuCk", "иди нах хуй", "p0rn videos", "dalbayob", "shit"])
      expect(moderationIssue(s), s).toBe("obscene");
  });
  it("catches extremist organisations and slogans", () => {
    for (const s of ["Hizb ut-Tahrir a'zosi", "sieg heil", "ISIS fan", "1488"])
      expect(moderationIssue(s), s).toBe("extremist");
    expect(moderationIssue("ISIS: The State of Terror", { extremist: false })).toBeNull();
  });
});
