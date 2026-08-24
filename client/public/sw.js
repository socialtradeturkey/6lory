const CACHE_NAME = "6lory-shell-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/manus-storage/6lory-app-icon_b69505cd.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          if (response.ok && (event.request.mode === "navigate" || ["script", "style", "image", "font"].includes(event.request.destination))) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => event.request.mode === "navigate" ? caches.match("/") : Response.error());
    }),
  );
});

self.addEventListener("push", event => {
  let payload = { title: "6lory", body: "Yeni bir güncellemeniz var.", destination: "/notifications" };
  try { payload = { ...payload, ...(event.data ? event.data.json() : {}) }; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/manus-storage/6lory-app-icon_b69505cd.png",
    badge: "/manus-storage/6lory-app-icon_b69505cd.png",
    data: { destination: payload.destination },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.destination || "/notifications"));
});
