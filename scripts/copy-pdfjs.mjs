/**
 * Copies pdf.js's worker and its image decoders (JPEG 2000, JBIG2) into
 * public/pdfjs, so the reader can draw original PDF pages (maps, plates)
 * from our own origin. Runs after every npm install.
 */
import fs from "node:fs";
import path from "node:path";

const from = path.resolve("node_modules/pdfjs-dist");
const to = path.resolve("public/pdfjs");
if (!fs.existsSync(from)) process.exit(0);
fs.mkdirSync(path.join(to, "wasm"), { recursive: true });
fs.copyFileSync(path.join(from, "build/pdf.worker.min.mjs"), path.join(to, "pdf.worker.min.mjs"));
for (const f of fs.readdirSync(path.join(from, "wasm")))
  fs.copyFileSync(path.join(from, "wasm", f), path.join(to, "wasm", f));
