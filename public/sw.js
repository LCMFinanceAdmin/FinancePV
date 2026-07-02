const CACHE = "lcm-finance-v3";
const SHARE_CACHE = "lcm-share-v1";
const STATIC = ["/", "/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== SHARE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // ── Web Share Target — intercept POST to /submit from the OS share sheet ──
  if (e.request.method === "POST" && new URL(e.request.url).pathname === "/submit") {
    e.respondWith(
      (async () => {
        try {
          const formData = await e.request.formData();
          const files = formData.getAll("file").filter((v) => v instanceof File);

          if (files.length > 0) {
            const cache = await caches.open(SHARE_CACHE);
            // Store each file as a cached response keyed by index
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const buf = await file.arrayBuffer();
              await cache.put(
                `/share-cache/file-${i}`,
                new Response(buf, {
                  headers: {
                    "Content-Type": file.type || "image/jpeg",
                    "X-File-Name": encodeURIComponent(file.name || `shared-${i}.jpg`),
                  },
                })
              );
            }
            // Metadata entry so the page knows how many files to retrieve
            await cache.put(
              "/share-cache/meta",
              new Response(JSON.stringify({ count: files.length }), {
                headers: { "Content-Type": "application/json" },
              })
            );
          }
        } catch (_) {
          // If anything fails, still redirect so the app opens
        }
        // Always redirect to the submit page — the page will read from cache
        return Response.redirect("/submit?from_share=1", 303);
      })()
    );
    return;
  }

  // ── Normal GET caching ────────────────────────────────────────────────────
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/api/") || e.request.url.includes("supabase")) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title ?? "LCM Finance", {
        body: data.body ?? "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url ?? "/" },
        vibrate: [300, 100, 300, 100, 500, 200, 500],
        requireInteraction: true,
      });

      const openClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      openClients.forEach((c) =>
        c.postMessage({
          type: "LCM_NOTIFICATION_SOUND",
          title: data.title ?? "LCM Finance",
          body: data.body ?? "",
          url: data.url ?? "/",
        })
      );
    })()
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
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
