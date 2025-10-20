import { useQueryClient } from "@tanstack/react-query";

const CACHE_KEYS = {
  TRANSACTIONS: "transactions",
  BETS: "bets",
  VENUES: "venues",
  USERS: "users",
  LOOKUPS: "lookups",
  MATCHING: "matching",
};

/**
 * Hook for managing cache invalidation and prefetching
 * Provides fine-grained control over cache lifecycle
 */
export function useCache() {
  const queryClient = useQueryClient();

  return {
    // Invalidate single key
    invalidate: (key: string) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    },

    // Invalidate multiple keys
    invalidateMany: (keys: string[]) => {
      keys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
    },

    // Invalidate all data caches (but keep auth)
    invalidateAllData: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return Object.values(CACHE_KEYS).includes(key as string);
        },
      });
    },

    // Clear specific data from cache
    clearData: (key: string) => {
      queryClient.removeQueries({ queryKey: [key] });
    },

    // Clear all cache
    clearAll: () => {
      queryClient.clear();
    },

    // Get cache size (for debugging/monitoring)
    getCacheSize: () => {
      let size = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("cache:")) {
            const value = localStorage.getItem(key);
            if (value) {
              size += key.length + value.length;
            }
          }
        }
      } catch {}
      return size;
    },

    // Clear old cache entries
    clearExpiredCache: (maxAgeMs: number = 24 * 60 * 60 * 1000) => {
      try {
        const now = Date.now();
        const keysToDelete: string[] = [];

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("cache:")) {
            const item = localStorage.getItem(key);
            if (item) {
              const { timestamp } = JSON.parse(item);
              if (now - timestamp > maxAgeMs) {
                keysToDelete.push(key);
              }
            }
          }
        }

        keysToDelete.forEach((key) => localStorage.removeItem(key));
        return keysToDelete.length;
      } catch {
        return 0;
      }
    },

    // Get cache status
    getCacheStatus: () => {
      const status: Record<string, { cached: boolean; age?: number }> = {};

      try {
        Object.entries(CACHE_KEYS).forEach(([name, key]) => {
          const item = localStorage.getItem(`cache:${key}`);
          if (item) {
            const { timestamp } = JSON.parse(item);
            const age = Date.now() - timestamp;
            status[name] = { cached: true, age };
          } else {
            status[name] = { cached: false };
          }
        });
      } catch {}

      return status;
    },

    // Cache key constants for external use
    keys: CACHE_KEYS,
  };
}

/**
 * Hook for handling cache invalidation on API mutations
 * Use this when making changes that affect cache
 */
export function useCacheInvalidation() {
  const cache = useCache();

  return {
    // After creating a transaction
    onTransactionCreated: () => {
      cache.invalidate(CACHE_KEYS.TRANSACTIONS);
      cache.invalidate(CACHE_KEYS.MATCHING); // Matching suggestions might change
    },

    // After updating a transaction
    onTransactionUpdated: () => {
      cache.invalidate(CACHE_KEYS.TRANSACTIONS);
      cache.invalidate(CACHE_KEYS.MATCHING);
    },

    // After deleting a transaction
    onTransactionDeleted: () => {
      cache.invalidate(CACHE_KEYS.TRANSACTIONS);
      cache.invalidate(CACHE_KEYS.MATCHING);
    },

    // After creating a bet
    onBetCreated: () => {
      cache.invalidate(CACHE_KEYS.BETS);
      cache.invalidate(CACHE_KEYS.MATCHING);
    },

    // After updating a bet
    onBetUpdated: () => {
      cache.invalidate(CACHE_KEYS.BETS);
      cache.invalidate(CACHE_KEYS.MATCHING);
    },

    // After deleting a bet
    onBetDeleted: () => {
      cache.invalidate(CACHE_KEYS.BETS);
      cache.invalidate(CACHE_KEYS.MATCHING);
    },

    // After creating/updating/deleting a venue
    onVenueChanged: () => {
      cache.invalidate(CACHE_KEYS.VENUES);
    },

    // After user changes
    onUserChanged: () => {
      cache.invalidate(CACHE_KEYS.USERS);
    },

    // Complete data refresh
    onDataRefresh: () => {
      cache.invalidateAllData();
    },
  };
}
