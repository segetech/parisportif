// App Initialization - Clean up service workers and caches
export async function initializeApp(): Promise<void> {
  console.log('[Init] Starting app initialization');

  // Clean up service workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('[Init] Found SW registrations:', registrations.length);

      for (const registration of registrations) {
        try {
          const unregistered = await registration.unregister();
          if (unregistered) {
            console.log('[Init] Unregistered service worker:', registration.scope);
          }
        } catch (error) {
          console.error('[Init] Failed to unregister SW:', error);
        }
      }
    } catch (error) {
      console.error('[Init] Failed to get SW registrations:', error);
    }
  }

  // Clear all caches
  try {
    const cacheNames = await caches.keys();
    console.log('[Init] Found caches:', cacheNames);

    for (const cacheName of cacheNames) {
      try {
        const deleted = await caches.delete(cacheName);
        if (deleted) {
          console.log('[Init] Deleted cache:', cacheName);
        }
      } catch (error) {
        console.error('[Init] Failed to delete cache:', cacheName, error);
      }
    }
  } catch (error) {
    console.error('[Init] Failed to clear caches:', error);
  }

  // Disable service worker controller
  if ('serviceWorker' in navigator) {
    try {
      const controller = navigator.serviceWorker.controller;
      if (controller) {
        console.log('[Init] Service worker controller present, attempting to unload');
        // Send message to service worker to uninstall
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SKIP_WAITING',
          });
        }
      }
    } catch (error) {
      console.error('[Init] Failed to handle SW controller:', error);
    }
  }

  console.log('[Init] App initialization complete');
}
