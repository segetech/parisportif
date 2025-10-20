// App Initialization - Clean up service workers and caches
export async function initializeApp(): Promise<void> {
  console.log("[Init] Starting app initialization");

  // Aggressively clear all service workers and caches
  if ("serviceWorker" in navigator) {
    try {
      // Unregister all service workers
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log("[Init] Found SW registrations:", registrations.length);

      for (const registration of registrations) {
        try {
          const unregistered = await registration.unregister();
          if (unregistered) {
            console.log(
              "[Init] Unregistered service worker:",
              registration.scope,
            );
          }
        } catch (error) {
          console.error("[Init] Failed to unregister SW:", error);
        }
      }

      // Send skip waiting to any active controller
      if (navigator.serviceWorker.controller) {
        console.log("[Init] Forcing service worker to skip waiting");
        navigator.serviceWorker.controller.postMessage({
          type: "SKIP_WAITING",
        });
      }
    } catch (error) {
      console.error("[Init] Failed to get SW registrations:", error);
    }
  }

  // Clear all caches with retry
  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      console.log("[Init] Found caches:", cacheNames.length, cacheNames);

      // Delete each cache
      for (const cacheName of cacheNames) {
        try {
          const deleted = await caches.delete(cacheName);
          console.log("[Init] Cache deletion result:", cacheName, deleted);
        } catch (error) {
          console.error("[Init] Failed to delete cache:", cacheName, error);
        }
      }

      // Verify deletion
      const remainingCaches = await caches.keys();
      console.log(
        "[Init] Remaining caches after cleanup:",
        remainingCaches.length,
      );
    } catch (error) {
      console.error("[Init] Failed to clear caches:", error);
    }
  }

  // Additional: Reload if service worker is present
  if (navigator.serviceWorker?.controller) {
    console.log("[Init] Service worker still active, will reload page");
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  console.log("[Init] App initialization complete");
}
