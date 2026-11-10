import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, useNavigate, useInRouterContext, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { purgeAllAppCaches } from "@/lib/queryClient";

export type Role = "ADMIN" | "CONTROLEUR" | "AGENT";

export interface User {
  id: string;
  nom: string;
  prenom?: string;
  email: string;
  role: Role;
  statut: string;
  must_change_password?: boolean;
  derniere_connexion?: string;
  cree_le?: string;
  mis_a_jour_le?: string;
  mfa_active?: boolean;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  isLoggingOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

interface AuthProviderContentProps {
  children: React.ReactNode;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

function AuthProviderContent({ children, navigate }: AuthProviderContentProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Identifiant de génération pour invalider immédiatement les chargements précédents
  const generationRef = useRef<number>(0);
  const activeUserIdRef = useRef<string | null>(null);
  const isLoggingOutRef = useRef<boolean>(false);

  /**
   * Chargement du profil utilisateur associé à un identifiant de génération précis.
   * Si une déconnexion ou un changement de compte survient pendant la requête réseau,
   * la réponse est totalement ignorée (protection contre les réponses tardives).
   */
  const loadProfileForGeneration = useCallback(
    async (userId: string, generation: number) => {
      try {
        if (generationRef.current !== generation || activeUserIdRef.current !== userId) {
          return;
        }

        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        // Vérification post-requête : le contexte a-t-il changé pendant le vol ?
        if (generationRef.current !== generation || activeUserIdRef.current !== userId) {
          return;
        }

        if (error) {
          console.warn("Erreur chargement profil utilisateur:", error.message || error);
          if (generationRef.current === generation) {
            setLoading(false);
          }
          return;
        }

        if (!data) {
          console.warn("Utilisateur introuvable dans la table users.");
          if (generationRef.current === generation) {
            setLoading(false);
          }
          return;
        }

        // Vérification de compte suspendu ou inactif
        if (data.statut !== "actif") {
          console.warn("Compte inactif ou suspendu. Déconnexion automatique.");
          if (generationRef.current === generation) {
            setUser(null);
            setLoading(false);
            void triggerLogout();
          }
          return;
        }

        if (generationRef.current === generation) {
          setUser(data);
          setLoading(false);

          // Horodatage de la dernière connexion en arrière-plan sans bloquer
          void (async () => {
            try {
              if (generationRef.current === generation) {
                await supabase
                  .from("users")
                  .update({ derniere_connexion: new Date().toISOString() })
                  .eq("id", userId);
              }
            } catch {
              // Silencieux
            }
          })();
        }
      } catch (err: any) {
        if (generationRef.current === generation) {
          console.warn("Exception loadProfileForGeneration:", err?.message || err);
          setLoading(false);
        }
      }
    },
    [],
  );

  /**
   * Déconnexion centralisée, sécurisée et idempotente.
   * Empêche les clics répétés, purge les caches applicatifs,
   * gère les erreurs distantes et redirige via React Router.
   */
  const triggerLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);

    // 1. Invalider immédiatement toute requête de profil en cours
    generationRef.current += 1;
    activeUserIdRef.current = null;

    // 2. Mettre l'utilisateur à null pour protéger l'interface immédiatement
    setUser(null);

    // 3. Purger les caches applicatifs de données et annuler les requêtes React Query
    purgeAllAppCaches();

    // 4. Révocation de session Supabase avec vérification d'erreur et tolérance hors ligne
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn("Avertissement signOut Supabase:", error.message);
        // Fallback local si la révocation distante échoue (ex: réseau indisponible)
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch (localErr) {
          console.warn("Erreur signOut local scope:", localErr);
        }
      }
    } catch (err: any) {
      console.warn("Exception signOut Supabase (ex: hors ligne):", err?.message || err);
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Ignorer
      }
    } finally {
      setIsLoggingOut(false);
      isLoggingOutRef.current = false;
      // 5. Navigation centralisée React Router vers /login (sans rechargement complet de page)
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;

    // 1. Écouter les changements d'authentification.
    // RÈGLE ABSOLUE : Le callback onAuthStateChange doit être 100% SYNCHRONE et COURT.
    // Ne jamais await une requête Supabase ici pour ne pas bloquer le verrou interne.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id ?? null;

      if (event === "SIGNED_OUT" || !newUserId) {
        generationRef.current += 1;
        activeUserIdRef.current = null;
        setUser(null);
        setLoading(false);
        purgeAllAppCaches();
        return;
      }

      // Si le jeton est rafraîchi mais que l'utilisateur est déjà chargé, ne pas relancer
      if (event === "TOKEN_REFRESHED" && activeUserIdRef.current === newUserId) {
        return;
      }

      // Déclencher la lecture du profil en dehors du callback et de son verrou
      activeUserIdRef.current = newUserId;
      const gen = ++generationRef.current;
      setLoading(true);

      setTimeout(() => {
        if (isMounted) {
          void loadProfileForGeneration(newUserId, gen);
        }
      }, 0);
    });

    // 2. Vérification initiale de la session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!isMounted) return;
        if (error) {
          console.warn("Erreur getSession initiale:", error.message || error);
          setLoading(false);
          return;
        }

        if (!session?.user) {
          setLoading(false);
          return;
        }

        if (activeUserIdRef.current !== session.user.id) {
          activeUserIdRef.current = session.user.id;
          const gen = ++generationRef.current;
          setLoading(true);

          setTimeout(() => {
            if (isMounted) {
              void loadProfileForGeneration(session.user.id, gen);
            }
          }, 0);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn("Exception getSession:", err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForGeneration]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isLoggingOut,
      async login(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
          activeUserIdRef.current = data.user.id;
          const gen = ++generationRef.current;
          setLoading(true);
          await loadProfileForGeneration(data.user.id, gen);
        }
      },
      logout: triggerLogout,
      updateUser(updatedFields: Partial<User>) {
        setUser((prev) => (prev ? { ...prev, ...updatedFields } : null));
      },
      async refreshUser() {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          activeUserIdRef.current = session.user.id;
          const gen = ++generationRef.current;
          await loadProfileForGeneration(session.user.id, gen);
        }
      },
      async getAccessToken() {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        return session?.access_token || null;
      },
    }),
    [user, loading, isLoggingOut, loadProfileForGeneration, triggerLogout],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function AuthProviderWithRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return <AuthProviderContent navigate={navigate}>{children}</AuthProviderContent>;
}

function AuthProviderWithoutRouter({ children }: { children: React.ReactNode }) {
  const fallbackNavigate = useCallback((to: string) => {
    if (typeof window !== "undefined" && window.location) {
      window.location.href = to;
    }
  }, []);
  return <AuthProviderContent navigate={fallbackNavigate}>{children}</AuthProviderContent>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <AuthProviderWithRouter>{children}</AuthProviderWithRouter>;
  }
  return <AuthProviderWithoutRouter>{children}</AuthProviderWithoutRouter>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRole(): Role | null {
  return useAuth().user?.role ?? null;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, isLoggingOut } = useAuth();
  const inRouter = useInRouterContext();
  const location = inRouter ? useLocation() : null;
  const currentPath = location?.pathname || (typeof window !== "undefined" ? window.location.pathname : "");

  if (loading || isLoggingOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">
            {isLoggingOut ? "Déconnexion en cours..." : "Vérification de la session..."}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Si le renouvellement obligatoire du mot de passe est actif,
  // forcer la navigation vers /profil pour changer le mot de passe
  if (user.must_change_password && currentPath !== "/profil") {
    return <Navigate to="/profil" state={{ mustChangePassword: true }} replace />;
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
