// Service Worker - DISABLED DUE TO BODY STREAM ISSUES
// Do not use service worker for caching to avoid "body stream already read" errors
// Service worker functionality is currently disabled

const CACHE_NAME = "fusion-app-v1";
const SYNC_TAG = "sync-transactions";

// Install event
self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Installing (disabled)");
  self.skipWaiting();
});

// Activate event - clean all caches
self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activating - cleaning caches");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log("[ServiceWorker] Deleting cache:", cacheName);
            return caches.delete(cacheName);
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Fetch event - DO NOT INTERCEPT (disabled)
// Service worker fetch interception is disabled to prevent "body stream already read" errors
// All requests will go directly to the server without service worker interference

// Service Worker features disabled
// Background sync, push notifications, and other features are disabled
// to avoid conflicts with fetch intercepting and "body stream already read" errors
