/* NodiNest service worker — offline reading + fast repeat visits.
 *
 *  /_next/static, icons, fonts   cache-first (immutable, content-hashed)
 *  images (covers, portraits)    stale-while-revalidate, capped
 *  pages (navigations)           network-first; on a slow (>3 s) or absent
 *                                network the last good copy, else /offline
 *                                (which lists the pages saved on this device)
 *  /api/files (PDFs, covers)     network-first, kept for offline reading
 *  auth, uploads, server actions never touched
 *
 * Private pages are stored only on this device and are wiped on sign-out
 * (the app posts {type:"clear"}).
 */
const VERSION = "v11-offline";
const STATIC = `nn-static-${VERSION}`;
const PAGES = `nn-pages-${VERSION}`;
const IMAGES = `nn-img-${VERSION}`;
const FILES = `nn-files-${VERSION}`;
const KEEP = [STATIC, PAGES, IMAGES, FILES];
const OFFLINE_URL = "/offline";
// The offline mode keeps up to ~200 pages; pages opened by hand come on top.
const MAX_PAGES = 350;
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
      // Only this worker's own older caches. The app's own (audiobook audio,
      // books saved for offline reading) survive updates; sign-out clears them.
      for (const key of await caches.keys())
        if (/^nn-(static|pages|img|files)-/.test(key) && !KEEP.includes(key))
          await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear")
    event.waitUntil(Promise.all([PAGES, FILES, IMAGES].map((k) => caches.delete(k))));
  // Pages kept ready, so the app opens without a network: the main ones on
  // every visit, and everything the offline mode lists (lib/offline-sync.ts),
  // two at a time, each reported back through the given port.
  if (event.data?.type === "warm") event.waitUntil(warm(event.data.urls ?? [], event.ports[0]));
});

const ASSET_RE = /\/_next\/static\/[\w\-.~/]+?\.(?:js|css|woff2)/g;
// Covers shown on the page (small copies), so a saved page is not blank.
const COVER_RE = /\/api\/files\/[0-9a-f-]{36}\?w=\d+/g;
async function keepAssets(html) {
  const cache = await caches.open(STATIC);
  for (const path of new Set(html.match(ASSET_RE) || [])) {
    if (await cache.match(path)) continue;
    const res = await fetch(path).catch(() => null);
    if (good(res)) await cache.put(path, res);
  }
  const img = await caches.open(IMAGES);
  for (const path of [...new Set(html.match(COVER_RE) || [])].slice(0, 40)) {
    if (await img.match(path)) continue;
    const res = await fetch(path, { credentials: "same-origin" }).catch(() => null);
    if (good(res)) await img.put(path, res);
  }
}

async function warm(urls, port) {
  const cache = await caches.open(PAGES);
  let done = 0;
  let saved = 0;
  const queue = urls.filter(
    (u) => typeof u === "string" && u.startsWith("/") && !u.startsWith("//"),
  );
  const one = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const res = await fetch(url, { credentials: "same-origin" }).catch(() => null);
      if (good(res) && (res.headers.get("content-type") || "").includes("text/html")) {
        const html = await res.clone().text();
        await cache.delete(url); // a fresh copy goes to the end (newest)
        await cache.put(url, res);
        // The page's own code: a page saved but never opened has its scripts
        // nowhere yet, and offline it would stop at the first missing chunk.
        await keepAssets(html);
        saved++;
      }
      port?.postMessage({ done: ++done });
    }
  };
  await Promise.all([one(), one()]);
  await trim(PAGES, MAX_PAGES);
  await trim(IMAGES, 400);
  port?.postMessage({ done, saved, end: true });
}

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
      await trim(PAGES, MAX_PAGES);
    }
    return res;
  })();
  event.waitUntil(network.catch(() => {}));
  const slow = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    const first = await Promise.race([network, slow.then(() => null)]);
    if (first) return first;
    const hit = await cache.match(req);
    return hit || (await network);
  } catch {
    return (await cache.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

// The answer goes back at once; its offline copy is written while it plays
// (waiting for the copy first made every voice and video start late).
async function file(req, event) {
  try {
    const res = await fetch(req);
    if (good(res) && !res.headers.get("content-range")) {
      const copy = res.clone();
      event.waitUntil(
        caches
          .open(FILES)
          .then((cache) => cache.put(req, copy).then(() => trim(FILES, 60)))
          .catch(() => {}),
      );
    }
    return res;
  } catch {
    return (await caches.match(req, { cacheName: FILES })) || Response.error();
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
      event.respondWith(
        req.destination === "image" ? staleWhileRevalidate(req, event) : file(req, event),
      );
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

// Web Push: a new message (or any notification) while Röznoma is closed.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "Röznoma", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Röznoma", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || "/" },
    }),
  );
});

// A tap opens the place it is about (an open tab is reused).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list)
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      return self.clients.openWindow(url);
    }),
  );
});
