// Service Worker for Background Sync and Push Notifications
const CACHE_NAME = 'fusion-app-v1';
const SYNC_TAG = 'sync-transactions';
const API_BASE = self.location.origin;

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(self.clients.claim());
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip external requests
  if (!event.request.url.includes(API_BASE)) {
    return;
  }

  // Skip all API endpoints - let them handle their own caching
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Only cache static assets (js, css, images, etc)
  if (!event.request.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses with status 200
        if (response.ok && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone).catch(() => {
              // Ignore cache errors
            });
          });
        }
        return response;
      })
      .catch(() => {
        // Return cached response if network fails
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || new Response('Offline', { status: 503 });
        });
      })
  );
});

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Sync event:', event.tag);

  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncOfflineData());
  }
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push event received');

  let notification = {
    title: 'App Update',
    options: {
      body: 'Cache has been updated',
      icon: '/logo.png',
      tag: 'cache-update',
      requireInteraction: false,
    },
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notification.title = data.title || notification.title;
      notification.options.body = data.body || notification.options.body;
      notification.options.tag = data.tag || notification.options.tag;
    } catch {
      notification.options.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notification.title, notification.options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification clicked:', event.notification.tag);
  event.notification.close();

  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'SYNC_NOW') {
    event.waitUntil(syncOfflineData());
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});

// Sync offline data
async function syncOfflineData() {
  try {
    console.log('[ServiceWorker] Starting sync...');

    // Get pending sync items from IndexedDB
    const pending = await getPendingSyncItems();
    console.log('[ServiceWorker] Found pending items:', pending.length);

    for (const item of pending) {
      try {
        await syncItem(item);
        await removePendingSyncItem(item.id);
        console.log('[ServiceWorker] Synced item:', item.id);
      } catch (error) {
        console.error('[ServiceWorker] Sync failed for item:', item.id, error);
      }
    }

    // Notify all clients of sync completion
    notifyClientsOfSync(pending.length);

    console.log('[ServiceWorker] Sync completed');
  } catch (error) {
    console.error('[ServiceWorker] Sync error:', error);
  }
}

// Sync a single item
async function syncItem(item) {
  const response = await fetch(item.url, {
    method: item.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...item.headers,
    },
    body: JSON.stringify(item.data),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.statusText}`);
  }

  return response.json();
}

// Get pending sync items
async function getPendingSyncItems() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('pending', 'readonly');
    const store = tx.objectStore('pending');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

// Remove pending sync item
async function removePendingSyncItem(id) {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('pending', 'readwrite');
    const store = tx.objectStore('pending');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignore errors
  }
}

// Open IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fusionApp', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { keyPath: 'id' });
      }
    };
  });
}

// Notify clients of sync completion
async function notifyClientsOfSync(count) {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      count,
    });
  });
}
