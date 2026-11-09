// App Initialization - Versioned one-time migration and cleanup
export async function initializeApp(): Promise<void> {
  const INIT_VERSION_KEY = "ps_app_init_v2";

  if (typeof window !== "undefined" && window.localStorage) {
    // If migration already completed for this version, skip completely to preserve caches
    if (localStorage.getItem(INIT_VERSION_KEY) === "done") {
      return;
    }
  }

  console.log("[Init] Running one-time app initialization and cleanup...");

  // Safely unregister any legacy service workers
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        console.log("[Init] Cleaning up legacy SW registrations:", registrations.length);
        for (const registration of registrations) {
          try {
            await registration.unregister();
          } catch (error) {
            console.warn("[Init] Could not unregister SW:", error);
          }
        }
      }
    } catch (error) {
      console.warn("[Init] Error querying SW registrations:", error);
    }
  }

  // Clear obsolete CacheStorage caches if any legacy service worker created them
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        if (cacheName.includes("workbox") || cacheName.includes("sw-") || cacheName.includes("pari-sportif-precache")) {
          try {
            await caches.delete(cacheName);
          } catch {}
        }
      }
    } catch (error) {
      console.warn("[Init] Error checking CacheStorage:", error);
    }
  }

  // Mark initialization complete so it never runs again on subsequent loads
  try {
    localStorage.setItem(INIT_VERSION_KEY, "done");
  } catch {}

  console.log("[Init] App initialization complete (versioned, non-destructive)");
}
