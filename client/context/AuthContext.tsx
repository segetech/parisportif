import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Role = "ADMIN" | "CONTROLEUR" | "AGENT";

interface User {
  id: string;
  nom: string;
  prenom?: string;
  email: string;
  role: Role;
  statut: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Vérifier la session Supabase au chargement
    checkSession();

    // Écouter les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await loadUserData(session.user.id);
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadUserData(session.user.id);
      }
    } catch (error) {
      console.error("Erreur lors de la vérification de la session:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadUserData(userId: string) {
    try {
      // Utiliser maybeSingle() au lieu de single() pour éviter l'erreur si l'utilisateur n'existe pas
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Erreur Supabase:", error);
        throw new Error("Erreur lors de la récupération des données utilisateur.");
      }
      
      if (!data) {
        throw new Error("Utilisateur non trouvé dans la base de données. Veuillez contacter l'administrateur.");
      }
      
      // Vérifier si l'utilisateur est actif
      if (data.statut !== "actif") {
        throw new Error("Compte suspendu ou désactivé. Veuillez contacter l'administrateur.");
      }
      
      setUser(data);
      
      // Mettre à jour la dernière connexion
      try {
        await supabase
          .from("users")
          .update({ derniere_connexion: new Date().toISOString() })
          .eq("id", userId);
      } catch (updateError) {
        // Ne pas bloquer la connexion si la mise à jour échoue
        console.warn("Impossible de mettre à jour la dernière connexion:", updateError);
      }
    } catch (error: any) {
      console.error("Erreur lors du chargement des données utilisateur:", error);
      // Déconnecter l'utilisateur si ses données ne sont pas valides
      await supabase.auth.signOut();
      throw error;
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
        await supabase.auth.signOut();
        setUser(null);
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
  if (loading) return null;
  if (!user) {
    window.location.href = "/login";
    return null;
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
