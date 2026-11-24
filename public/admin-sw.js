const SHELL_CACHE = "elle-jew-admin-shell-v1";
const STATIC_CACHE = "elle-jew-admin-static-v1";
const OFFLINE_URL = "/admin-offline.html";
const SHELL_FILES = [
  OFFLINE_URL,
  "/admin-icons/apple-touch-icon.png",
  "/admin-icons/icon-192.png",
  "/admin-icons/icon-512.png",
  "/brand/logo.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, STATIC_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/admin")) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const isAdminStatic = url.pathname.startsWith("/_next/") && ["script", "style", "font", "image"].includes(request.destination);
  const isPinnedShell = SHELL_FILES.includes(url.pathname);
  if (!isAdminStatic && !isPinnedShell) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    }),
  );
});
