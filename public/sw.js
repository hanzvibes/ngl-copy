/* ngl-copy service worker: offline shell + cache-first static assets.
   Never caches API/auth traffic — Supabase calls stay network-only. */
const CACHE = "ngl-copy-v1";
const CORE = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Static assets: cache-first, refresh in the background.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/apple-touch-icon.png";
  if (isStatic) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        const net = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Navigations: network first, fall back to the cached landing page offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
  }
});
