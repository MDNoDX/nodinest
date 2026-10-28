/**
 * Converts Uzbek UI text to the 2026 Latin alphabet (see src/lib/uz-latin.ts).
 *   npx tsx scripts/uz-latin.ts messages/uz.json      — every message (ICU-aware)
 *   npx tsx scripts/uz-latin.ts --check messages/uz.json  — fails if old letters remain
 */
import { readFileSync, writeFileSync } from "node:fs";
import { toNewUzMessage } from "../src/lib/uz-latin";

const args = process.argv.slice(2);
const check = args[0] === "--check";
const file = check ? args[1] : args[0];
const data = JSON.parse(readFileSync(file, "utf8"));
let changed = 0;
const walk = (o: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") {
      const n = toNewUzMessage(v);
      if (n !== v) {
        changed++;
        o[k] = n;
      }
    } else if (v && typeof v === "object") walk(v as Record<string, unknown>);
  }
};
walk(data);
if (check) {
  if (changed) {
    console.error(`${changed} message(s) still use the old alphabet`);
    process.exit(1);
  }
} else {
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`${changed} message(s) converted`);
}
