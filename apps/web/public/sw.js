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
