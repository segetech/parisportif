import { useQueryClient } from "@tanstack/react-query";
import { purgeAllAppCaches, invalidateRelatedQueries } from "@/lib/queryClient";

const CACHE_KEYS = {
  TRANSACTIONS: "transactions",
  BETS: "bets",
  VENUES: "venues",
  USERS: "users",
  LOOKUPS: "lookups",
  DASHBOARD: "dashboard",
  VALIDATION: "validation",
  AUDIT: "audit",
  ILLEGAL: "illegal",
  MATCHING: "matching",
};

/**
 * Hook de gestion du cycle de vie du cache
 * Fournit un contrôle fin sur l'invalidation et le rafraîchissement
 */
export function useCache() {
  const queryClient = useQueryClient();

  return {
    // Invalider une clé spécifique
    invalidate: (key: string) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    },

    // Invalider un domaine métier avec toutes ses dépendances
    invalidateDomain: (domain: "bets" | "transactions" | "venues" | "validation" | "lookups" | "users" | "illegal") => {
      invalidateRelatedQueries(domain);
    },

    // Invalider plusieurs clés
    invalidateMany: (keys: string[]) => {
      keys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
    },

    // Invalider tous les caches métier (mais préserver l'auth)
    invalidateAllData: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return Object.values(CACHE_KEYS).includes(key as string);
        },
      });
    },

    // Supprimer une clé spécifique du cache
    clearData: (key: string) => {
      queryClient.removeQueries({ queryKey: [key] });
    },

    // Purge totale (utilisé notamment lors de la déconnexion)
    clearAll: () => {
      purgeAllAppCaches();
    },

    // Taille approximative du cache local
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

    // Nettoyer les entrées expirées du cache localStorage
    clearExpiredCache: (maxAgeMs: number = 24 * 60 * 60 * 1000) => {
      try {
        const now = Date.now();
        const keysToDelete: string[] = [];

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("cache:")) {
            const item = localStorage.getItem(key);
            if (item) {
              try {
                const { timestamp } = JSON.parse(item);
                if (timestamp && now - timestamp > maxAgeMs) {
                  keysToDelete.push(key);
                }
              } catch {
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

    // Statut des différents segments de cache
    getCacheStatus: () => {
      const status: Record<string, { cached: boolean; age?: number }> = {};

      try {
        Object.entries(CACHE_KEYS).forEach(([name, key]) => {
          // Chercher dans localStorage les clés correspondantes
          let found = false;
          let latestAge = Infinity;
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.includes(`:${key}:`)) {
              found = true;
              try {
                const item = localStorage.getItem(k);
                if (item) {
                  const { timestamp } = JSON.parse(item);
                  if (timestamp) {
                    const age = Date.now() - timestamp;
                    if (age < latestAge) latestAge = age;
                  }
                }
              } catch {}
            }
          }
          if (found && latestAge !== Infinity) {
            status[name] = { cached: true, age: latestAge };
          } else {
            status[name] = { cached: false };
          }
        });
      } catch {}

      return status;
    },

    keys: CACHE_KEYS,
  };
}

/**
 * Hook for handling cache invalidation on API mutations
 */
export function useCacheInvalidation() {
  const cache = useCache();

  return {
    onTransactionCreated: () => {
      cache.invalidateDomain("transactions");
    },
    onTransactionUpdated: () => {
      cache.invalidateDomain("transactions");
    },
    onTransactionDeleted: () => {
      cache.invalidateDomain("transactions");
    },
    onBetCreated: () => {
      cache.invalidateDomain("bets");
    },
    onBetUpdated: () => {
      cache.invalidateDomain("bets");
    },
    onBetDeleted: () => {
      cache.invalidateDomain("bets");
    },
    onVenueChanged: () => {
      cache.invalidateDomain("venues");
    },
    onUserChanged: () => {
      cache.invalidateDomain("users");
    },
    onDataRefresh: () => {
      cache.invalidateAllData();
    },
  };
}
