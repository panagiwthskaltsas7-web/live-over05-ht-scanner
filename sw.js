
const CACHE_VERSION = "ht-scanner-v5";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map(key => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Δεν παρεμβαίνουμε ποτέ στα αιτήματα
  // προς το Cloudflare ή άλλους servers.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Τα αρχεία της εφαρμογής φορτώνονται
  // απευθείας από το δίκτυο.
  event.respondWith(
    fetch(request, { cache: "no-store" })
  );
});
