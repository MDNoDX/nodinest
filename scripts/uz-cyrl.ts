/** Builds messages/uz-Cyrl.json from messages/uz.json: npx tsx scripts/uz-cyrl.ts */
import { readFileSync, writeFileSync } from "node:fs";
import { toCyrillicMessage } from "../src/lib/uz-cyrl";

const walk = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [
      k,
      typeof v === "string" ? toCyrillicMessage(v) : walk(v as Record<string, unknown>),
    ]),
  );
const uz = JSON.parse(readFileSync("messages/uz.json", "utf8"));
writeFileSync("messages/uz-Cyrl.json", JSON.stringify(walk(uz), null, 2) + "\n");
console.log("messages/uz-Cyrl.json written");
