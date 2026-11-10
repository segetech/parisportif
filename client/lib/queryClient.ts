import { QueryClient } from "@tanstack/react-query";

/**
 * Paliers de fraîcheur (staleTime) et de conservation en mémoire (gcTime)
 * - staleTime : durée pendant laquelle la donnée est considérée 100% fraîche (0 requête réseau au remontage).
 * - gcTime : durée de rétention en mémoire inactive (permet un affichage immédiat de l'ancienne donnée avec rafraîchissement discret en arrière-plan).
 */
export const CACHE_TIERS = {
  // Données opérationnelles fréquentes (Paris, Transactions, Validations)
  OPERATIONAL: {
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  },
  // Tableau de bord et métriques de supervision
  DASHBOARD: {
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  },
  // Référentiels (Opérateurs, Plateformes, Moyens de paiement, Supports, Types de paris, Statuts)
  REFERENCE: {
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 heure
  },
  // Données d'administration (Comptes utilisateurs, Journaux d'audit, Activités illégales)
  ADMIN: {
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  },
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Évite les requêtes intempestives lors du simple changement d'onglet
      refetchOnMount: true, // Ne réémet une requête que si la donnée a dépassé son staleTime
      refetchOnReconnect: true, // Rafraîchit les données après une reconnexion réseau
      staleTime: CACHE_TIERS.OPERATIONAL.staleTime,
      gcTime: CACHE_TIERS.OPERATIONAL.gcTime,
      retry: (failureCount, error: any) => {
        // Ne jamais réessayer sur les erreurs d'authentification ou d'autorisation
        const status = error?.status || error?.statusCode || error?.code;
        const msg = String(error?.message || error || "").toLowerCase();
        if (
          status === 401 ||
          status === 403 ||
          status === "PGRST301" ||
          msg.includes("unauthorized") ||
          msg.includes("jwt")
        ) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Clés de cache centralisées et déterministes.
 * Chaque clé intègre le périmètre utilisateur et les filtres normalisés.
 */
export const queryKeys = {
  dashboard: (userId?: string, role?: string, filters?: any) =>
    ["dashboard", userId || "anon", role || "user", filters || {}] as const,
  transactions: (userId?: string, filters?: any) =>
    ["transactions", userId || "anon", filters || {}] as const,
  transaction: (userId?: string, id?: string) =>
    ["transactions", userId || "anon", "detail", id || ""] as const,
  bets: (userId?: string, filters?: any) =>
    ["bets", userId || "anon", filters || {}] as const,
  bet: (userId?: string, id?: string) =>
    ["bets", userId || "anon", "detail", id || ""] as const,
  venues: (userId?: string, filters?: any) =>
    ["venues", userId || "anon", filters || {}] as const,
  venue: (userId?: string, id?: string) =>
    ["venues", userId || "anon", "detail", id || ""] as const,
  validation: (userId?: string, tab?: string, status?: string) =>
    ["validation", userId || "anon", tab || "bets", status || "all"] as const,
  lookups: () => ["lookups"] as const,
  users: (userId?: string, params?: any) =>
    ["users", userId || "anon", params || {}] as const,
  audit: (userId?: string, filters?: any) =>
    ["audit", userId || "anon", filters || {}] as const,
  illegalBets: (userId?: string) =>
    ["illegal_bets", userId || "anon"] as const,
  illegalTransactions: (userId?: string) =>
    ["illegal_transactions", userId || "anon"] as const,
};

/**
 * Invalidation ciblée des données associées lors d'une mutation
 */
export function invalidateRelatedQueries(domain: "bets" | "transactions" | "venues" | "validation" | "lookups" | "users" | "illegal") {
  switch (domain) {
    case "bets":
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["validation"] });
      break;
    case "transactions":
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["validation"] });
      break;
    case "venues":
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      break;
    case "validation":
      queryClient.invalidateQueries({ queryKey: ["validation"] });
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      break;
    case "lookups":
      queryClient.invalidateQueries({ queryKey: ["lookups"] });
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      break;
    case "users":
      queryClient.invalidateQueries({ queryKey: ["users"] });
      break;
    case "illegal":
      queryClient.invalidateQueries({ queryKey: ["illegal_bets"] });
      queryClient.invalidateQueries({ queryKey: ["illegal_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      break;
  }
}

/**
 * Purge le cache applicatif local (localStorage) et le cache mémoire React Query.
 * Doit être appelé lors de la déconnexion ou de tout changement de session utilisateur.
 */
export function purgeAllAppCaches(): void {
  // 1. Annuler toutes les requêtes en vol pour éviter qu'une réponse tardive ne réinjecte des données
  try {
    queryClient.cancelQueries();
  } catch (e) {
    console.warn("Erreur annulation requêtes en cours:", e);
  }

  // 2. Vider l'intégralité du cache React Query en mémoire
  try {
    queryClient.clear();
  } catch (e) {
    console.warn("Erreur vidage React Query cache:", e);
  }

  // 3. Vider uniquement le cache applicatif local (sans toucher au stockage auth géré par Supabase ni aux préférences utilisateur)
  const storage =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : typeof globalThis !== "undefined" && (globalThis as any).localStorage
        ? (globalThis as any).localStorage
        : null;

  if (storage) {
    try {
      const keysToRemove: string[] = [];
      const len = storage.length || 0;
      for (let i = 0; i < len; i++) {
        const k = storage.key(i);
        if (k && k.startsWith("cache:")) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch (e) {
      console.warn("Erreur purge localStorage cache:", e);
    }
  }
}
