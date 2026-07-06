// ============================================================================
// FloMap service worker — "network-first" so visitors always get fresh files.
// ----------------------------------------------------------------------------
// GitHub Pages (and phone browsers) aggressively cache static assets, which
// makes pushed updates appear "missing" until you clear the cache. This worker
// always fetches the latest from the network when online, and only falls back
// to a cached copy when offline. Result: no more stale versions after a deploy.
// ============================================================================

const CACHE = "flomap-cache-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Only manage our own files — let the Supabase API and the esm.sh CDN through.
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      // no-store bypasses the browser HTTP cache so we truly get the latest.
      const fresh = await fetch(req, { cache: "no-store" });
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
