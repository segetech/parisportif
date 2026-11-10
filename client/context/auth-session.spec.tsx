// @vitest-environment happy-dom
import React, { useState, useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, RequireAuth, useAuth } from "./AuthContext";
import { supabase } from "@/lib/supabase";

function fireInputChange(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// Mock Supabase modules
vi.mock("@/lib/supabase", () => {
  let authChangeCallback: ((event: string, session: any) => void) | null = null;

  return {
    supabase: {
      auth: {
        onAuthStateChange: vi.fn((cb) => {
          authChangeCallback = cb;
          return {
            data: {
              subscription: {
                unsubscribe: vi.fn(),
              },
            },
          };
        }),
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: "user-original-1" },
              access_token: "mock-token-1",
            },
          },
          error: null,
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockImplementation(() => {
              return Promise.resolve({
                data: {
                  id: "user-original-1",
                  nom: "Famanta",
                  prenom: "Assalia",
                  email: "assalia@example.com",
                  role: "ADMIN",
                  statut: "actif",
                },
                error: null,
              });
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      // Helper d'émission pour les tests
      __triggerAuthChange: (event: string, session: any) => {
        if (authChangeCallback) {
          authChangeCallback(event, session);
        }
      },
      __getAuthCallback: () => authChangeCallback,
    },
  };
});

describe("Real AuthContext & RequireAuth Component Tree Suite", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();

    // Configuration par défaut de supabase.from pour retourner le profil actif
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockImplementation(() => {
            return Promise.resolve({
              data: {
                id: "user-original-1",
                nom: "Famanta",
                prenom: "Assalia",
                email: "assalia@example.com",
                role: "ADMIN",
                statut: "actif",
              },
              error: null,
            });
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("1. doit monter le formulaire et préserver fidèlement la saisie lors d'événements SIGNED_IN répétés pour le même utilisateur", async () => {
    let unmountCount = 0;
    let mountCount = 0;

    function TestForm() {
      const { user } = useAuth();
      const [ticketValue, setTicketValue] = useState("MP250326.0415.A49647");

      useEffect(() => {
        mountCount++;
        return () => {
          unmountCount++;
        };
      }, []);

      return (
        <div data-testid="test-form">
          <p data-testid="user-email">{user?.email}</p>
          <input
            data-testid="ticket-input"
            value={ticketValue}
            onChange={(e) => setTicketValue(e.target.value)}
          />
        </div>
      );
    }

    // 1. Monter l'arbre réel
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/"
              element={
                <RequireAuth>
                  <TestForm />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<div data-testid="login-page">Page Login</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Attendre l'initialisation de la session
    await vi.waitFor(() => {
      const emailEl = container.querySelector('[data-testid="user-email"]');
      expect(emailEl?.textContent).toBe("assalia@example.com");
    });

    const input = container.querySelector('[data-testid="ticket-input"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("MP250326.0415.A49647");
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);

    // Modifier la saisie utilisateur avec simulation d'événement input/change
    fireInputChange(input, "SAISIE_EN_COURS_TICKET_MODIFIE_777");

    await vi.waitFor(() => {
      expect(input.value).toBe("SAISIE_EN_COURS_TICKET_MODIFIE_777");
    });

    // 2. Déclencher un événement SIGNED_IN pour le MÊME utilisateur (ex: reconnexion d'onglet)
    (supabase as any).__triggerAuthChange("SIGNED_IN", {
      user: { id: "user-original-1" },
    });

    // Laisser passer les microtâches
    await new Promise((resolve) => setTimeout(resolve, 60));

    // ASSERTION CRITIQUE : Le composant ne doit PAS avoir été démonté !
    expect(unmountCount).toBe(0);
    expect(mountCount).toBe(1);

    // La valeur saisie par l'utilisateur doit rester STRICTEMENT identique
    const inputAfterSameUserEvent = container.querySelector('[data-testid="ticket-input"]') as HTMLInputElement;
    expect(inputAfterSameUserEvent).not.toBeNull();
    expect(inputAfterSameUserEvent.value).toBe("SAISIE_EN_COURS_TICKET_MODIFIE_777");

    // L'écran de vérification bloquant ne doit PAS s'être affiché
    expect(container.textContent).not.toContain("Vérification de la session...");

    // 3. Déclencher TOKEN_REFRESHED pour le même utilisateur
    (supabase as any).__triggerAuthChange("TOKEN_REFRESHED", {
      user: { id: "user-original-1" },
    });

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(unmountCount).toBe(0);
    expect(inputAfterSameUserEvent.value).toBe("SAISIE_EN_COURS_TICKET_MODIFIE_777");
  });

  it("2. doit maintenir l'écran et la saisie si une vérification en tâche de fond rencontre une erreur réseau", async () => {
    function TestFormNetwork() {
      const { user } = useAuth();
      const [notes, setNotes] = useState("Notes critiques en cours de frappe");
      return (
        <div>
          <span data-testid="user-status">{user ? "CONNECTÉ" : "DÉCONNECTÉ"}</span>
          <textarea
            data-testid="notes-field"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      );
    }

    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <RequireAuth>
            <TestFormNetwork />
          </RequireAuth>
        </AuthProvider>
      </MemoryRouter>
    );

    // Attendre que la session initiale soit active
    await vi.waitFor(() => {
      const statusEl = container.querySelector('[data-testid="user-status"]');
      expect(statusEl?.textContent).toBe("CONNECTÉ");
    });

    // Simuler maintenant une panne réseau temporaire sur les appels suivants
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Network connection timeout" },
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    // Émettre un événement de rafraîchissement d'onglet pour le même utilisateur
    (supabase as any).__triggerAuthChange("SIGNED_IN", {
      user: { id: "user-original-1" },
    });

    await new Promise((resolve) => setTimeout(resolve, 60));

    // L'utilisateur doit rester connecté malgré l'erreur réseau temporaire du profil
    const statusEl = container.querySelector('[data-testid="user-status"]');
    expect(statusEl?.textContent).toBe("CONNECTÉ");

    const textarea = container.querySelector('[data-testid="notes-field"]') as HTMLTextAreaElement;
    expect(textarea?.value).toBe("Notes critiques en cours de frappe");
  });

  it("3. doit démonter et purger les données en cas de changement de compte vers un autre utilisateur", async () => {
    let unmountCalled = false;

    // Configurer pour renvoyer le profil du nouvel utilisateur
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation((col, val) => {
          return {
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: val,
                nom: val === "user-bob-2" ? "Bob" : "Famanta",
                email: val === "user-bob-2" ? "bob@example.com" : "assalia@example.com",
                role: "CONTROLEUR",
                statut: "actif",
              },
              error: null,
            }),
          };
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    function SensitiveForm() {
      const { user } = useAuth();
      useEffect(() => {
        return () => {
          unmountCalled = true;
        };
      }, []);

      return (
        <div>
          <div data-testid="current-user-email">{user?.email}</div>
        </div>
      );
    }

    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <RequireAuth>
            <SensitiveForm />
          </RequireAuth>
        </AuthProvider>
      </MemoryRouter>
    );

    await vi.waitFor(() => {
      const email = container.querySelector('[data-testid="current-user-email"]');
      expect(email?.textContent).toBe("assalia@example.com");
    });

    // Changement de compte vers user-bob-2
    (supabase as any).__triggerAuthChange("SIGNED_IN", {
      user: { id: "user-bob-2" },
    });

    // Attendre la résolution du nouveau profil
    await vi.waitFor(() => {
      const email = container.querySelector('[data-testid="current-user-email"]');
      expect(email?.textContent).toBe("bob@example.com");
    });

    // L'ancien formulaire a bien été démonté pour étanchéité stricte
    expect(unmountCalled).toBe(true);
  });

  it("4. doit rediriger immédiatement vers /login en cas de déconnexion SIGNED_OUT", async () => {
    function ProtectedPage() {
      return <div data-testid="protected-content">Contenu Secret</div>;
    }

    root.render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <ProtectedPage />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<div data-testid="login-view">Écran Connexion</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="protected-content"]')).not.toBeNull();
    });

    // Émettre SIGNED_OUT
    (supabase as any).__triggerAuthChange("SIGNED_OUT", null);

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="login-view"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="protected-content"]')).toBeNull();
    });
  });
});
