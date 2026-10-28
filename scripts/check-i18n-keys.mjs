// Finds t("key") calls whose key is missing from messages/en.json, following
// `const t = useTranslations("ns")` / `await getTranslations("ns")` per file.
// Dynamic keys (template literals) are skipped. Exit 1 when something is missing.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const has = (key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), en) !== undefined;
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|ts)$/.test(f)) files.push(p);
  }
};
walk("src");
const missing = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // A name may be bound to different namespaces in different components.
  const vars = new Map();
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([\w.]+)")?\s*\)/g))
    vars.set(m[1], [...(vars.get(m[1]) ?? []), m[2] ?? ""]);
  for (const [v, spaces] of vars)
    for (const m of src.matchAll(new RegExp(`\\b${v}(?:\\.rich|\\.raw|\\.markup)?\\(\\s*"([\\w.]+)"`, "g")))
      if (!spaces.some((ns) => has(ns ? `${ns}.${m[1]}` : m[1])))
        missing.push(`${file}: ${spaces.filter(Boolean).join("|") || "(root)"} → ${m[1]}`);
}
if (missing.length) {
  console.log([...new Set(missing)].join("\n"));
  process.exit(1);
}
console.log("all keys present");
