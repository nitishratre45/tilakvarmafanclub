const CACHE_NAME = "tilak-varma-fc-shell-v6";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/tilak%20varma%20photos%20fv/tilak%20varma%20favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("tilak-varma-fc-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then(async (response) => {
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && contentType.includes("text/html")) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        // Only return the cached document for this exact URL. Falling back to "/"
        // for every nested route can show the homepage when a user opens Stats offline.
        const cached = await caches.match(request);
        return cached || Response.error();
      }),
  );
});
