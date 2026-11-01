/** Builds messages/uz-Cyrl.json from messages/uz.json: npx tsx scripts/uz-cyrl.ts */
import { readFileSync, writeFileSync } from "node:fs";
import { toCyrillicMessage } from "../src/lib/uz-cyrl";

// Strings are converted; arrays stay arrays (lists of ideas, etc.).
const walk = (v: unknown): unknown =>
  typeof v === "string"
    ? toCyrillicMessage(v)
    : Array.isArray(v)
      ? v.map(walk)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
        : v;
const uz = JSON.parse(readFileSync("messages/uz.json", "utf8"));
writeFileSync("messages/uz-Cyrl.json", JSON.stringify(walk(uz), null, 2) + "\n");
console.log("messages/uz-Cyrl.json written");
