import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../index";
import * as supabaseAdminModule from "../lib/supabase-admin";
import http from "http";

describe("Server Security & Access Control", () => {
  let server: http.Server;
  let baseUrl: string;

  // Mock database stores
  let mockUsers: Record<string, any> = {};
  let mockBets: any[] = [];
  let mockTransactions: any[] = [];
  let mockAuditLogs: any[] = [];
  let mockPasswordResets: any[] = [];

  beforeEach(async () => {
    mockPasswordResets = [];
    mockUsers = {
      "admin-token": {
        id: "admin-uuid-1",
        email: "admin@test.com",
        role: "ADMIN",
        statut: "actif",
        nom: "Admin",
        prenom: "System",
      },
      "agent-token": {
        id: "agent-uuid-2",
        email: "agent@test.com",
        role: "AGENT",
        statut: "actif",
        nom: "Agent",
        prenom: "One",
      },
      "suspended-token": {
        id: "suspended-uuid-3",
        email: "suspended@test.com",
        role: "AGENT",
        statut: "suspendu",
        nom: "Suspended",
        prenom: "User",
      },
      "controleur-token": {
        id: "controleur-uuid-4",
        email: "controleur@test.com",
        role: "CONTROLEUR",
        statut: "actif",
        nom: "Controleur",
        prenom: "Audit",
      },
    };

    mockBets = [
      { id: "bet-1", created_by: "agent-uuid-2", amount_fcfa: 5000, validation_status: "en_attente", date: "2026-03-01" },
      { id: "bet-2", created_by: "agent-other-uuid", amount_fcfa: 10000, validation_status: "valide", date: "2026-03-01" },
    ];

    mockTransactions = [
      { id: "tx-1", created_by: "agent-uuid-2", amount_fcfa: 2000, date: "2026-03-01" },
      { id: "tx-2", created_by: "agent-other-uuid", amount_fcfa: 8000, date: "2026-03-01" },
    ];

    mockAuditLogs = [];

    // Mock getSupabaseAdmin
    vi.spyOn(supabaseAdminModule, "getSupabaseAdmin").mockReturnValue({
      auth: {
        getUser: vi.fn().mockImplementation(async (token: string) => {
          const user = mockUsers[token];
          if (!user) return { data: { user: null }, error: { message: "Invalid token" } };
          return { data: { user: { id: user.id, email: user.email } }, error: null };
        }),
        admin: {
          createUser: vi.fn().mockImplementation(async ({ email, user_metadata }: any) => {
            const newId = `new-user-${Date.now()}`;
            return {
              data: { user: { id: newId, email, user_metadata } },
              error: null,
            };
          }),
          updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
      from: vi.fn().mockImplementation((table: string) => {
        let filters: Record<string, any> = {};

        const queryBuilder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((field: string, val: any) => {
            filters[field] = val;
            return queryBuilder;
          }),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(async () => {
            if (table === "users") {
              const u = Object.values(mockUsers).find((u) => u.id === filters.id || u.email === filters.email);
              if (!u) return { data: null, error: { message: "User not found" } };
              return { data: u, error: null };
            }
            return { data: null, error: null };
          }),
          maybeSingle: vi.fn().mockImplementation(async () => {
            if (table === "users") {
              const u = Object.values(mockUsers).find((u) => u.id === filters.id || u.email === filters.email);
              return { data: u || null, error: null };
            }
            return { data: null, error: null };
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            if (table === "users") {
              mockUsers[`token-${payload.id}`] = payload;
              return {
                select: () => ({
                  single: async () => ({ data: payload, error: null }),
                }),
              };
            }
            if (table === "audit_logs") {
              mockAuditLogs.push(payload);
              return Promise.resolve({ data: payload, error: null });
            }
            if (table === "password_resets") {
              mockPasswordResets.push({ ...payload });
              return Promise.resolve({ data: payload, error: null });
            }
            return Promise.resolve({ data: payload, error: null });
          }),
          update: vi.fn().mockImplementation((updatePayload: any) => {
            const updateFilters: Record<string, any> = {};
            let gtField: string | null = null;
            let gtVal: any = null;

            const updateChain: any = {
              eq: (field: string, val: any) => {
                updateFilters[field] = val;
                if (table === "users") {
                  const u = Object.values(mockUsers).find((x) => x[field] === val);
                  if (u) Object.assign(u, updatePayload);
                  return {
                    select: () => ({
                      single: async () => ({ data: u, error: null }),
                    }),
                  };
                }
                return updateChain;
              },
              gt: (field: string, val: any) => {
                gtField = field;
                gtVal = val;
                return updateChain;
              },
              select: () => ({
                maybeSingle: async () => {
                  if (table === "password_resets") {
                    const record = mockPasswordResets.find(
                      (r) =>
                        r.token_hash === updateFilters.token_hash &&
                        r.used === (updateFilters.used ?? false) &&
                        (!gtField || r[gtField] > gtVal)
                    );
                    if (record) {
                      Object.assign(record, updatePayload);
                      return { data: { user_id: record.user_id }, error: null };
                    }
                    return { data: null, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
            };
            return updateChain;
          }),
          then: (resolve: any) => {
            if (table === "bets") {
              let res = [...mockBets];
              if (filters.created_by) {
                res = res.filter((b) => b.created_by === filters.created_by);
              }
              return resolve({ data: res, error: null });
            }
            if (table === "transactions") {
              let res = [...mockTransactions];
              if (filters.created_by) {
                res = res.filter((t) => t.created_by === filters.created_by);
              }
              return resolve({ data: res, error: null });
            }
            if (table === "audit_logs") {
              return resolve({ data: mockAuditLogs, count: mockAuditLogs.length, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return queryBuilder;
      }),
    } as any);

    const app = createServer();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("1. Anonymous Access Protection", () => {
    it("should reject dashboard access without a bearer token with 401", async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/data`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/Jeton d'authentification requis/);
    });

    it("should reject admin user creation without token with 401", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@new.com", nom: "Test", role: "AGENT" }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject audit log access without token with 401", async () => {
      const res = await fetch(`${baseUrl}/api/audit`);
      expect(res.status).toBe(401);
    });

    it("should reject profile updates without token with 401", async () => {
      const res = await fetch(`${baseUrl}/api/auth/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: "NewName" }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("2. Suspended & Inactive Accounts", () => {
    it("should reject access for suspended accounts with 403", async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/data`, {
        headers: { Authorization: "Bearer suspended-token" },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/inactif ou suspendu/);
    });
  });

  describe("3. Role-Based Restrictions (RBAC)", () => {
    it("should forbid AGENT from accessing admin user creation with 403", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/create`, {
        method: "POST",
        headers: {
          Authorization: "Bearer agent-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "hack@new.com", nom: "Hack", role: "ADMIN" }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/Accès refusé pour ce rôle/);
    });

    it("should forbid CONTROLEUR from creating users with 403", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/create`, {
        method: "POST",
        headers: {
          Authorization: "Bearer controleur-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "new@user.com", nom: "New", role: "AGENT" }),
      });
      expect(res.status).toBe(403);
    });

    it("should allow active ADMIN to create users and record audit log", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/create`, {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "new@valid.com", nom: "Dupont", role: "AGENT" }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.user.email).toBe("new@valid.com");
      expect(json.temporaryPassword).toBeDefined();

      // Verify audit log recorded
      expect(mockAuditLogs.length).toBeGreaterThan(0);
      expect(mockAuditLogs[0].action).toBe("cree");
      expect(mockAuditLogs[0].user_id).toBe("admin-uuid-1");
    });
  });

  describe("4. Data Isolation in Dashboard", () => {
    it("should strictly filter records for AGENT to their own created_by items only", async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/data`, {
        headers: { Authorization: "Bearer agent-token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.bets.length).toBe(1);
      expect(json.bets[0].created_by).toBe("agent-uuid-2");
      expect(json.transactions.length).toBe(1);
      expect(json.transactions[0].created_by).toBe("agent-uuid-2");
    });

    it("should ignore fraudulent role=ADMIN query param passed by an AGENT", async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/data?role=ADMIN&userId=admin-uuid-1`, {
        headers: { Authorization: "Bearer agent-token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      // Still only agent's items returned, role elevation in query param ignored
      expect(json.bets.length).toBe(1);
      expect(json.bets[0].created_by).toBe("agent-uuid-2");
    });

    it("should allow ADMIN to view all records in dashboard", async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/data`, {
        headers: { Authorization: "Bearer admin-token" },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.bets.length).toBe(2);
      expect(json.transactions.length).toBe(2);
    });
  });

  describe("5. Profile Security", () => {
    it("should update authenticated user's profile and ignore forged X-User-Id", async () => {
      const res = await fetch(`${baseUrl}/api/auth/update-profile`, {
        method: "POST",
        headers: {
          Authorization: "Bearer agent-token",
          "X-User-Id": "victim-uuid-999", // Forged header should be completely ignored
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nom: "UpdatedAgent", prenom: "Secure" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.nom).toBe("UpdatedAgent");
      expect(json.user.id).toBe("agent-uuid-2"); // Updated the token owner, not the forged victim
    });
  });

  describe("6. Audit Log Protection & Client Forgery Prevention", () => {
    it("should reject client attempts to forge business mutations (cree, valide, supprime)", async () => {
      const res = await fetch(`${baseUrl}/api/audit`, {
        method: "POST",
        headers: {
          Authorization: "Bearer agent-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "valide",
          entity: "Transaction",
          entityId: "fake-tx-123",
          details: { amount: 50000 },
        }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/Action non autorisée via l'API client/);
    });

    it("should accept legitimate UI events from active clients", async () => {
      const res = await fetch(`${baseUrl}/api/audit`, {
        method: "POST",
        headers: {
          Authorization: "Bearer agent-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "client_ui_view",
          entity: "Dashboard",
          entityId: "main-view",
          details: { tab: "bets" },
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify the log derived the authenticated user ID and not client spoofing
      const latestLog = mockAuditLogs[mockAuditLogs.length - 1];
      expect(latestLog.user_id).toBe("agent-uuid-2");
      expect(latestLog.action).toBe("client_ui_view");
    });
  });

  describe("7. Single-Use and Atomic Password Reset", () => {
    it("should return the exact same generic message for both existing and non-existing accounts", async () => {
      // Existing active user
      const res1 = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "agent@test.com" }),
      });
      const json1 = await res1.json();

      // Non-existing user
      const res2 = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "unknown@nowhere.com" }),
      });
      const json2 = await res2.json();

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(json1.message).toBe(json2.message);
      expect(json1.message).toMatch(/Si cet email correspond à un compte actif/);
    });

    it("should consume the reset token atomically and reject any subsequent or concurrent usage", async () => {
      // 1. Generate a token by requesting reset
      await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "agent@test.com" }),
      });

      expect(mockPasswordResets.length).toBe(1);
      const savedRecord = mockPasswordResets[0];
      expect(savedRecord.used).toBe(false);

      // In real flow, the raw token is in email and hashed with sha256 to match token_hash
      // We test handleResetPassword directly with a known token
      const rawTestToken = "test-secret-token-xyz";
      const crypto = await import("crypto");
      const hashedTestToken = crypto.createHash("sha256").update(rawTestToken).digest("hex");

      mockPasswordResets.push({
        id: "reset-1",
        user_id: "agent-uuid-2",
        token_hash: hashedTestToken,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        used: false,
      });

      // First reset request -> Must SUCCEED
      const res1 = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: rawTestToken,
          password: "new-Strong-Password-123!",
        }),
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.message).toMatch(/réinitialisé avec succès/);

      // Verify token is now marked used in store
      const consumed = mockPasswordResets.find((r) => r.token_hash === hashedTestToken);
      expect(consumed.used).toBe(true);

      // Second reset request with the same token -> Must FAIL with 400
      const res2 = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: rawTestToken,
          password: "another-Password-456!",
        }),
      });

      expect(res2.status).toBe(400);
      const json2 = await res2.json();
      expect(json2.error).toMatch(/invalide, déjà utilisé ou expiré/);
    });

    it("should prevent double-redemption when two requests submit the token concurrently", async () => {
      const rawTestToken = "concurrent-secret-token-abc";
      const crypto = await import("crypto");
      const hashedTestToken = crypto.createHash("sha256").update(rawTestToken).digest("hex");

      mockPasswordResets.push({
        id: "reset-concurrent",
        user_id: "agent-uuid-2",
        token_hash: hashedTestToken,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        used: false,
      });

      // Fire 2 concurrent reset requests simultaneously
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: rawTestToken, password: "NewPassword1!" }),
        }),
        fetch(`${baseUrl}/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: rawTestToken, password: "NewPassword2!" }),
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one request must succeed (200) and the concurrent one must be rejected (400)
      expect(statuses).toEqual([200, 400]);

      // Verify token in store is marked used
      const rec = mockPasswordResets.find((r) => r.token_hash === hashedTestToken);
      expect(rec.used).toBe(true);
    });
  });
});
