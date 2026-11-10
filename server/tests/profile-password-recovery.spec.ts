import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";
import express from "express";
import { handleChangePassword, handleFinalizePasswordChange } from "../routes/profile";
import * as supabaseAdminModule from "../lib/supabase-admin";
import * as auditModule from "../lib/audit-server";

describe("Password Renewal, Failure Recovery & Edge Cases Suite", () => {
  let server: http.Server;
  let baseUrl: string;

  let mockAuthUsers: Record<string, any> = {};
  let mockPublicUsers: Record<string, any> = {};
  let dbUpdateShouldFail = false;

  beforeEach(async () => {
    dbUpdateShouldFail = false;
    mockAuthUsers = {
      "user-agent-id": {
        id: "user-agent-id",
        email: "agent@parisportif.com",
        password: "TemporaryOldPassword1!",
        user_metadata: { must_change_password: true },
      },
      "user-suspended-id": {
        id: "user-suspended-id",
        email: "suspended@parisportif.com",
        password: "TemporaryOldPassword1!",
        user_metadata: { must_change_password: true },
      },
    };

    mockPublicUsers = {
      "user-agent-id": {
        id: "user-agent-id",
        email: "agent@parisportif.com",
        nom: "Traoré",
        prenom: "Moussa",
        role: "AGENT",
        statut: "actif",
        must_change_password: true,
      },
      "user-suspended-id": {
        id: "user-suspended-id",
        email: "suspended@parisportif.com",
        nom: "Suspendu",
        prenom: "User",
        role: "AGENT",
        statut: "suspendu",
        must_change_password: true,
      },
    };

    // Mock createAnonClient pour simuler signInWithPassword
    vi.spyOn(supabaseAdminModule, "createAnonClient").mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockImplementation(async ({ email, password }: any) => {
          const authUser = Object.values(mockAuthUsers).find((u) => u.email === email);
          if (!authUser || authUser.password !== password) {
            return { data: { session: null, user: null }, error: { message: "Invalid login credentials" } };
          }
          return { data: { session: { access_token: "mock-token" }, user: authUser }, error: null };
        }),
      },
    } as any);

    // Mock getSupabaseAdmin pour simuler Auth Admin API et DB updates
    vi.spyOn(supabaseAdminModule, "getSupabaseAdmin").mockReturnValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockImplementation(async (id: string) => {
            const user = mockAuthUsers[id];
            if (!user) return { data: { user: null }, error: { message: "User not found" } };
            return { data: { user }, error: null };
          }),
          updateUserById: vi.fn().mockImplementation(async (id: string, updates: any) => {
            const user = mockAuthUsers[id];
            if (!user) return { data: { user: null }, error: { message: "User not found" } };
            if (updates.password) {
              user.password = updates.password;
            }
            if (updates.user_metadata) {
              user.user_metadata = { ...user.user_metadata, ...updates.user_metadata };
            }
            return { data: { user }, error: null };
          }),
        },
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "users") {
          return {
            update: vi.fn().mockImplementation((updates: any) => ({
              eq: vi.fn().mockImplementation(async (field: string, val: string) => {
                if (dbUpdateShouldFail) {
                  return { data: null, error: { message: "Connection to database timed out during update" } };
                }
                if (field === "id" && mockPublicUsers[val]) {
                  Object.assign(mockPublicUsers[val], updates);
                  return { data: [mockPublicUsers[val]], error: null };
                }
                return { data: null, error: { message: "User not found in public.users" } };
              }),
            })),
          };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any);

    vi.spyOn(auditModule, "recordAuditLog").mockResolvedValue({ success: true } as any);

    // Initialiser l'application express de test
    const app = express();
    app.use(express.json());

    // Middleware simulé d'authentification
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return next();
      const userId = authHeader.replace("Bearer ", "").trim();
      const user = mockPublicUsers[userId];
      if (user) {
        if (user.statut !== "actif") {
          return res.status(403).json({ error: "Compte inactif ou suspendu" });
        }
        (req as any).user = user;
      }
      next();
    });

    app.post("/api/auth/change-password", handleChangePassword);
    app.post("/api/auth/finalize-password-change", handleFinalizePasswordChange);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr: any = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
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

  it("1. Mauvais mot de passe actuel : doit échouer avant toute mutation", async () => {
    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-agent-id",
      },
      body: JSON.stringify({
        currentPassword: "WrongPassword999!",
        newPassword: "BrandNewSecurePassword123!",
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("mot de passe actuel est incorrect");
    // L'ancien mot de passe et l'état must_change_password restent inchangés
    expect(mockAuthUsers["user-agent-id"].password).toBe("TemporaryOldPassword1!");
    expect(mockPublicUsers["user-agent-id"].must_change_password).toBe(true);
  });

  it("2. Nouveau mot de passe identique à l'actuel : rejet immédiat", async () => {
    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-agent-id",
      },
      body: JSON.stringify({
        currentPassword: "TemporaryOldPassword1!",
        newPassword: "TemporaryOldPassword1!",
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("doit être différent");
  });

  it("3. Politique de mot de passe insuffisante (< 8 caractères) : rejet immédiat", async () => {
    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-agent-id",
      },
      body: JSON.stringify({
        currentPassword: "TemporaryOldPassword1!",
        newPassword: "short",
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("au moins 8 caractères");
  });

  it("4. Compte suspendu pendant le parcours : accès refusé en amont", async () => {
    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-suspended-id",
      },
      body: JSON.stringify({
        currentPassword: "TemporaryOldPassword1!",
        newPassword: "NewSecretPassword123!",
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toContain("inactif ou suspendu");
  });

  it("5. Réussite complète nominale : met à jour Auth et public.users et lève must_change_password", async () => {
    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-agent-id",
      },
      body: JSON.stringify({
        currentPassword: "TemporaryOldPassword1!",
        newPassword: "MyNewSafePassword2026!",
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toContain("succès");

    // Vérifier les états finaux
    expect(mockAuthUsers["user-agent-id"].password).toBe("MyNewSafePassword2026!");
    expect(mockAuthUsers["user-agent-id"].user_metadata.must_change_password).toBe(false);
    expect(mockPublicUsers["user-agent-id"].must_change_password).toBe(false);
    expect(mockPublicUsers["user-agent-id"].password_changed_at).toBeDefined();
  });

  it("6. Échec partiel (Auth réussit mais DB timeout) : retourne pendingFinalization=true sans dégrader le secret", async () => {
    dbUpdateShouldFail = true;

    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-agent-id",
      },
      body: JSON.stringify({
        currentPassword: "TemporaryOldPassword1!",
        newPassword: "BrandNewPassword2026!",
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.pendingFinalization).toBe(true);

    // Auth a bien le nouveau mot de passe
    expect(mockAuthUsers["user-agent-id"].password).toBe("BrandNewPassword2026!");
    // Mais public.users n'est pas encore cleared
    expect(mockPublicUsers["user-agent-id"].must_change_password).toBe(true);
  });

  it("7. Reprise après échec partiel via /api/auth/finalize-password-change sans réclamer l'ancien mot de passe", async () => {
    // Étape A : Simuler l'état post-désynchronisation (Auth a le nouveau secret, DB encore à true)
    mockAuthUsers["user-agent-id"].password = "BrandNewPassword2026!";
    mockAuthUsers["user-agent-id"].user_metadata = {
      must_change_password: false,
      password_renewed_at: new Date().toISOString(),
    };
    mockPublicUsers["user-agent-id"].must_change_password = true;

    // La base de données est maintenant rétablie
    dbUpdateShouldFail = false;

    // Étape B : Appel de reprise
    const finalizeRes = await fetch(`${baseUrl}/api/auth/finalize-password-change`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-agent-id",
      },
    });

    const finalizeData = await finalizeRes.json();
    expect(finalizeRes.status).toBe(200);
    expect(finalizeData.message).toContain("succès");

    // public.users est désormais synchronisé et cleared
    expect(mockPublicUsers["user-agent-id"].must_change_password).toBe(false);
    expect(mockPublicUsers["user-agent-id"].password_changed_at).toBeDefined();
  });

  it("8. Tentative de finalisation sans changement préalable dans Auth : rejetée", async () => {
    // Un utilisateur qui n'a jamais renouvelé son mot de passe
    mockAuthUsers["user-agent-id"].user_metadata = { must_change_password: true };

    const res = await fetch(`${baseUrl}/api/auth/finalize-password-change`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-agent-id",
      },
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("Aucun changement de mot de passe préalable");
    expect(mockPublicUsers["user-agent-id"].must_change_password).toBe(true);
  });

  it("9. Concurrence / double clic : deux demandes simultanées ne corrompent pas l'état", async () => {
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer user-agent-id" },
        body: JSON.stringify({ currentPassword: "TemporaryOldPassword1!", newPassword: "ConcurrentSafePass1!" }),
      }),
      fetch(`${baseUrl}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer user-agent-id" },
        body: JSON.stringify({ currentPassword: "TemporaryOldPassword1!", newPassword: "ConcurrentSafePass1!" }),
      }),
    ]);

    // Au moins l'une des deux requêtes réussit
    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);

    // L'état final doit être intègre
    expect(mockPublicUsers["user-agent-id"].must_change_password).toBe(false);
  });
});
