import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import uz from "../../messages/uz.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(dir, e.name))
      : /\.(tsx?|ts)$/.test(e.name)
        ? [path.join(dir, e.name)]
        : [],
  );
}

describe("i18n catalogs", () => {
  it("Uzbek and English have identical keys", () => {
    expect(keys(uz).sort()).toEqual(keys(en).sort());
  });
  it("no empty translations", () => {
    for (const [name, cat] of [
      ["uz", uz],
      ["en", en],
    ] as const) {
      const flat = keys(cat);
      for (const k of flat) {
        const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], cat);
        expect(typeof v === "string" && v.trim().length > 0, `${name}:${k}`).toBe(true);
      }
    }
  });
  it("every error code has a translation", () => {
    const src = readFileSync("src/lib/errors.ts", "utf8");
    const codes = [...src.matchAll(/\| "([A-Z_]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    for (const c of codes) expect(en.errors, c).toHaveProperty(c);
  });
  it("static fully-qualified keys used in code exist", () => {
    const all = new Set(keys(en));
    const namespaces = new Set(Object.keys(en));
    const missing: string[] = [];
    for (const file of walk("src")) {
      const s = readFileSync(file, "utf8");
      for (const m of s.matchAll(/\bt\("([a-z][A-Za-z]+\.[A-Za-z_.]+)"/g))
        if (namespaces.has(m[1].split(".")[0]) && !all.has(m[1])) missing.push(`${file}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});
