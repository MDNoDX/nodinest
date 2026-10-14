/* NodiNest service worker — offline reading + fast repeat visits.
 *
 *  /_next/static, icons, fonts   cache-first (immutable, content-hashed)
 *  images (covers, portraits)    stale-while-revalidate, capped
 *  pages (navigations)           network-first; on a slow (>3.5 s) or absent
 *                                network the last good copy, else /offline
 *  /api/files (PDFs, covers)     network-first, kept for offline reading
 *  auth, uploads, server actions never touched
 *
 * Private pages are stored only on this device and are wiped on sign-out
 * (the app posts {type:"clear"}).
 */
const VERSION = "v4";
const STATIC = `nn-static-${VERSION}`;
const PAGES = `nn-pages-${VERSION}`;
const IMAGES = `nn-img-${VERSION}`;
const FILES = `nn-files-${VERSION}`;
const KEEP = [STATIC, PAGES, IMAGES, FILES];
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/nodinest-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear")
    event.waitUntil(Promise.all([PAGES, FILES, IMAGES].map((k) => caches.delete(k))));
});

const good = (res) =>
  res && res.ok && !res.redirected && (res.type === "basic" || res.type === "cors");

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (good(res)) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then(async (res) => {
      if (res.ok || res.type === "opaque") {
        await cache.put(req, res.clone());
        await trim(IMAGES, 400);
      }
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  // Never answer an image with nothing: let the browser try on its own.
  return (await update) || fetch(req.url, { mode: "no-cors" }).catch(() => Response.error());
}

async function page(event) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  const network = (async () => {
    const res = (await event.preloadResponse) || (await fetch(req));
    if (good(res) && (res.headers.get("content-type") || "").includes("text/html")) {
      await cache.put(req, res.clone());
      await trim(PAGES, 120);
    }
    return res;
  })();
  event.waitUntil(network.catch(() => {}));
  const slow = new Promise((resolve) => setTimeout(resolve, 3500));
  try {
    const first = await Promise.race([network, slow.then(() => null)]);
    if (first) return first;
    const hit = await cache.match(req);
    return hit || (await network);
  } catch {
    return (await cache.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function file(req) {
  const cache = await caches.open(FILES);
  try {
    const res = await fetch(req);
    if (good(res) && !res.headers.get("content-range")) {
      await cache.put(req, res.clone());
      await trim(FILES, 40);
    }
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;

  if (same) {
    const p = url.pathname;
    if (
      p.startsWith("/api/auth") ||
      p.startsWith("/api/blob") ||
      p.startsWith("/_next/webpack-hmr")
    )
      return;
    if (p.startsWith("/_next/static/") || p.startsWith("/icons/") || p === "/nodinest-icon.svg") {
      event.respondWith(cacheFirst(req));
      return;
    }
    if (p.startsWith("/api/files/")) {
      event.respondWith(req.destination === "image" ? staleWhileRevalidate(req, event) : file(req));
      return;
    }
    if (p.startsWith("/api/")) return;
    if (req.mode === "navigate") {
      event.respondWith(page(event));
      return;
    }
    return; // RSC payloads etc.: the router falls back to a full navigation offline
  }

  if (req.destination === "image" && (url.protocol === "https:" || url.protocol === "http:"))
    event.respondWith(staleWhileRevalidate(req, event));
});
