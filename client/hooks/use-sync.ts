import { useEffect, useState, useCallback, useRef } from 'react';
import {
  initializeSync,
  queueSyncItem,
  getPendingSyncItems,
  syncAll,
  getSyncQueueSize,
  clearSyncQueue,
} from '@/lib/sync';
import { toast } from 'sonner';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
  queueSize: number;
}

interface SyncHookOptions {
  autoSync?: boolean;
  syncInterval?: number;
  enableServiceWorker?: boolean;
}

/**
 * Hook for monitoring sync status and managing offline operations
 */
export function useSync(options: SyncHookOptions = {}) {
  const { autoSync = true, syncInterval = 30000, enableServiceWorker = true } = options;

  const [status, setStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    queueSize: 0,
  });

  const syncTimeoutRef = useRef<NodeJS.Timeout>();
  const swRef = useRef<ServiceWorkerContainer | null>(null);

  // Initialize sync system
  useEffect(() => {
    const init = async () => {
      try {
        await initializeSync();
        console.log('[Sync Hook] Initialized');

        // Register service worker if enabled
        if (enableServiceWorker && 'serviceWorker' in navigator) {
          try {
            swRef.current = navigator.serviceWorker;
            const registration = await swRef.current.register('/service-worker.js', {
              scope: '/',
            });
            console.log('[Sync Hook] Service worker registered');

            // Listen for messages from service worker
            if (swRef.current) {
              swRef.current.addEventListener('message', (event) => {
                if (event.data.type === 'SYNC_COMPLETE') {
                  console.log('[Sync Hook] Sync complete:', event.data.count);
                  updateStatus();
                }
              });
            }
          } catch (error) {
            console.error('[Sync Hook] Service worker registration failed:', error);
          }
        }

        updateStatus();
      } catch (error) {
        console.error('[Sync Hook] Initialization failed:', error);
      }
    };

    init();

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [enableServiceWorker]);

  // Update status
  const updateStatus = useCallback(async () => {
    try {
      const pendingItems = await getPendingSyncItems();
      const queueSize = await getSyncQueueSize();

      setStatus((prev) => ({
        ...prev,
        pendingCount: pendingItems.length,
        queueSize,
      }));
    } catch (error) {
      console.error('[Sync Hook] Error updating status:', error);
    }
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Sync Hook] Online');
      setStatus((prev) => ({ ...prev, isOnline: true }));
      // Attempt sync when coming back online
      if (autoSync) {
        performSync();
      }
    };

    const handleOffline = () => {
      console.log('[Sync Hook] Offline');
      setStatus((prev) => ({ ...prev, isOnline: false }));
      toast.warning('You are offline. Changes will be synced when online.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [autoSync]);

  // Auto-sync interval
  useEffect(() => {
    if (!autoSync || !status.isOnline) return;

    // Initial update
    updateStatus();

    // Periodic sync
    syncTimeoutRef.current = setInterval(() => {
      updateStatus();
      if (status.pendingCount > 0) {
        performSync();
      }
    }, syncInterval);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [autoSync, status.isOnline, status.pendingCount, syncInterval, updateStatus]);

  // Perform sync
  const performSync = useCallback(async () => {
    if (status.isSyncing) return;
    if (!status.isOnline) {
      toast.error('Cannot sync while offline');
      return;
    }

    setStatus((prev) => ({ ...prev, isSyncing: true }));

    try {
      const result = await syncAll();

      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} item(s)`);
      }

      if (result.failed > 0) {
        toast.error(`Failed to sync ${result.failed} item(s)`);
      }

      setStatus((prev) => ({
        ...prev,
        lastSyncTime: Date.now(),
        pendingCount: result.remaining,
        queueSize: result.remaining,
      }));
    } catch (error) {
      console.error('[Sync Hook] Sync failed:', error);
      toast.error('Sync failed. Will retry automatically.');
    } finally {
      setStatus((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [status.isSyncing, status.isOnline]);

  // Queue an operation
  const queueOperation = useCallback(
    async (url: string, method: string, data: any, headers?: Record<string, string>) => {
      try {
        const id = await queueSyncItem(url, method, data, headers);
        toast.info('Operation queued for sync');
        await updateStatus();
        return id;
      } catch (error) {
        console.error('[Sync Hook] Failed to queue operation:', error);
        toast.error('Failed to queue operation');
        throw error;
      }
    },
    [updateStatus]
  );

  // Clear queue
  const clearQueue = useCallback(async () => {
    try {
      await clearSyncQueue();
      await updateStatus();
      toast.success('Sync queue cleared');
    } catch (error) {
      console.error('[Sync Hook] Failed to clear queue:', error);
      toast.error('Failed to clear queue');
    }
  }, [updateStatus]);

  return {
    status,
    performSync,
    queueOperation,
    clearQueue,
    updateStatus,
  };
}

/**
 * Hook for detecting network status
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}

/**
 * Hook for monitoring specific sync operations
 */
export function useSyncMonitor() {
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await getPendingSyncItems();
      setPendingItems(items);
    } catch (error) {
      console.error('[Sync Monitor] Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { pendingItems, isLoading, refresh };
}
