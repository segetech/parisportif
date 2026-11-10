import { describe, it, expect, vi, beforeEach } from "vitest";
import { purgeAllAppCaches, queryClient, queryKeys } from "@/lib/queryClient";
import { saveToCache, getFromCache } from "@/hooks/use-data-queries";

// Mock localStorage for node test environment
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

/**
 * Test harness replicating the session state machine and generation counter
 * from AuthContext to verify synchronization, race conditions, and error resilience.
 */
class AuthSessionStateMachine {
  user: any = null;
  loading: boolean = true;
  isLoggingOut: boolean = false;
  generation: number = 0;
  activeUserId: string | null = null;
  navigationTarget: string | null = null;

  supabaseMock: {
    signOut: ReturnType<typeof vi.fn>;
    fetchProfile: ReturnType<typeof vi.fn>;
  };

  constructor(supabaseMock: { signOut: any; fetchProfile: any }) {
    this.supabaseMock = supabaseMock;
  }

  // Synchronous, non-blocking onAuthStateChange handler
  handleAuthStateChange(event: string, session: { user?: { id: string } } | null) {
    const newUserId = session?.user?.id ?? null;

    if (event === "SIGNED_OUT" || !newUserId) {
      this.generation += 1;
      this.activeUserId = null;
      this.user = null;
      this.loading = false;
      purgeAllAppCaches();
      return;
    }

    if (event === "TOKEN_REFRESHED" && this.activeUserId === newUserId && this.user) {
      return;
    }

    this.activeUserId = newUserId;
    const gen = ++this.generation;
    this.loading = true;

    // Decoupled asynchronous profile fetch
    setTimeout(() => {
      void this.loadProfile(newUserId, gen);
    }, 0);
  }

  async loadProfile(userId: string, targetGen: number) {
    try {
      if (this.generation !== targetGen || this.activeUserId !== userId) {
        return;
      }

      const res = await this.supabaseMock.fetchProfile(userId);

      // Late response check: if generation changed during flight, discard!
      if (this.generation !== targetGen || this.activeUserId !== userId) {
        return;
      }

      if (res.error) {
        if (this.generation === targetGen) {
          this.loading = false;
        }
        return;
      }

      if (res.data?.statut !== "actif") {
        if (this.generation === targetGen) {
          this.user = null;
          this.loading = false;
          await this.logout();
        }
        return;
      }

      if (this.generation === targetGen) {
        this.user = res.data;
        this.loading = false;
      }
    } catch {
      if (this.generation === targetGen) {
        this.loading = false;
      }
    }
  }

  async logout() {
    if (this.isLoggingOut) {
      // Prevent repeated clicks / concurrent calls
      return;
    }
    this.isLoggingOut = true;

    // Invalidate in-flight requests immediately
    this.generation += 1;
    this.activeUserId = null;

    // Immediately clear UI user and purge caches
    this.user = null;
    purgeAllAppCaches();

    try {
      const res = await this.supabaseMock.signOut();
      if (res?.error) {
        // Fallback local signout
        try {
          await this.supabaseMock.signOut({ scope: "local" });
        } catch {}
      }
    } catch {
      try {
        await this.supabaseMock.signOut({ scope: "local" });
      } catch {}
    } finally {
      this.isLoggingOut = false;
      this.navigationTarget = "/login";
    }
  }

  async login(email: string, userId: string) {
    this.activeUserId = userId;
    const gen = ++this.generation;
    this.loading = true;
    await this.loadProfile(userId, gen);
  }
}

describe("AuthContext & Logout Robustness Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    vi.clearAllMocks();
  });

  describe("1. Standard Logout Workflow", () => {
    it("should successfully log out, purge caches, reset user and navigate to /login", async () => {
      const mockSignOut = vi.fn().mockResolvedValue({ error: null });
      const mockFetchProfile = vi.fn().mockResolvedValue({
        data: { id: "u1", nom: "Dupont", statut: "actif" },
      });

      const auth = new AuthSessionStateMachine({
        signOut: mockSignOut,
        fetchProfile: mockFetchProfile,
      });

      // User logged in
      await auth.login("user@test.com", "u1");
      expect(auth.user).not.toBeNull();
      expect(auth.user.nom).toBe("Dupont");

      // Seed query cache and local cache
      queryClient.setQueryData(queryKeys.bets("u1"), [{ id: "b1" }]);
      saveToCache("bets", [{ id: "b1" }], "u1");

      // Trigger logout
      await auth.logout();

      // Assertions
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(auth.user).toBeNull();
      expect(auth.isLoggingOut).toBe(false);
      expect(auth.navigationTarget).toBe("/login");

      // QueryClient cache must be purged
      expect(queryClient.getQueryData(queryKeys.bets("u1"))).toBeUndefined();
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

      // Local storage cache must be cleaned
      expect(getFromCache("bets", 60000, "u1")).toBeNull();
    });
  });

  describe("2. Late Profile Response & Race Condition Protection", () => {
    it("should discard an in-flight profile fetch if logout occurs before response arrives", async () => {
      let resolveProfilePromise!: (value: any) => void;
      const delayedProfilePromise = new Promise((resolve) => {
        resolveProfilePromise = resolve;
      });

      const mockFetchProfile = vi.fn().mockImplementation(() => delayedProfilePromise);
      const mockSignOut = vi.fn().mockResolvedValue({ error: null });

      const auth = new AuthSessionStateMachine({
        signOut: mockSignOut,
        fetchProfile: mockFetchProfile,
      });

      // Start loading profile for User A (fetch is pending)
      auth.activeUserId = "user-A";
      const fetchPromise = auth.loadProfile("user-A", ++auth.generation);
      expect(mockFetchProfile).toHaveBeenCalledWith("user-A");

      // User clicks logout while profile is still loading in-flight!
      await auth.logout();
      expect(auth.user).toBeNull();

      // Now the delayed profile response arrives late!
      resolveProfilePromise({
        data: { id: "user-A", nom: "ShouldBeIgnored", statut: "actif" },
      });
      await fetchPromise;

      // The late response MUST NOT overwrite the null user state!
      expect(auth.user).toBeNull();
      expect(auth.navigationTarget).toBe("/login");
    });
  });

  describe("3. Repeated Clicks Idempotency", () => {
    it("should ignore repeated clicks on the logout button while logout is in progress", async () => {
      let resolveSignOut!: (value: any) => void;
      const pendingSignOut = new Promise((resolve) => {
        resolveSignOut = resolve;
      });

      const mockSignOut = vi.fn().mockImplementation(() => pendingSignOut);
      const mockFetchProfile = vi.fn();

      const auth = new AuthSessionStateMachine({
        signOut: mockSignOut,
        fetchProfile: mockFetchProfile,
      });

      auth.user = { id: "u1", nom: "Test" };

      // First click: triggers logout
      const logoutPromise1 = auth.logout();
      expect(auth.isLoggingOut).toBe(true);

      // Rapid second and third clicks
      const logoutPromise2 = auth.logout();
      const logoutPromise3 = auth.logout();

      // Only 1 call to supabase signOut should have been issued
      expect(mockSignOut).toHaveBeenCalledTimes(1);

      // Resolve signOut
      resolveSignOut({ error: null });
      await Promise.all([logoutPromise1, logoutPromise2, logoutPromise3]);

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(auth.isLoggingOut).toBe(false);
      expect(auth.user).toBeNull();
      expect(auth.navigationTarget).toBe("/login");
    });
  });

  describe("4. Error Returned by signOut() and Local Fallback", () => {
    it("should handle error returned by remote signOut and still complete local logout and navigation", async () => {
      const mockSignOut = vi
        .fn()
        .mockResolvedValueOnce({ error: { message: "500 Internal Server Error" } })
        .mockResolvedValueOnce({ error: null }); // fallback local

      const mockFetchProfile = vi.fn();

      const auth = new AuthSessionStateMachine({
        signOut: mockSignOut,
        fetchProfile: mockFetchProfile,
      });

      auth.user = { id: "u1" };

      await auth.logout();

      // Remote failed, fallback was attempted
      expect(mockSignOut).toHaveBeenCalledTimes(2);
      expect(mockSignOut).toHaveBeenLastCalledWith({ scope: "local" });

      // State is still safely cleared
      expect(auth.user).toBeNull();
      expect(auth.navigationTarget).toBe("/login");
    });
  });

  describe("5. Exception Thrown by signOut() (Offline / Network Down)", () => {
    it("should tolerate thrown exceptions (e.g. Failed to fetch) and still clear local session and redirect", async () => {
      const mockSignOut = vi
        .fn()
        .mockRejectedValueOnce(new Error("Failed to fetch (offline)"))
        .mockResolvedValueOnce({ error: null });

      const mockFetchProfile = vi.fn();

      const auth = new AuthSessionStateMachine({
        signOut: mockSignOut,
        fetchProfile: mockFetchProfile,
      });

      auth.user = { id: "u1" };

      await auth.logout();

      expect(auth.user).toBeNull();
      expect(auth.navigationTarget).toBe("/login");
      expect(auth.isLoggingOut).toBe(false);
    });
  });

  describe("6. Auth Event During Logout", () => {
    it("should handle SIGNED_OUT event safely during logout without state corruption", async () => {
      const mockSignOut = vi.fn().mockImplementation(async () => {
        // Supabase emits SIGNED_OUT event during execution
        auth.handleAuthStateChange("SIGNED_OUT", null);
        return { error: null };
      });
      const mockFetchProfile = vi.fn();

      const auth = new AuthSessionStateMachine({
        signOut: mockSignOut,
        fetchProfile: mockFetchProfile,
      });

      auth.user = { id: "u1" };

      await auth.logout();

      expect(auth.user).toBeNull();
      expect(auth.navigationTarget).toBe("/login");
    });
  });

  describe("7. Cache Separation (App Cache vs Auth Storage vs Preferences)", () => {
    it("should purge app query cache and cache: keys without deleting user preferences or unrelated keys", () => {
      // Seed app data cache
      saveToCache("transactions", [{ id: "t1" }], "user-1");
      // Seed UI preference
      localStorage.setItem("ps_theme", "dark");
      localStorage.setItem("ps_sidebar_collapsed", "true");
      // Seed external key
      localStorage.setItem("other_app_key", "important");

      // Perform cache purge
      purgeAllAppCaches();

      // App cache must be deleted
      expect(getFromCache("transactions", 60000, "user-1")).toBeNull();

      // Preferences and external keys must NOT be destroyed
      expect(localStorage.getItem("ps_theme")).toBe("dark");
      expect(localStorage.getItem("ps_sidebar_collapsed")).toBe("true");
      expect(localStorage.getItem("other_app_key")).toBe("important");
    });
  });

  describe("8. New Login After Logout", () => {
    it("should allow a new user to log in cleanly after logout without inheriting previous state", async () => {
      const mockSignOut = vi.fn().mockResolvedValue({ error: null });
      const mockFetchProfile = vi.fn().mockImplementation(async (userId: string) => {
        if (userId === "user-A") {
          return { data: { id: "user-A", nom: "Alice", statut: "actif" } };
        }
        if (userId === "user-B") {
          return { data: { id: "user-B", nom: "Bob", statut: "actif" } };
        }
        return { data: null };
      });

      const auth = new AuthSessionStateMachine({
        signOut: mockSignOut,
        fetchProfile: mockFetchProfile,
      });

      // User A logs in
      await auth.login("alice@test.com", "user-A");
      expect(auth.user.nom).toBe("Alice");

      // User A logs out
      await auth.logout();
      expect(auth.user).toBeNull();

      // User B logs in
      await auth.login("bob@test.com", "user-B");
      expect(auth.user.nom).toBe("Bob");
      expect(auth.user.id).toBe("user-B");
    });
  });

  describe("9. Synchronous onAuthStateChange Callback", () => {
    it("should execute onAuthStateChange synchronously without returning a pending promise that blocks locks", () => {
      const mockSignOut = vi.fn();
      const mockFetchProfile = vi.fn();

      const auth = new AuthSessionStateMachine({
        signOut: mockSignOut,
        fetchProfile: mockFetchProfile,
      });

      // Call handleAuthStateChange: it must return undefined synchronously, NOT a Promise
      const returnVal: any = auth.handleAuthStateChange("SIGNED_IN", { user: { id: "u2" } });
      expect(returnVal).toBeUndefined();
      expect(returnVal instanceof Promise).toBe(false);

      // Verify active user was recorded immediately
      expect(auth.activeUserId).toBe("u2");
    });
  });
});
