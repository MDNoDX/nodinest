import { describe, expect, it } from "vitest";
import { macAppVersion, newerVersion } from "@/lib/app-versions";

describe("app versions", () => {
  it("compares dotted versions part by part", () => {
    expect(newerVersion("1.3", "1.2")).toBe(true);
    expect(newerVersion("1.10", "1.9")).toBe(true);
    expect(newerVersion("1.2", "1.2")).toBe(false);
    expect(newerVersion("1.2", "1.2.1")).toBe(false);
    expect(newerVersion("2.0", "1.9.9")).toBe(true);
  });
  it("reads the Mac app's version from its user agent", () => {
    expect(macAppVersion("Mozilla/5.0 Version/18.0 Safari/605.1.15 NodiNestMac/1.3")).toBe("1.3");
    expect(macAppVersion("Mozilla/5.0 Chrome/130")).toBeNull();
  });
});
