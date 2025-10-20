// Service Worker Cleanup
// Removes old/problematic service worker registrations

export async function unregisterAllServiceWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    console.log("[SW Cleanup] Found registrations:", registrations.length);

    for (const registration of registrations) {
      try {
        const success = await registration.unregister();
        if (success) {
          console.log("[SW Cleanup] Unregistered:", registration.scope);
        }
      } catch (error) {
        console.error("[SW Cleanup] Failed to unregister:", error);
      }
    }

    // Clear caches
    const cacheNames = await caches.keys();
    console.log("[SW Cleanup] Found caches:", cacheNames);

    for (const cacheName of cacheNames) {
      try {
        await caches.delete(cacheName);
        console.log("[SW Cleanup] Deleted cache:", cacheName);
      } catch (error) {
        console.error("[SW Cleanup] Failed to delete cache:", cacheName, error);
      }
    }

    console.log("[SW Cleanup] Cleanup complete");
  } catch (error) {
    console.error("[SW Cleanup] Cleanup failed:", error);
  }
}

export async function clearServiceWorkerCache(): Promise<void> {
  try {
    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
      await caches.delete(cacheName);
    }
    console.log("[SW Cleanup] All caches cleared");
  } catch (error) {
    console.error("[SW Cleanup] Failed to clear caches:", error);
  }
}
