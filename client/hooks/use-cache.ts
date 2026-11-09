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
      } catch {}
    },
  };
}
