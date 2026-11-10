import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildCacheKey,
  saveToCache,
  getFromCache,
  isAuthError,
} from "./use-data-queries";
import {
  queryClient,
  queryKeys,
  purgeAllAppCaches,
  invalidateRelatedQueries,
  CACHE_TIERS,
} from "@/lib/queryClient";

class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  get length(): number {
    return Object.keys(this.store).length;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = new LocalStorageMock() as any;
}

describe("Cache Architecture and Navigation Performance", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
  });

  describe("buildCacheKey and Key Normalization", () => {
    it("should generate distinct cache keys for different users", () => {
      const key1 = buildCacheKey("transactions", "user-A");
      const key2 = buildCacheKey("transactions", "user-B");
      expect(key1).not.toBe(key2);
      expect(key1).toContain("user-A");
      expect(key2).toContain("user-B");
    });

    it("should generate distinct cache keys for different filters", () => {
      const key1 = buildCacheKey("transactions", "user-A", { status: "valide" });
      const key2 = buildCacheKey("transactions", "user-A", { status: "en_attente" });
      expect(key1).not.toBe(key2);
    });

    it("should prevent collisions between overlapping date filters (regression test)", () => {
      const filter1 = { start: "2026-11-01", end: "2026-11-09" };
      const filter2 = { start: "2026-11-01", end: "2026-11-30" };

      const key1 = buildCacheKey("transactions", "user-123", filter1);
      const key2 = buildCacheKey("transactions", "user-123", filter2);

      expect(key1).not.toBe(key2);
      expect(key1.startsWith("cache:v2:")).toBe(true);
      expect(key2.startsWith("cache:v2:")).toBe(true);
    });

    it("should be deterministic regardless of object key order", () => {
      const filterA = { start: "2026-11-01", end: "2026-11-09", status: "valide" };
      const filterB = { status: "valide", end: "2026-11-09", start: "2026-11-01" };

      const keyA = buildCacheKey("transactions", "user-123", filterA);
      const keyB = buildCacheKey("transactions", "user-123", filterB);

      expect(keyA).toBe(keyB);
    });
  });

  describe("Query Keys Determinism and Isolation", () => {
    it("should generate distinct hierarchical keys per user and filter", () => {
      const k1 = queryKeys.bets("user-1", { operator: "1xBet" });
      const k2 = queryKeys.bets("user-2", { operator: "1xBet" });
      const k3 = queryKeys.bets("user-1", { operator: "Betway" });

      expect(k1).not.toEqual(k2);
      expect(k1).not.toEqual(k3);
      expect(k1[0]).toBe("bets");
      expect(k1[1]).toBe("user-1");
    });

    it("should generate lookups query key independently of user for global sharing", () => {
      const lookupsKey = queryKeys.lookups();
      expect(lookupsKey).toEqual(["lookups"]);
    });
  });

  describe("Fresh Data Navigation without Extra Network Requests", () => {
    it("should reuse cached data within staleTime without invoking queryFn again", async () => {
      const fetchFn = vi.fn().mockResolvedValue([{ id: "bet-1", amount: 50000 }]);
      const key = queryKeys.bets("user-1", { type: "Simple" });

      // First query (initial fetch)
      const data1 = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: fetchFn,
        staleTime: CACHE_TIERS.OPERATIONAL.staleTime,
      });

      expect(data1).toHaveLength(1);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Return to page while fresh (within 60s)
      const data2 = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: fetchFn,
        staleTime: CACHE_TIERS.OPERATIONAL.staleTime,
      });

      expect(data2).toEqual(data1);
      // Crucial: fetchFn should NOT be called again
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Immediate Stale Display During Background Refresh", () => {
    it("should provide immediate cached data from memory even if stale", async () => {
      const key = queryKeys.transactions("user-1");
      const initialData = [{ id: "tx-old", amount_fcfa: 100000 }];

      // Seed query cache
      queryClient.setQueryData(key, initialData);

      // Verify immediate synchronous access to avoid blank loading screens
      const cached = queryClient.getQueryData(key);
      expect(cached).toEqual(initialData);

      // Simulate stale invalidation
      await queryClient.invalidateQueries({ queryKey: key });

      // Cached data must still be synchronously accessible for instant rendering
      const stillAccessible = queryClient.getQueryData(key);
      expect(stillAccessible).toEqual(initialData);
    });
  });

  describe("Targeted Invalidation After Mutations", () => {
    it("should invalidate bets, dashboard, and validation when a bet mutation occurs", async () => {
      const betsKey = queryKeys.bets("user-1");
      const dashboardKey = queryKeys.dashboard("user-1");
      const venuesKey = queryKeys.venues("user-1");

      queryClient.setQueryData(betsKey, [{ id: "b1" }]);
      queryClient.setQueryData(dashboardKey, { totalBets: 1 });
      queryClient.setQueryData(venuesKey, [{ id: "v1" }]);

      // Trigger mutation invalidation for bets
      invalidateRelatedQueries("bets");

      const betsState = queryClient.getQueryState(betsKey);
      const dashState = queryClient.getQueryState(dashboardKey);
      const venuesState = queryClient.getQueryState(venuesKey);

      expect(betsState?.isInvalidated).toBe(true);
      expect(dashState?.isInvalidated).toBe(true);
      // Venues should NOT be invalidated by a bet mutation
      expect(venuesState?.isInvalidated).toBe(false);
    });

    it("should invalidate transactions, dashboard, and validation on transaction mutation", () => {
      const txKey = queryKeys.transactions("user-1");
      const dashboardKey = queryKeys.dashboard("user-1");

      queryClient.setQueryData(txKey, [{ id: "t1" }]);
      queryClient.setQueryData(dashboardKey, { totalBets: 1 });

      invalidateRelatedQueries("transactions");

      expect(queryClient.getQueryState(txKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
    });
  });

  describe("User Ownership and Cache Isolation", () => {
    it("should isolate user data and prevent User B from reading User A's cache", () => {
      const sensitiveData = [{ id: "tx-1", amount: 1000000 }];
      saveToCache("transactions", sensitiveData, "user-A");

      // User A reads their own cache
      const userACache = getFromCache("transactions", 60000, "user-A");
      expect(userACache).toEqual(sensitiveData);

      // User B tries to read the same entity
      const userBCache = getFromCache("transactions", 60000, "user-B");
      expect(userBCache).toBeNull();
    });

    it("should expire cache entries after TTL exceeds maxAge", () => {
      const data = [{ id: "bet-1" }];
      saveToCache("bets", data, "user-A");

      // Valid TTL (60s)
      const valid = getFromCache("bets", 60000, "user-A");
      expect(valid).toEqual(data);

      // Expired TTL (0ms)
      const expired = getFromCache("bets", -1, "user-A");
      expect(expired).toBeNull();
    });
  });

  describe("Logout and Session Termination Security", () => {
    it("should cancel all active queries and wipe memory cache on logout", () => {
      const key = queryKeys.transactions("user-1");
      queryClient.setQueryData(key, [{ id: "tx-sensitive", amount: 9999999 }]);

      saveToCache("transactions", [{ secret: "123" }], "user-1");

      // User logs out
      purgeAllAppCaches();

      // Memory cache must be empty
      expect(queryClient.getQueryData(key)).toBeUndefined();
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

      // Local storage cache must be cleared
      const localStorageItem = getFromCache("transactions", 60000, "user-1");
      expect(localStorageItem).toBeNull();
    });
  });

  describe("Authentication Error Detection", () => {
    it("should correctly identify auth errors that must prevent cache fallback", () => {
      expect(isAuthError({ status: 401 })).toBe(true);
      expect(isAuthError({ status: 403 })).toBe(true);
      expect(isAuthError(new Error("JWT expired"))).toBe(true);
      expect(isAuthError(new Error("Compte inactif ou suspendu"))).toBe(true);
      expect(isAuthError(new Error("Accès refusé pour ce rôle"))).toBe(true);
    });

    it("should not flag normal network errors as auth errors", () => {
      expect(isAuthError(new Error("Failed to fetch"))).toBe(false);
      expect(isAuthError(new Error("Network timeout"))).toBe(false);
    });
  });

  describe("fetchAllRows: Complete Pagination & Server Cap Resilience", () => {
    it("should correctly paginate 1001 rows when the server applies a 500-row cap", async () => {
      const { fetchAllRows } = await import("./use-data-queries");
      const TOTAL_ROWS = 1001;
      const SERVER_CAP = 500;
      const allFakeData = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
        id: `bet-${i + 1}`,
        date: "2026-11-10",
        amount_fcfa: 1000,
      }));

      const mockQueryFn = () => ({
        range: vi.fn().mockImplementation(async (from: number, to: number) => {
          // Simuler un plafond serveur : ne jamais renvoyer plus de SERVER_CAP lignes
          const requestedSlice = allFakeData.slice(from, to + 1);
          const cappedSlice = requestedSlice.slice(0, SERVER_CAP);
          return {
            data: cappedSlice,
            error: null,
            count: TOTAL_ROWS,
          };
        }),
      });

      const result = await fetchAllRows(mockQueryFn, 1000);
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1001);
      expect(result.data[0].id).toBe("bet-1");
      expect(result.data[1000].id).toBe("bet-1001");
    });

    it("should handle multiple page size and server cap combinations", async () => {
      const { fetchAllRows } = await import("./use-data-queries");
      const TOTAL_ROWS = 250;
      const allFakeData = Array.from({ length: TOTAL_ROWS }, (_, i) => ({ id: `row-${i}` }));

      const mockQueryFn = () => ({
        range: vi.fn().mockImplementation(async (from: number, to: number) => {
          // Serveur renvoie par paquets de 40 max
          const slice = allFakeData.slice(from, Math.min(to + 1, from + 40));
          return { data: slice, error: null, count: TOTAL_ROWS };
        }),
      });

      const result = await fetchAllRows(mockQueryFn, 100);
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(250);
    });

    it("should preserve deterministic order when dates and times are identical (id tie-breaker)", async () => {
      const { fetchAllRows } = await import("./use-data-queries");
      // 5 lignes avec même date et même heure, ordonnées de manière stable par id
      const sortedData = [
        { id: "bet-99", date: "2026-11-10", time: "14:00" },
        { id: "bet-88", date: "2026-11-10", time: "14:00" },
        { id: "bet-77", date: "2026-11-10", time: "14:00" },
      ];

      const mockQueryFn = () => ({
        range: vi.fn().mockResolvedValue({
          data: sortedData,
          error: null,
          count: sortedData.length,
        }),
      });

      const result = await fetchAllRows(mockQueryFn, 100);
      expect(result.data.map((r: any) => r.id)).toEqual(["bet-99", "bet-88", "bet-77"]);
    });

    it("should immediately throw or return empty data on error mid-pagination without masking partial data", async () => {
      const { fetchAllRows } = await import("./use-data-queries");
      let callCount = 0;

      const mockQueryFn = () => ({
        range: vi.fn().mockImplementation(async (from: number, to: number) => {
          callCount++;
          if (callCount === 1) {
            return { data: [{ id: "row-1" }, { id: "row-2" }], error: null, count: 10 };
          }
          // Erreur au second appel (réseau / DB timeout)
          return { data: null, error: { message: "Database connection lost mid-query" } };
        }),
      });

      const result = await fetchAllRows(mockQueryFn, 2);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("Database connection lost");
      // Ne doit PAS renvoyer un tableau partiel qui tromperait les totaux
      expect(result.data).toEqual([]);
    });

    it("should return empty array when query returns 0 rows", async () => {
      const { fetchAllRows } = await import("./use-data-queries");
      const mockQueryFn = () => ({
        range: vi.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0,
        }),
      });

      const result = await fetchAllRows(mockQueryFn, 500);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });
});
