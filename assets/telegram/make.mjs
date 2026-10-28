// Telegram avatars for the bot and the admin channel: `node assets/telegram/make.mjs`.
// Telegram crops avatars to a circle, so everything sits inside the middle ~70 %.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = fileURLToPath(new URL(".", import.meta.url));

/** The NodiNote notebook (same geometry as components/brand/logo.tsx), 48×48 units. */
const notebook = (cover, rings) => `
  <rect x="12.5" y="9" width="20.5" height="30" rx="3.2" fill="${cover}"/>
  <path d="M27.2 9V17.2L29.2 15.6L31.2 17.2V9Z" fill="#E2A93B"/>
  <g fill="${rings}">
    <rect x="10.4" y="13.6" width="5" height="2.4" rx="1.2"/>
    <rect x="10.4" y="20.6" width="5" height="2.4" rx="1.2"/>
    <rect x="10.4" y="27.6" width="5" height="2.4" rx="1.2"/>
  </g>
  <g stroke="#fff" stroke-opacity=".8" stroke-width="1.7" stroke-linecap="round">
    <path d="M18 21.8H28.6"/><path d="M18 26.4H28.6"/><path d="M18 31H24.4"/>
  </g>
  <g transform="rotate(45 34 31)">
    <rect x="31.6" y="20.6" width="4.8" height="15" rx="1.2" fill="#E2A93B"/>
    <path d="M31.6 35.6H36.4L34 40.2Z" fill="#F3DDAA"/>
    <path d="M33.3 38.8H34.7L34 40.2Z" fill="${rings}"/>
    <rect x="31.6" y="20.6" width="4.8" height="2.6" rx="1.2" fill="#EF8FA6"/>
  </g>`;

const bot = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs>
    <radialGradient id="bg" cx="35%" cy="25%" r="85%">
      <stop offset="0" stop-color="#3f74ff"/><stop offset=".55" stop-color="#2149c9"/><stop offset="1" stop-color="#0e2470"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#06113a" flood-opacity=".45"/></filter>
  </defs>
  <rect width="640" height="640" fill="url(#bg)"/>
  <circle cx="300" cy="290" r="230" fill="url(#glow)"/>
  <rect x="150" y="120" width="300" height="340" rx="70" fill="#ffffff" filter="url(#sh)"/>
  <g transform="translate(168 118) scale(6.2)">${notebook("#2459e0", "#16203d")}</g>
  <g filter="url(#sh)" transform="translate(392 392)">
    <circle r="78" fill="#2AABEE"/>
    <circle r="78" fill="none" stroke="#fff" stroke-width="10"/>
    <path transform="translate(-46 -42) scale(3.85)" fill="#fff" d="M5.4 11.8 16.9 7.3c.5-.2 1 .1.8 1l-2 9.3c-.1.6-.6.8-1.1.5l-3-2.2-1.5 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5.1c.2-.2 0-.3-.3-.1l-7 4.4-3-.9c-.6-.2-.6-.6.1-.9Z"/>
  </g>
</svg>`;

const channel = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1430"/><stop offset=".6" stop-color="#132a5c"/><stop offset="1" stop-color="#0d3b4a"/>
    </linearGradient>
    <linearGradient id="pulse" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#34d399" stop-opacity="0"/><stop offset=".25" stop-color="#34d399"/><stop offset=".75" stop-color="#5eead4"/><stop offset="1" stop-color="#5eead4" stop-opacity="0"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000" flood-opacity=".45"/></filter>
    <filter id="gl"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect width="640" height="640" fill="url(#bg)"/>
  <g fill="none" stroke="#5eead4" stroke-opacity=".14" stroke-width="3">
    <circle cx="320" cy="300" r="150"/><circle cx="320" cy="300" r="215"/><circle cx="320" cy="300" r="280"/>
  </g>
  <g transform="translate(168 108) scale(6.2)" filter="url(#sh)">${notebook("#3b6cf0", "#e8eefc")}</g>
  <path d="M40 470 H215 L245 420 L280 520 L318 380 L350 470 H600" fill="none" stroke="#34d399" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity=".55" filter="url(#gl)"/>
  <path d="M40 470 H215 L245 420 L280 520 L318 380 L350 470 H600" fill="none" stroke="url(#pulse)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="318" cy="380" r="12" fill="#d1fae5"/>
</svg>`;

for (const [name, svg] of [["bot", bot], ["channel", channel]]) {
  writeFileSync(`${here}${name}.svg`, svg.trim() + "\n");
  await sharp(Buffer.from(svg)).png().toFile(`${here}${name}.png`);
}
console.log("ok");
