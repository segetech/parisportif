import { describe, it, expect, beforeEach } from "vitest";
import {
  buildCacheKey,
  saveToCache,
  getFromCache,
  isAuthError,
} from "./use-data-queries";

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

describe("Cache Isolation and Data Security", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("buildCacheKey", () => {
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
      // These two filters share the same 32+ prefix characters and caused collisions in v1
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
});
