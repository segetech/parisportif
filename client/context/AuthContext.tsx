import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { purgeAllAppCaches } from "@/lib/queryClient";

type Role = "ADMIN" | "CONTROLEUR" | "AGENT";

interface User {
  id: string;
  nom: string;
  prenom?: string;
  email: string;
  role: Role;
  statut: string;
  derniere_connexion?: string;
  cree_le?: string;
  mis_a_jour_le?: string;
  mfa_active?: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Vérifier la session Supabase au chargement
    checkSession();

    // Écouter les changements d'authentification
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          await loadUserData(session.user.id);
        } catch (e) {
          console.warn("Erreur chargement session onAuthStateChange:", e);
        }
      } else {
        setUser(null);
        purgeAllAppCaches();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkSession() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        await loadUserData(session.user.id);
      }
    } catch (error) {
      console.warn("Erreur vérification session:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadUserData(userId: string) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("Erreur Supabase loadUserData:", error);
        return;
      }

      if (!data) {
        console.warn("Utilisateur non trouvé dans la table users.");
        return;
      }

      if (data.statut !== "actif") {
        console.warn("Compte utilisateur inactif ou suspendu.");
        setUser(null);
        purgeAllAppCaches();
        await supabase.auth.signOut();
        return;
      }

      setUser(data);

      // Mise à jour en arrière-plan sans bloquer la connexion
      (async () => {
        try {
          await supabase
            .from("users")
            .update({ derniere_connexion: new Date().toISOString() })
            .eq("id", userId);
        } catch (updateError) {
          console.warn("Impossible de mettre à jour derniere_connexion:", updateError);
        }
      })();
    } catch (error: any) {
      console.warn("Exception loadUserData:", error);
    }
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
          await loadUserData(data.user.id);
        }
      },
      async logout() {
        try {
          await Promise.race([
            supabase.auth.signOut(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout signOut")), 1500)
            ),
          ]);
        } catch (e) {
          console.warn("Erreur déconnexion supabase:", e);
        } finally {
          setUser(null);
          purgeAllAppCaches();
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
        }
      },
      updateUser(updatedFields: Partial<User>) {
        setUser((prev) => (prev ? { ...prev, ...updatedFields } : null));
      },
      async refreshUser() {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          await loadUserData(session.user.id);
        }
      },
      async getAccessToken() {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        return session?.access_token || null;
      },
    }),
    [user, loading],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRole(): Role | null {
  return useAuth().user?.role ?? null;
}

export type { Role, User };

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">Vérification de la session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function RequireRole({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !allow.includes(user.role))
    return <div className="p-6 text-center text-sm">Accès refusé</div>;
  return <>{children}</>;
}
