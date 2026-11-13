import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Transaction, Bet, Venue, ListFilters } from "@/data/api";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  CACHE_TIERS,
  queryKeys,
  invalidateRelatedQueries,
} from "@/lib/queryClient";
import { auditService, type AuditEntry } from "@/lib/audit";
import {
  computeDashboardStats,
  computeWeeklyAnomalyTrend,
  CalculatedDashboardStats,
  RawBet,
  RawTransaction,
  RawVenue,
  RawIllegalIncident,
} from "@/lib/dashboard-calculator";

// Cache configuration constants (compatibilité ascendante)
export const CACHE_CONFIG = {
  TRANSACTIONS: {
    staleTime: CACHE_TIERS.OPERATIONAL.staleTime,
    gcTime: CACHE_TIERS.OPERATIONAL.gcTime,
    key: "transactions",
  },
  BETS: {
    staleTime: CACHE_TIERS.OPERATIONAL.staleTime,
    gcTime: CACHE_TIERS.OPERATIONAL.gcTime,
    key: "bets",
  },
  VENUES: {
    staleTime: CACHE_TIERS.REFERENCE.staleTime,
    gcTime: CACHE_TIERS.REFERENCE.gcTime,
    key: "venues",
  },
  USERS: {
    staleTime: CACHE_TIERS.ADMIN.staleTime,
    gcTime: CACHE_TIERS.ADMIN.gcTime,
    key: "users",
  },
};

// Canonicalize object for deterministic JSON serialization
function canonicalizeObject(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeObject);
  }
  const sortedKeys = Object.keys(obj).sort();
  const sorted: Record<string, any> = {};
  for (const k of sortedKeys) {
    if (obj[k] !== undefined) {
      sorted[k] = canonicalizeObject(obj[k]);
    }
  }
  return sorted;
}

export function buildCacheKey(key: string, userId?: string, filters?: any): string {
  const userSegment = userId ? `u:${userId}` : "anon";
  let filterSegment = "all";
  if (filters && typeof filters === "object") {
    try {
      const canonical = canonicalizeObject(filters);
      const serialized = JSON.stringify(canonical);
      const utf8Encoded = encodeURIComponent(serialized);
      const fullEncoded =
        typeof btoa === "function"
          ? btoa(utf8Encoded)
          : Buffer.from(utf8Encoded).toString("base64");
      filterSegment = `f:${fullEncoded}`;
    } catch {
      filterSegment = "all";
    }
  }
  return `cache:v2:${userSegment}:${key}:${filterSegment}`;
}

export function isAuthError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || error.error || error).toLowerCase();
  const status = error.status || error.statusCode || error.code;
  return (
    status === 401 ||
    status === 403 ||
    status === "PGRST301" ||
    msg.includes("unauthorized") ||
    msg.includes("jwt") ||
    msg.includes("inactif") ||
    msg.includes("suspendu") ||
    msg.includes("refusé") ||
    msg.includes("token") ||
    msg.includes("app_unauthenticated") ||
    msg.includes("app_account_inactive") ||
    msg.includes("app_password_change_required") ||
    msg.includes("app_role_unauthorized") ||
    msg.includes("authentication_required") ||
    msg.includes("account_inactive") ||
    msg.includes("password_renewal_required") ||
    msg.includes("role_unauthorized") ||
    msg.includes("permission denied")
  );
}

// Utility: Save to localStorage with user ownership & timestamp
export function saveToCache<T>(key: string, data: T, userId?: string, filters?: any): void {
  try {
    const fullKey = buildCacheKey(key, userId, filters);
    localStorage.setItem(
      fullKey,
      JSON.stringify({
        data,
        ownerId: userId || null,
        timestamp: Date.now(),
      }),
    );
  } catch {}
}

// Utility: Get from localStorage with user validation and TTL check
export function getFromCache<T>(key: string, maxAgeMs: number, userId?: string, filters?: any): T | null {
  try {
    const fullKey = buildCacheKey(key, userId, filters);
    const item = localStorage.getItem(fullKey);
    if (!item) return null;

    const parsed = JSON.parse(item);
    if (!parsed || typeof parsed !== "object") return null;

    if (parsed.ownerId && userId && parsed.ownerId !== userId) {
      return null;
    }

    if (Date.now() - parsed.timestamp > maxAgeMs) {
      localStorage.removeItem(fullKey);
      return null;
    }

    return parsed.data as T;
  } catch {
    return null;
  }
}

// ============================================================================
// 1. TABLEAU DE BORD (DASHBOARD)
// ============================================================================
export interface DashboardStats {
  totalVenues: number;
  totalBets: number;
  totalBetsAmount: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalKnownWinnings: number;
  pendingValidationsCount: number;
  wonBetsCount: number;
  lostBetsCount: number;
  pendingBetsCount: number;
  totalIllegalBets: number;
  totalIllegalTransactions: number;
  recentBets: any[];
  operatorsCount: number;
  venuesByOperator: any[];
  illegalActivityTrend: any[];
}

/**
 * Parcourt de manière paginée et exhaustive une requête PostgREST pour contourner
 * les plafonds de lignes et garantir des résultats 100% complets sans tronquage silencieux.
 * 
 * Règles strictes :
 * 1. Avance toujours de data.length (et non pageSize) pour supporter les plafonds serveur stricts (ex: 500 max).
 * 2. Si le count exact est renvoyé, s'arrête exactement dès que allRows.length >= count.
 * 3. En cas d'erreur sur n'importe quelle page, retourne immédiatement { data: [], error } (jamais de total partiel masqué).
 */
export async function fetchAllRows<T = any>(
  baseQueryFn: () => any,
  pageSize = 1000
): Promise<{ data: T[]; error: any; totalCount?: number }> {
  let allRows: T[] = [];
  let from = 0;
  let totalCount: number | undefined;

  while (true) {
    const query = baseQueryFn();
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    
    if (error) {
      return { data: [], error };
    }

    if (count !== null && count !== undefined && totalCount === undefined) {
      totalCount = count;
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...data);

    // Arrêt si tout a été consommé selon le décompte exact
    if (typeof totalCount === "number" && allRows.length >= totalCount) {
      break;
    }

    // Si le serveur a renvoyé 0 nouvelle ligne (protection anti-boucle)
    if (data.length === 0) {
      break;
    }

    from += data.length;
  }

  return { data: allRows, error: null, totalCount: totalCount ?? allRows.length };
}

export function useDashboardData() {
  const { user } = useAuth();
  const userId = user?.id || "guest-user";
  const userRole = user?.role;

  return useQuery({
    queryKey: queryKeys.dashboard(userId, userRole),
    queryFn: async (): Promise<DashboardStats> => {
      // 1. Tenter en priorité l'appel RPC sécurisé PostgreSQL get_dashboard_aggregates
      let rpcData: any = null;
      let rpcError: any = null;

      try {
        const rpcRes = await supabase.rpc(
          "get_dashboard_aggregates",
          userRole === "AGENT" && user?.id ? { p_agent_id: user.id } : {}
        );
        if (rpcRes.error) {
          rpcError = rpcRes.error;
          // Si l'erreur RPC est une erreur d'autorisation ou de compte bloqué, la propager directement
          if (
            isAuthError(rpcError) ||
            /APP_|AUTHENTICATION_REQUIRED|ACCOUNT_INACTIVE|PASSWORD_RENEWAL_REQUIRED|ROLE_UNAUTHORIZED|USER_NOT_FOUND/i.test(rpcError.message || "")
          ) {
            throw new Error(rpcError.message || "Accès non autorisé aux agrégats du tableau de bord.");
          }
        } else {
          rpcData = rpcRes.data;
        }
      } catch (err: any) {
        if (
          isAuthError(err) ||
          /APP_|AUTHENTICATION_REQUIRED|ACCOUNT_INACTIVE|PASSWORD_RENEWAL_REQUIRED|ROLE_UNAUTHORIZED|USER_NOT_FOUND/i.test(err.message || "")
        ) {
          throw err;
        }
        rpcError = err;
      }

      // 2. Requête ciblée pour les 30 paris les plus récents (ordre total et stable)
      let recentBetsQuery = supabase
        .from("bets")
        .select("id, date, time, operator, support, bet_type, amount_fcfa, status, amount_won_fcfa, validation_status, created_by")
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .order("id", { ascending: false })
        .limit(30);

      if (userRole === "AGENT" && user?.id) {
        recentBetsQuery = recentBetsQuery.eq("created_by", user.id);
      }
      const recentBetsRes = await recentBetsQuery;

      // 3. Récupération exhaustive des salles et incidents pour les graphiques de tendance
      const [venuesRes, illegalBetsRes, illegalTxRes] = await Promise.all([
        fetchAllRows<RawVenue>(() => {
          let q = supabase.from("venues").select("*");
          if (userRole === "AGENT" && user?.id) {
            q = q.eq("created_by", user.id);
          }
          return q.order("id", { ascending: true });
        }),
        fetchAllRows<RawIllegalIncident>(() =>
          supabase.from("illegal_bets").select("id, date, created_at").order("id", { ascending: true })
        ),
        fetchAllRows<RawIllegalIncident>(() =>
          supabase.from("illegal_transactions").select("id, date, created_at").order("id", { ascending: true })
        ),
      ]);

      const listErrors = [
        recentBetsRes.error,
        venuesRes.error,
        illegalBetsRes.error,
        illegalTxRes.error,
      ].filter(Boolean);

      if (listErrors.length > 0) {
        const firstErr = listErrors[0];
        console.error("Erreur détectée dans les requêtes secondaires du tableau de bord:", firstErr);
        if (isAuthError(firstErr)) {
          throw new Error("Session expirée ou droits insuffisants pour charger le tableau de bord.");
        }
        throw new Error(firstErr.message || "Impossible de récupérer les données du tableau de bord.");
      }

      // 4. Si le RPC SQL a réussi, utiliser directement ses agrégats certifiés
      if (rpcData && typeof rpcData === "object") {
        const venues = venuesRes.data || [];
        const opCountMap: Record<string, number> = {};
        for (const v of venues) {
          const op = (v.operator || "Autre").trim();
          opCountMap[op] = (opCountMap[op] || 0) + 1;
        }
        const venuesByOperator = Object.entries(opCountMap).map(([name, count]) => ({
          name,
          count,
        }));

        const illegalActivityTrend = computeWeeklyAnomalyTrend(
          illegalBetsRes.data || [],
          illegalTxRes.data || [],
          new Date()
        );

        return {
          totalVenues: Number(rpcData.total_venues ?? venues.length),
          totalBets: Number(rpcData.total_bets ?? 0),
          totalBetsAmount: Number(rpcData.total_bets_amount ?? 0),
          totalDeposits: Number(rpcData.total_deposits ?? 0),
          totalWithdrawals: Number(rpcData.total_withdrawals ?? 0),
          totalKnownWinnings: Number(rpcData.total_known_winnings ?? 0),
          pendingValidationsCount: Number(rpcData.pending_validations_count ?? 0),
          wonBetsCount: Number(rpcData.won_bets_count ?? 0),
          lostBetsCount: Number(rpcData.lost_bets_count ?? 0),
          pendingBetsCount: Number(rpcData.pending_bets_count ?? 0),
          totalIllegalBets: Number(rpcData.total_illegal_bets ?? (illegalBetsRes.data?.length || 0)),
          totalIllegalTransactions: Number(rpcData.total_illegal_transactions ?? (illegalTxRes.data?.length || 0)),
          recentBets: recentBetsRes.data || [],
          operatorsCount: venuesByOperator.length,
          venuesByOperator,
          illegalActivityTrend,
        };
      }

      // 5. Fallback en cas d'absence du RPC (ex: tests hors ligne avec mocks PostgREST)
      const [betsRes, txRes] = await Promise.all([
        fetchAllRows<RawBet>(() => {
          let q = supabase
            .from("bets")
            .select("id, date, time, operator, support, bet_type, amount_fcfa, status, amount_won_fcfa, validation_status, created_by")
            .order("date", { ascending: false })
            .order("time", { ascending: false })
            .order("id", { ascending: false });
          if (userRole === "AGENT" && user?.id) {
            q = q.eq("created_by", user.id);
          }
          return q;
        }),
        fetchAllRows<RawTransaction>(() => {
          let q = supabase
            .from("transactions")
            .select("id, type, amount_fcfa, validation_status, date, time, operator, created_by")
            .order("date", { ascending: false })
            .order("id", { ascending: false });
          if (userRole === "AGENT" && user?.id) {
            q = q.eq("created_by", user.id);
          }
          return q;
        }),
      ]);

      if (betsRes.error || txRes.error) {
        const err = betsRes.error || txRes.error;
        throw new Error(err.message || "Erreur de chargement des transactions ou paris.");
      }

      return computeDashboardStats({
        allBets: betsRes.data,
        transactions: txRes.data,
        venues: venuesRes.data || [],
        illegalBets: illegalBetsRes.data || [],
        illegalTransactions: illegalTxRes.data || [],
        referenceDate: new Date(),
      });
    },
    staleTime: CACHE_TIERS.DASHBOARD.staleTime,
    gcTime: CACHE_TIERS.DASHBOARD.gcTime,
  });
}

// ============================================================================
// 2. PARIS (BETS)
// ============================================================================
export function useBets(filters?: any) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.bets(userId, filters),
    queryFn: async () => {
      let query = supabase
        .from("bets")
        .select("*")
        .order("date", { ascending: false })
        .order("time", { ascending: false });

      if (filters?.operator && filters.operator !== "all" && filters.operator !== "tous") {
        query = query.eq("operator", filters.operator);
      }
      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.start) {
        query = query.gte("date", filters.start);
      }
      if (filters?.end) {
        query = query.lte("date", filters.end);
      }

      const { data, error } = await query;
      if (error) {
        if (isAuthError(error)) throw error;
        throw error;
      }

      saveToCache("bets", data, userId, filters);
      return (data || []) as Bet[];
    },
    staleTime: CACHE_TIERS.OPERATIONAL.staleTime,
    gcTime: CACHE_TIERS.OPERATIONAL.gcTime,
  });
}

export function useCreateBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: any) => {
      const { data, error } = await supabase.from("bets").insert([input]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("bets");
    },
  });
}

export function useUpdateBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: any }) => {
      const { data, error } = await supabase.from("bets").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bet(undefined, id) });
      invalidateRelatedQueries("bets");
    },
  });
}

export function useDeleteBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bets").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateRelatedQueries("bets");
    },
  });
}

// ============================================================================
// 3. TRANSACTIONS
// ============================================================================
export function useTransactions(filters?: any) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.transactions(userId, filters),
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(filters?.limit || 5000);

      if (filters?.type) {
        query = query.eq("type", filters.type);
      }
      if (filters?.operator && filters.operator !== "all" && filters.operator !== "tous") {
        query = query.eq("operator", filters.operator);
      }
      if (filters?.start) {
        query = query.gte("date", filters.start);
      }
      if (filters?.end) {
        query = query.lte("date", filters.end);
      }

      const { data, error } = await query;
      if (error) {
        if (isAuthError(error)) throw error;
        throw error;
      }

      saveToCache("transactions", data, userId, filters);
      return (data || []) as Transaction[];
    },
    staleTime: CACHE_TIERS.OPERATIONAL.staleTime,
    gcTime: CACHE_TIERS.OPERATIONAL.gcTime,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: any) => {
      const { data, error } = await supabase.from("transactions").insert([input]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("transactions");
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: any }) => {
      const { data, error } = await supabase.from("transactions").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transaction(undefined, id) });
      invalidateRelatedQueries("transactions");
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateRelatedQueries("transactions");
    },
  });
}

// ============================================================================
// 4. SALLES DE JEUX (VENUES)
// ============================================================================
export function useVenues(filters?: any) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.venues(userId, filters),
    queryFn: async () => {
      let query = supabase.from("venues").select("*").order("quartier");

      if (filters?.operator && filters.operator !== "all") {
        query = query.eq("operator", filters.operator);
      }

      const { data, error } = await query;
      if (error) {
        if (isAuthError(error)) throw error;
        throw error;
      }

      saveToCache("venues", data, userId, filters);
      return (data || []) as Venue[];
    },
    staleTime: CACHE_TIERS.REFERENCE.staleTime,
    gcTime: CACHE_TIERS.REFERENCE.gcTime,
  });
}

export function useCreateVenue() {
  return useMutation({
    mutationFn: async (input: any) => {
      const { data, error } = await supabase.from("venues").insert([input]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("venues");
    },
  });
}

export function useUpdateVenue() {
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: any }) => {
      const { data, error } = await supabase.from("venues").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("venues");
    },
  });
}

export function useDeleteVenue() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("venues").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateRelatedQueries("venues");
    },
  });
}

// ============================================================================
// 5. RÉFÉRENTIELS (LOOKUPS)
// ============================================================================
export interface LookupItem {
  id: string;
  name: string;
  active?: boolean;
  is_illegal?: boolean;
}

export interface AppLookups {
  operators: LookupItem[];
  paymentOperators: LookupItem[];
  platforms: LookupItem[];
  supports: LookupItem[];
  betTypes: LookupItem[];
  statuses: LookupItem[];
  // Helper listes simples de chaînes
  operatorNames: string[];
  activeOperatorNames: string[];
  illegalOperatorNames: string[];
  supportNames: string[];
  betTypeNames: string[];
  paymentOperatorNames: string[];
  platformNames: string[];
  statusNames: string[];
}

export function useLookups() {
  return useQuery({
    queryKey: queryKeys.lookups(),
    queryFn: async (): Promise<AppLookups> => {
      const [operators, paymentOps, platforms, supports, betTypes, statuses] =
        await Promise.all([
          supabase.from("operators").select("id, name, active, is_illegal").order("name"),
          supabase.from("payment_operators").select("id, name").order("name"),
          supabase.from("platforms").select("id, name").order("name"),
          supabase.from("supports").select("id, name").order("name"),
          supabase.from("bet_types").select("id, name").order("name"),
          supabase.from("bet_statuses").select("id, name").order("name"),
        ]);

      const ops = operators.data || [];
      const pays = paymentOps.data || [];
      const plats = platforms.data || [];
      const supps = supports.data || [];
      const types = betTypes.data || [];
      const stats = statuses.data || [];

      return {
        operators: ops,
        paymentOperators: pays,
        platforms: plats,
        supports: supps,
        betTypes: types,
        statuses: stats,
        operatorNames: ops.map((x: any) => x.name),
        activeOperatorNames: ops
          .filter((x: any) => x.active !== false && !x.is_illegal)
          .map((x: any) => x.name),
        illegalOperatorNames: ops
          .filter((x: any) => x.is_illegal === true)
          .map((x: any) => x.name),
        paymentOperatorNames: pays.map((x: any) => x.name),
        platformNames: plats.map((x: any) => x.name),
        supportNames: supps.map((x: any) => x.name),
        betTypeNames: types.map((x: any) => x.name),
        statusNames: stats.map((x: any) => x.name),
      };
    },
    staleTime: CACHE_TIERS.REFERENCE.staleTime,
    gcTime: CACHE_TIERS.REFERENCE.gcTime,
  });
}

export function useAddLookupItem() {
  return useMutation({
    mutationFn: async ({ table, name }: { table: string; name: string }) => {
      const { data, error } = await supabase.from(table).insert([{ name }]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("lookups");
    },
  });
}

export function useUpdateLookupItem() {
  return useMutation({
    mutationFn: async ({ table, id, name }: { table: string; id: string; name: string }) => {
      const { data, error } = await supabase.from(table).update({ name }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("lookups");
    },
  });
}

export function useDeleteLookupItem() {
  return useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateRelatedQueries("lookups");
    },
  });
}

// ============================================================================
// 6. VALIDATION DES OPÉRATIONS
// ============================================================================
export function useValidationOperations(tab: "bets" | "transactions", filterStatus: string) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.validation(userId, tab, filterStatus),
    queryFn: async () => {
      let query = supabase.from(tab).select("*").order("created_at", { ascending: false });

      if (filterStatus !== "all") {
        query = query.eq("validation_status", filterStatus);
      }

      const { data, error } = await query;
      if (error) {
        if (isAuthError(error)) throw error;
        throw error;
      }

      return data || [];
    },
    staleTime: CACHE_TIERS.OPERATIONAL.staleTime,
    gcTime: CACHE_TIERS.OPERATIONAL.gcTime,
  });
}

export function useValidateOperation() {
  return useMutation({
    mutationFn: async ({
      type,
      id,
      status,
      notes,
      userId,
    }: {
      type: "bets" | "transactions";
      id: string;
      status: "valide" | "refuse";
      notes?: string;
      userId?: string;
    }) => {
      const updateData: any = {
        validation_status: status,
        validated_by: userId,
        validated_at: new Date().toISOString(),
      };
      if (notes) updateData.validation_notes = notes;

      const { data, error } = await supabase.from(type).update(updateData).eq("id", id).select().single();
      if (error) throw error;

      // Historique
      try {
        await supabase.from("operation_history").insert({
          operation_type: type,
          operation_id: id,
          action: status === "valide" ? "validé" : "refusé",
          created_by: userId,
          comment: notes,
        });
      } catch {}

      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("validation");
    },
  });
}

// ============================================================================
// 7. UTILISATEURS (USERS MANAGEMENT)
// ============================================================================
export function useUsers(params?: any) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.users(userId, params),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("cree_le", { ascending: false });

      if (error) {
        if (isAuthError(error)) throw error;
        throw error;
      }

      return data || [];
    },
    staleTime: CACHE_TIERS.ADMIN.staleTime,
    gcTime: CACHE_TIERS.ADMIN.gcTime,
  });
}

export function useUpdateUserStatus() {
  return useMutation({
    mutationFn: async ({ userId, statut }: { userId: string; statut: string }) => {
      const { data, error } = await supabase.from("users").update({ statut }).eq("id", userId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("users");
    },
  });
}

export function useUpdateUserRole() {
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data, error } = await supabase.from("users").update({ role }).eq("id", userId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("users");
    },
  });
}

// ============================================================================
// 8. AUDIT LOGS
// ============================================================================
export function useAuditLogs(filters?: any) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.audit(userId, filters),
    queryFn: async (): Promise<AuditEntry[]> => {
      const base = await auditService.list({
        start: filters?.start || undefined,
        end: filters?.end || undefined,
        userEmail: filters?.userEmail || undefined,
        role: filters?.role || undefined,
        action: filters?.action || undefined,
        entity: filters?.entity || undefined,
      });

      const uid = (filters?.userId || "").trim();
      if (uid) {
        return base.filter(
          (e) =>
            e.entityId === uid ||
            (e.details && (e.details.userId === uid || e.details.user?.id === uid))
        );
      }
      return base;
    },
    staleTime: CACHE_TIERS.ADMIN.staleTime,
    gcTime: CACHE_TIERS.ADMIN.gcTime,
  });
}

// ============================================================================
// 9. ACTIVITÉS ILLÉGALES (ILLEGAL ACTIVITIES)
// ============================================================================
export function useIllegalActivities() {
  const { user } = useAuth();
  const userId = user?.id;

  const betsQuery = useQuery({
    queryKey: queryKeys.illegalBets(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("illegal_bets")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: CACHE_TIERS.ADMIN.staleTime,
    gcTime: CACHE_TIERS.ADMIN.gcTime,
  });

  const transactionsQuery = useQuery({
    queryKey: queryKeys.illegalTransactions(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("illegal_transactions")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: CACHE_TIERS.ADMIN.staleTime,
    gcTime: CACHE_TIERS.ADMIN.gcTime,
  });

  return {
    illegalBets: betsQuery.data || [],
    illegalTransactions: transactionsQuery.data || [],
    isLoading: betsQuery.isLoading || transactionsQuery.isLoading,
    isFetching: betsQuery.isFetching || transactionsQuery.isFetching,
    refetch: async () => {
      await Promise.all([betsQuery.refetch(), transactionsQuery.refetch()]);
    },
  };
}

export function useCreateIllegalBet() {
  return useMutation({
    mutationFn: async (input: any) => {
      const { data, error } = await supabase.from("illegal_bets").insert([input]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("illegal");
    },
  });
}

export function useCreateIllegalTransaction() {
  return useMutation({
    mutationFn: async (input: any) => {
      const { data, error } = await supabase.from("illegal_transactions").insert([input]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelatedQueries("illegal");
    },
  });
}

// Cache management utility (compatibilité ascendante)
export function useClearCache() {
  const queryClient = useQueryClient();

  return {
    clearAll: () => {
      queryClient.clear();
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("cache:") || k.startsWith("ps."))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
    },
    clearTransactions: () =>
      queryClient.invalidateQueries({
        queryKey: [CACHE_CONFIG.TRANSACTIONS.key],
      }),
    clearBets: () =>
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.BETS.key] }),
    clearVenues: () =>
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.VENUES.key] }),
    clearUsers: () =>
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.USERS.key] }),
  };
}
