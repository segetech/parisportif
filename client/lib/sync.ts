// Offline Sync Queue Manager
// Stores operations that fail offline and syncs them when online

interface PendingSyncItem {
  id: string;
  url: string;
  method: string;
  data: any;
  headers?: Record<string, string>;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

const DB_NAME = "fusionApp";
const STORE_NAME = "pending";
const MAX_RETRIES = 3;

let db: IDBDatabase | null = null;

// Initialize IndexedDB
export async function initializeSync(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      console.error("Failed to open IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log("[Sync] IndexedDB initialized");
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
        console.log("[Sync] Created pending store");
      }
    };
  });
}

// Add item to sync queue
export async function queueSyncItem(
  url: string,
  method: string,
  data: any,
  headers?: Record<string, string>,
): Promise<string> {
  if (!db) await initializeSync();

  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const item: PendingSyncItem = {
    id,
    url,
    method,
    data,
    headers,
    timestamp: Date.now(),
    retries: 0,
    maxRetries: MAX_RETRIES,
  };

  return new Promise((resolve, reject) => {
    const tx = db!.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(item);

    request.onsuccess = () => {
      console.log("[Sync] Item queued:", id);
      resolve(id);
    };

    request.onerror = () => {
      console.error("[Sync] Failed to queue item:", request.error);
      reject(request.error);
    };
  });
}

// Get all pending sync items
export async function getPendingSyncItems(): Promise<PendingSyncItem[]> {
  if (!db) await initializeSync();

  return new Promise((resolve, reject) => {
    const tx = db!.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = (request.result || []) as PendingSyncItem[];
      resolve(items.sort((a, b) => a.timestamp - b.timestamp));
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Remove item from sync queue
export async function removePendingSyncItem(id: string): Promise<void> {
  if (!db) await initializeSync();

  return new Promise((resolve, reject) => {
    const tx = db!.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log("[Sync] Item removed:", id);
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Update item in sync queue
export async function updatePendingSyncItem(
  id: string,
  updates: Partial<PendingSyncItem>,
): Promise<void> {
  if (!db) await initializeSync();

  return new Promise(async (resolve, reject) => {
    try {
      // Get the item
      const tx1 = db!.transaction(STORE_NAME, "readonly");
      const store1 = tx1.objectStore(STORE_NAME);
      const getRequest = store1.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result as PendingSyncItem;
        if (!item) {
          reject(new Error("Item not found"));
          return;
        }

        // Update and save
        const updated = { ...item, ...updates };
        const tx2 = db!.transaction(STORE_NAME, "readwrite");
        const store2 = tx2.objectStore(STORE_NAME);
        const putRequest = store2.put(updated);

        putRequest.onsuccess = () => {
          console.log("[Sync] Item updated:", id);
          resolve();
        };

        putRequest.onerror = () => {
          reject(putRequest.error);
        };
      };

      getRequest.onerror = () => {
        reject(getRequest.error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

// Get queue size
export async function getSyncQueueSize(): Promise<number> {
  const items = await getPendingSyncItems();
  return items.length;
}

// Clear all sync queue
export async function clearSyncQueue(): Promise<void> {
  if (!db) await initializeSync();

  return new Promise((resolve, reject) => {
    const tx = db!.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      console.log("[Sync] Queue cleared");
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Attempt to sync all pending items
export async function syncAll(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  console.log("[Sync] Starting sync...");
  const items = await getPendingSyncItems();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...item.headers,
        },
        body: JSON.stringify(item.data),
      });

      if (response.ok) {
        await removePendingSyncItem(item.id);
        synced++;
        console.log("[Sync] Synced:", item.id);
      } else {
        // Increment retry count
        const retries = item.retries + 1;
        if (retries > item.maxRetries) {
          await removePendingSyncItem(item.id);
          failed++;
          console.log("[Sync] Max retries exceeded:", item.id);
        } else {
          await updatePendingSyncItem(item.id, { retries });
          console.log("[Sync] Retry needed:", item.id);
        }
      }
    } catch (error) {
      console.error("[Sync] Error syncing item:", item.id, error);
      // Increment retry count
      const retries = item.retries + 1;
      if (retries > item.maxRetries) {
        await removePendingSyncItem(item.id);
        failed++;
      } else {
        await updatePendingSyncItem(item.id, { retries });
      }
    }
  }

  const remaining = await getSyncQueueSize();
  console.log(
    "[Sync] Complete. Synced:",
    synced,
    "Failed:",
    failed,
    "Remaining:",
    remaining,
  );

  return { synced, failed, remaining };
}

// Request service worker to sync
export async function requestBackgroundSync(): Promise<void> {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register("sync-transactions");
      console.log("[Sync] Background sync registered");
    } catch (error) {
      console.error("[Sync] Failed to register background sync:", error);
    }
  }
}
