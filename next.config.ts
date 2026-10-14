import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// Inline scripts are needed by next-themes (no-flash theme script) and Next's
// own bootstrap; everything else is locked down.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Covers / PDFs are uploaded straight from the browser to Vercel Blob.
  "connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src https://www.youtube-nocookie.com",
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // NodiNest is an authenticated, per-user app: nearly every route reads the
  // session. We use the classic dynamic rendering model instead of Cache
  // Components (see CLAUDE.md → "Rendering model").
  poweredByHeader: false,
  // Lets E2E run its own dev server alongside a normal one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Re-visiting a page within 30 s is instant; any mutation (server action +
    // revalidatePath) clears it.
    staleTimes: { dynamic: 30, static: 300 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // Everything except the service worker script.
      { source: "/((?!sw\\.js$).*)", headers: securityHeaders },
      {
        // A service worker's own fetches are governed by ITS script's CSP:
        // it must be able to load cover / profile images from other https sites.
        source: "/sw.js",
        headers: [
          ...securityHeaders.filter((h) => h.key !== "Content-Security-Policy"),
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; connect-src 'self' https:; img-src 'self' data: https:",
          },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
