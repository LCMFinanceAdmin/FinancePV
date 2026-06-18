const CACHE = "lcm-finance-v1";
const STATIC = ["/", "/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/api/") || e.request.url.includes("supabase")) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    (async () => {
      // Show the notification with prominent vibration
      await self.registration.showNotification(data.title ?? "LCM Finance", {
        body: data.body ?? "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url ?? "/" },
        vibrate: [300, 100, 300, 100, 500, 200, 500],
        requireInteraction: true,
      });

      // Tell any open app tabs to play the notification sound
      const openClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      openClients.forEach((c) => c.postMessage({ type: "LCM_NOTIFICATION_SOUND" }));
    })()
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing window if one is open, otherwise open a new one
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.postMessage({ type: "LCM_NOTIFICATION_SOUND" });
          return client.focus().then((c) => c.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
