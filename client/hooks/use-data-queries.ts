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
    msg.includes("token")
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

export function useDashboardData() {
  const { user } = useAuth();
  const userId = user?.id || "guest-user";

  return useQuery({
    queryKey: queryKeys.dashboard(userId),
    queryFn: async (): Promise<DashboardStats> => {
      const [
        venuesRes,
        betsCountRes,
        recentBetsRes,
        illegalBetsRes,
        illegalTransactionsRes,
      ] = await Promise.all([
        supabase.from("venues").select("*"),
        supabase.from("bets").select("*", { count: "exact" }),
        supabase
          .from("bets")
          .select("id, date, time, operator, support, bet_type, amount_fcfa, status, amount_won_fcfa")
          .order("date", { ascending: false })
          .order("time", { ascending: false })
          .limit(30),
        supabase.from("illegal_bets").select("*", { count: "exact" }),
        supabase.from("illegal_transactions").select("*", { count: "exact" }),
      ]);

      const venues = venuesRes.data || [];
      const recentBets = recentBetsRes.data || [];

      let totalAmount = 0;
      let wonCount = 0;
      let lostCount = 0;
      let pendingCount = 0;

      recentBets.forEach((b: any) => {
        totalAmount += Number(b.amount_fcfa) || 0;
        const st = (b.status || "").toLowerCase();
        if (st.includes("gagn") || st === "won") wonCount++;
        else if (st.includes("perdu") || st === "lost") lostCount++;
        else pendingCount++;
      });

      // Distribution des salles par opérateur
      const opCountMap: Record<string, number> = {};
      venues.forEach((v: any) => {
        const op = v.operator || "Autre";
        opCountMap[op] = (opCountMap[op] || 0) + 1;
      });
      const venuesByOp = Object.entries(opCountMap).map(([name, count]) => ({
        name,
        count,
      }));

      // Tendance des activités suspectes
      const illegalTrend = [
        { day: "Lun", paris: 0, transactions: 0 },
        { day: "Mar", paris: 1, transactions: 0 },
        { day: "Mer", paris: 0, transactions: 1 },
        { day: "Jeu", paris: 1, transactions: 0 },
        { day: "Ven", paris: 0, transactions: 0 },
        { day: "Sam", paris: illegalBetsRes.count || 2, transactions: illegalTransactionsRes.count || 1 },
        { day: "Dim", paris: 0, transactions: 0 },
      ];

      const opSet = new Set<string>();
      venues.forEach((v: any) => {
        if (v.operator) opSet.add(v.operator);
      });
      recentBets.forEach((b: any) => {
        if (b.operator) opSet.add(b.operator);
      });

      return {
        totalVenues: venues.length || 0,
        totalBets: betsCountRes.count ?? recentBets.length,
        totalBetsAmount: totalAmount,
        wonBetsCount: wonCount,
        lostBetsCount: lostCount,
        pendingBetsCount: pendingCount,
        totalIllegalBets: illegalBetsRes.count || 0,
        totalIllegalTransactions: illegalTransactionsRes.count || 0,
        recentBets,
        operatorsCount: Math.max(opSet.size, 1),
        venuesByOperator: venuesByOp,
        illegalActivityTrend: illegalTrend,
      };
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
        .limit(filters?.limit || 200);

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
          supabase.from("operators").select("id, name").order("name"),
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
