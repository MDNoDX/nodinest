// Generates PWA / app icons from the logo. Run: node scripts/make-icons.mjs
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/nodinest-icon.svg", "utf8");
// Full-bleed variant (no rounded corners, mark scaled into the safe zone) for
// maskable (Android) and Apple touch icons — the OS applies its own mask.
const inner = svg
  .replace(/^<svg[^>]*>/, "")
  .replace("</svg>", "")
  .replace(/<title>.*?<\/title>/, "")
  .replace('<rect width="48" height="48" rx="11" fill="url(#g)"/>', "");
const defs = inner.match(/<defs>.*?<\/defs>/)[0];
const marks = inner.replace(defs, "");
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${defs}<rect width="48" height="48" fill="url(#g)"/><g transform="translate(24 24) scale(0.78) translate(-24 -24)">${marks}</g></svg>`;

const out = [
  ["public/icons/icon-192.png", svg, 192],
  ["public/icons/icon-512.png", svg, 512],
  ["public/icons/maskable-512.png", fullBleed, 512],
  ["public/icons/apple-touch-icon.png", fullBleed, 180],
];
for (const [file, src, size] of out) {
  await sharp(Buffer.from(src), { density: 512 }).resize(size, size).png().toFile(file);
  console.log("✓", file);
}
