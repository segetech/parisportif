import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../index";
import * as supabaseAdminModule from "../lib/supabase-admin";
import http from "http";
import { generateCryptographicPassword } from "../routes/admin-users";
import {
  computeDashboardStats,
  computeWeeklyAnomalyTrend,
  RawBet,
} from "../../client/lib/dashboard-calculator";

describe("Admin Governance & Mandatory Password Enforcement Suite", () => {
  let server: http.Server;
  let baseUrl: string;

  let mockUsers: Record<string, any> = {};
  let mockAuditLogs: any[] = [];

  beforeEach(async () => {
    mockUsers = {
      "admin-token-1": {
        id: "admin-uuid-1",
        email: "admin1@test.com",
        role: "ADMIN",
        statut: "actif",
        nom: "Super",
        prenom: "Admin",
        must_change_password: false,
      },
      "agent-token": {
        id: "agent-uuid-1",
        email: "agent@test.com",
        role: "AGENT",
        statut: "actif",
        nom: "Agent",
        prenom: "Test",
        must_change_password: false,
      },
      "blocked-agent-token": {
        id: "agent-uuid-blocked",
        email: "blocked@test.com",
        role: "AGENT",
        statut: "actif",
        nom: "Blocked",
        prenom: "Agent",
        must_change_password: true,
      },
    };

    mockAuditLogs = [];

    vi.spyOn(supabaseAdminModule, "createAnonClient").mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockImplementation(async ({ email, password }: any) => {
          if (password === "correct-old-password" || password === "TempPass123!") {
            return { data: { user: { email } }, error: null };
          }
          return { data: { user: null }, error: { message: "Invalid credentials" } };
        }),
      },
    } as any);

    vi.spyOn(supabaseAdminModule, "getSupabaseAdmin").mockReturnValue({
      auth: {
        getUser: vi.fn().mockImplementation(async (token: string) => {
          const user = mockUsers[token];
          if (!user) return { data: { user: null }, error: { message: "Invalid token" } };
          return { data: { user: { id: user.id, email: user.email, user_metadata: { must_change_password: user.must_change_password } } }, error: null };
        }),
        admin: {
          createUser: vi.fn().mockImplementation(async ({ email, user_metadata }: any) => {
            const newId = `created-${Date.now()}`;
            return {
              data: { user: { id: newId, email, user_metadata } },
              error: null,
            };
          }),
          updateUserById: vi.fn().mockImplementation(async (id: string, updates: any) => {
            return { data: { id, ...updates }, error: null };
          }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
      from: vi.fn().mockImplementation((table: string) => {
        let filters: Record<string, any> = {};

        const queryBuilder: any = {
          select: vi.fn().mockImplementation((cols?: string, opts?: any) => {
            if (opts?.count === "exact" && table === "users") {
              return {
                ...queryBuilder,
                eq: vi.fn().mockImplementation((field: string, val: any) => {
                  filters[field] = val;
                  return queryBuilder;
                }),
                neq: vi.fn().mockImplementation((field: string, val: any) => {
                  filters[`neq_${field}`] = val;
                  return queryBuilder;
                }),
                then: (resolve: any) => {
                  let activeAdmins = Object.values(mockUsers).filter(
                    (u) => u.role === "ADMIN" && u.statut === "actif"
                  );
                  if (filters["neq_id"]) {
                    activeAdmins = activeAdmins.filter((u) => u.id !== filters["neq_id"]);
                  }
                  resolve({ count: activeAdmins.length, error: null });
                },
              };
            }
            return queryBuilder;
          }),
          eq: vi.fn().mockImplementation((field: string, val: any) => {
            filters[field] = val;
            return queryBuilder;
          }),
          neq: vi.fn().mockImplementation((field: string, val: any) => {
            filters[`neq_${field}`] = val;
            return queryBuilder;
          }),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(async () => {
            if (table === "users") {
              if (filters.id) {
                const found = Object.values(mockUsers).find((u) => u.id === filters.id);
                return { data: found || null, error: found ? null : { message: "Not found" } };
              }
              if (filters.email) {
                const found = Object.values(mockUsers).find((u) => u.email === filters.email);
                return { data: found || null, error: found ? null : { message: "Not found" } };
              }
            }
            return { data: null, error: null };
          }),
          update: vi.fn().mockImplementation((updates: any) => ({
            eq: vi.fn().mockImplementation(async (_field: string, val: any) => {
              if (table === "users") {
                const key = Object.keys(mockUsers).find((k) => mockUsers[k].id === val);
                if (key) {
                  mockUsers[key] = { ...mockUsers[key], ...updates };
                }
              }
              return { data: null, error: null };
            }),
          })),
          insert: vi.fn().mockImplementation(async (records: any) => {
            if (table === "audit_logs") {
              const recs = Array.isArray(records) ? records : [records];
              mockAuditLogs.push(...recs);
            }
            return { error: null };
          }),
        };
        return queryBuilder;
      }),
    } as any);

    const app = createServer();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe("1. Safeguard of Last Active Administrator", () => {
    it("should prevent demoting the last active administrator to CONTROLEUR or AGENT", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/admin-uuid-1/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token-1",
        },
        body: JSON.stringify({ role: "AGENT" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/impossible de rétrograder le dernier administrateur actif/i);
    });

    it("should prevent suspending or deactivating the last active administrator", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/admin-uuid-1/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token-1",
        },
        body: JSON.stringify({ statut: "suspendu" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/impossible de suspendre ou désactiver le dernier administrateur actif/i);
    });
  });

  describe("2. Mandatory Password Renewal Enforcement (Problem 1)", () => {
    it("should reject business access with 403 when user has must_change_password=true", async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/data`, {
        headers: { Authorization: "Bearer blocked-agent-token" },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.mustChangePassword).toBe(true);
      expect(json.error).toMatch(/Renouvellement obligatoire/i);
    });

    it("should reject password change when newPassword equals currentPassword", async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer blocked-agent-token",
        },
        body: JSON.stringify({
          currentPassword: "TempPass123!",
          newPassword: "TempPass123!",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/doit être différent/i);
    });

    it("should successfully update password and lift must_change_password on valid input", async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer blocked-agent-token",
        },
        body: JSON.stringify({
          currentPassword: "TempPass123!",
          newPassword: "BrandNewSecurePassword123!",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toMatch(/succès/i);

      // Verify the flag was lifted in memory user store
      expect(mockUsers["blocked-agent-token"].must_change_password).toBe(false);
    });
  });

  describe("3. Production Dashboard Calculation Module (Problem 6)", () => {
    it("should execute production computeDashboardStats: 31 bets of 100 FCFA all pending = 31 bets, 3100 FCFA, 31 pending", () => {
      const betsList: RawBet[] = [];
      for (let i = 1; i <= 31; i++) {
        betsList.push({
          id: `bet-${i}`,
          amount_fcfa: 100,
          validation_status: "en_attente",
          status: "en_cours",
          date: "2026-11-10",
        });
      }

      // Execute the REAL production module function
      const stats = computeDashboardStats({ allBets: betsList });

      expect(stats.totalBets).toBe(31);
      expect(stats.totalBetsAmount).toBe(3100);
      expect(stats.pendingValidationsCount).toBe(31);
      expect(stats.recentBets.length).toBe(30);
    });

    it("should execute production computeWeeklyAnomalyTrend: 7 zeros when zero anomalies", () => {
      const trend = computeWeeklyAnomalyTrend([], [], "2026-11-10");

      expect(trend.length).toBe(7);
      trend.forEach((point) => {
        expect(point.paris).toBe(0);
        expect(point.transactions).toBe(0);
      });
    });
  });
});
