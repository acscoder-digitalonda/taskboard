/**
 * TaskBoard Service Worker
 *
 * Minimal network-first strategy for a real-time app.
 * This SW exists primarily to enable "Add to Home Screen" / PWA install
 * on iOS and Android.  It does NOT aggressively cache — all data comes
 * from Supabase Realtime and should always be fresh.
 */

const CACHE_NAME = "taskboard-v1";

// Install — cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/"]))
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first, fall back to cache only for navigation
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // For navigation requests, try network first then cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/"))
    );
    return;
  }

  // For all other requests, let the browser handle normally (network only)
  // This ensures API calls and realtime connections are never stale
});

// ============================================
// Push Notification Handlers
// ============================================

// Receive push event from server and show notification
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, link, icon } = payload;

    event.waitUntil(
      self.registration.showNotification(title || "TaskBoard", {
        body: body || "",
        icon: icon || "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { link: link || "/" },
        tag: "taskboard-notification",
        renotify: true,
      })
    );
  } catch (err) {
    console.error("Push event parse error:", err);
  }
});

// Handle notification click — focus or open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.link || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If the app is already open, focus it and navigate
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(targetUrl);
    })
  );
});
