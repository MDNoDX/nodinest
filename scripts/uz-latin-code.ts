/**
 * Converts the Uzbek string literals of a source file region to the 2026
 * alphabet: npx tsx scripts/uz-latin-code.ts <file> <startMarker> <endMarker>
 * (markers are exact text; the region is between them; "-" = file start/end).
 * Only the text inside "…" and `…` literals changes (never ${…} code).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { toNewUz } from "../src/lib/uz-latin";

const [file, startM, endM] = process.argv.slice(2);
const src = readFileSync(file, "utf8");
const a = startM === "-" ? 0 : src.indexOf(startM);
const b = endM === "-" ? src.length : src.indexOf(endM, a + 1);
if (a < 0 || b < 0) throw new Error("marker not found");
const region = src.slice(a, b);

const out = region.replace(
  /"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.|\$\{[^}]*\})*)`/g,
  (m, dq: string | undefined, bq: string | undefined) => {
    // Identifier-like strings (icon names, ids, paths) stay as they are.
    if (dq !== undefined) return /^[\w./:#-]*$/.test(dq) ? m : `"${toNewUz(dq)}"`;
    const parts = (bq ?? "").split(/(\$\{[^}]*\})/);
    return "`" + parts.map((p, i) => (i % 2 ? p : toNewUz(p))).join("") + "`";
  },
);
writeFileSync(file, src.slice(0, a) + out + src.slice(b));
console.log(file, out === region ? "unchanged" : "converted");
