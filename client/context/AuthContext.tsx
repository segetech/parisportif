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
  avatar_url?: string;
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
  mfaRequired?: boolean;
  mfaFactorId?: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyMfaLogin?: (code: string) => Promise<void>;
  cancelMfaLogin?: () => Promise<void>;
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
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const mfaRequiredRef = useRef(false);

  // Référence synchrone immédiate sur l'utilisateur courant pour les callbacks
  const userRef = useRef<User | null>(null);

  // Identifiant de génération pour invalider immédiatement les chargements précédents
  const generationRef = useRef<number>(0);
  const activeUserIdRef = useRef<string | null>(null);
  const isLoggingOutRef = useRef<boolean>(false);

  // Déduplication des requêtes de profil en vol pour un même utilisateur et génération
  const inFlightProfilePromiseRef = useRef<{
    userId: string;
    generation: number;
    promise: Promise<void>;
  } | null>(null);

  // Horodatage du dernier update de derniere_connexion (pour éviter de spammer la base)
  const lastConnectionUpdatedRef = useRef<number>(0);

  /**
   * Chargement du profil utilisateur associé à un identifiant de génération précis.
   * Si une déconnexion ou un changement de compte survient pendant la requête réseau,
   * la réponse est totalement ignorée (protection contre les réponses tardives).
   */
  const loadProfileForGeneration = useCallback(
    async (
      userId: string,
      generation: number,
      options: { background?: boolean } = {}
    ): Promise<void> => {
      // Déduplication : si une requête identique est déjà en vol, la réutiliser
      if (
        inFlightProfilePromiseRef.current &&
        inFlightProfilePromiseRef.current.userId === userId &&
        inFlightProfilePromiseRef.current.generation === generation
      ) {
        return inFlightProfilePromiseRef.current.promise;
      }

      const fetchPromise = (async () => {
        try {
          if (
            generationRef.current !== generation ||
            activeUserIdRef.current !== userId
          ) {
            return;
          }

          const { data, error } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

          // Vérification post-requête : le contexte a-t-il changé pendant le vol ?
          if (
            generationRef.current !== generation ||
            activeUserIdRef.current !== userId
          ) {
            return;
          }

          if (error) {
            console.warn(
              "Erreur chargement profil utilisateur:",
              error.message || error
            );
            // Si c'est une vérification en arrière-plan et qu'on a déjà un utilisateur en mémoire,
            // une erreur réseau temporaire NE DOIT PAS déconnecter l'utilisateur ni vider son écran !
            if (generationRef.current === generation) {
              if (!options.background || !userRef.current) {
                setLoading(false);
              }
            }
            return;
          }

          if (!data) {
            console.warn("Utilisateur introuvable dans la table users.");
            if (generationRef.current === generation) {
              setUser(null);
              userRef.current = null;
              setLoading(false);
              void triggerLogout();
            }
            return;
          }

          // Vérification de compte suspendu ou inactif
          if (data.statut !== "actif") {
            console.warn(
              `Compte inactif ou suspendu (${data.statut}). Déconnexion automatique.`
            );
            if (generationRef.current === generation) {
              setUser(null);
              userRef.current = null;
              setLoading(false);
              void triggerLogout();
            }
            return;
          }

          if (generationRef.current === generation) {
            setUser(data);
            userRef.current = data;
            setLoading(false);

            // Horodatage de la dernière connexion throttlé (au plus une fois toutes les 15 minutes)
            const now = Date.now();
            if (now - lastConnectionUpdatedRef.current > 15 * 60 * 1000) {
              lastConnectionUpdatedRef.current = now;
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
          }
        } catch (err: any) {
          if (generationRef.current === generation) {
            console.warn(
              "Exception loadProfileForGeneration:",
              err?.message || err
            );
            if (!options.background || !userRef.current) {
              setLoading(false);
            }
          }
        } finally {
          if (
            inFlightProfilePromiseRef.current?.generation === generation &&
            inFlightProfilePromiseRef.current?.userId === userId
          ) {
            inFlightProfilePromiseRef.current = null;
          }
        }
      })();

      inFlightProfilePromiseRef.current = {
        userId,
        generation,
        promise: fetchPromise,
      };

      return fetchPromise;
    },
    []
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
    userRef.current = null;
    mfaRequiredRef.current = false;
    setMfaRequired(false);
    setMfaFactorId(null);

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
      console.warn(
        "Exception signOut Supabase (ex: hors ligne):",
        err?.message || err
      );
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

  const checkMfaRequirement = useCallback(async (): Promise<{
    required: boolean;
    factorId: string | null;
  }> => {
    try {
      const mfaApi = (supabase.auth as any)?.mfa;
      if (
        !mfaApi ||
        typeof mfaApi.getAuthenticatorAssuranceLevel !== "function" ||
        typeof mfaApi.listFactors !== "function"
      ) {
        return { required: false, factorId: null };
      }
      const { data: aal } = await mfaApi.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
        const { data: factors } = await mfaApi.listFactors();
        const verifiedTotp = (factors?.totp || []).find(
          (f: any) => f.status === "verified",
        );
        if (verifiedTotp?.id) {
          return { required: true, factorId: verifiedTotp.id };
        }
      }
    } catch {
      // Ne pas bloquer la connexion si la lecture AAL échoue
    }
    return { required: false, factorId: null };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAuthenticatedUser = async (
      userId: string,
      generation: number,
      options: { background?: boolean } = {},
    ) => {
      if (mfaRequiredRef.current) {
        if (!options.background) setLoading(false);
        return;
      }
      const hasMfaApi = Boolean(
        (supabase.auth as any)?.mfa?.getAuthenticatorAssuranceLevel,
      );
      if (hasMfaApi) {
        const mfaCheck = await checkMfaRequirement();
        if (!isMounted || generationRef.current !== generation) return;
        if (mfaCheck.required && mfaCheck.factorId) {
          mfaRequiredRef.current = true;
          setMfaRequired(true);
          setMfaFactorId(mfaCheck.factorId);
          setUser(null);
          userRef.current = null;
          setLoading(false);
          return;
        }
      }
      await loadProfileForGeneration(userId, generation, options);
    };

    // 1. Écouter les changements d'authentification.
    // RÈGLE ABSOLUE : Le callback onAuthStateChange doit être 100% SYNCHRONE et COURT.
    // Ne jamais await une requête Supabase ici pour ne pas bloquer le verrou interne.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id ?? null;

      // Déconnexion ou session absente
      if (event === "SIGNED_OUT" || !newUserId) {
        generationRef.current += 1;
        activeUserIdRef.current = null;
        userRef.current = null;
        mfaRequiredRef.current = false;
        setMfaRequired(false);
        setMfaFactorId(null);
        setUser(null);
        setLoading(false);
        purgeAllAppCaches();
        return;
      }

      // MÊME UTILISATEUR DÉJÀ CONNECTÉ
      // Événements : "SIGNED_IN" (ex: reconnexion onglet), "TOKEN_REFRESHED", "USER_UPDATED"
      if (activeUserIdRef.current === newUserId && userRef.current !== null) {
        // RÈGLE CRITIQUE : NE JAMAIS remettre loading à true pour le même utilisateur !
        // Cela évite que RequireAuth démonte les composants de page et efface les saisies en cours.
        if (event === "TOKEN_REFRESHED") {
          return; // Renouvellement silencieux
        }

        // Si c'est SIGNED_IN ou USER_UPDATED pour le même utilisateur, rafraîchir en tâche de fond
        const currentGen = generationRef.current;
        setTimeout(() => {
          if (isMounted) {
            void loadProfileForGeneration(newUserId, currentGen, {
              background: true,
            });
          }
        }, 0);
        return;
      }

      // NOUVEL UTILISATEUR OU CHANGEMENT DE COMPTE
      const isAccountSwitch =
        activeUserIdRef.current !== null &&
        activeUserIdRef.current !== newUserId;

      if (isAccountSwitch) {
        // Purger immédiatement les caches de l'ancien compte pour étanchéité stricte
        purgeAllAppCaches();
        setUser(null);
        userRef.current = null;
      }

      activeUserIdRef.current = newUserId;
      const gen = ++generationRef.current;
      setLoading(true);

      setTimeout(() => {
        if (isMounted) {
          void loadAuthenticatedUser(newUserId, gen, { background: false });
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

        if (activeUserIdRef.current !== session.user.id || !userRef.current) {
          activeUserIdRef.current = session.user.id;
          const gen = ++generationRef.current;
          setLoading(true);

          setTimeout(() => {
            if (isMounted) {
              void loadAuthenticatedUser(session.user.id, gen, {
                background: false,
              });
            }
          }, 0);
        } else {
          setLoading(false);
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
  }, [checkMfaRequirement, loadProfileForGeneration]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isLoggingOut,
      mfaRequired,
      mfaFactorId,
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

          const mfaCheck = await checkMfaRequirement();
          if (mfaCheck.required && mfaCheck.factorId) {
            mfaRequiredRef.current = true;
            setMfaRequired(true);
            setMfaFactorId(mfaCheck.factorId);
            setUser(null);
            userRef.current = null;
            setLoading(false);
            return;
          }

          mfaRequiredRef.current = false;
          setMfaRequired(false);
          setMfaFactorId(null);
          await loadProfileForGeneration(data.user.id, gen, {
            background: false,
          });
        }
      },
      async verifyMfaLogin(code: string) {
        const cleanCode = code.replace(/\D/g, "");
        if (cleanCode.length !== 6) {
          throw new Error("Veuillez saisir le code à 6 chiffres de votre application Authenticator.");
        }
        const mfaApi = (supabase.auth as any)?.mfa;
        if (!mfaApi) {
          throw new Error("Vérification Authenticator indisponible.");
        }

        let targetFactorId = mfaFactorId;
        if (!targetFactorId) {
          const { data: factors } = await mfaApi.listFactors();
          targetFactorId =
            (factors?.totp || []).find((f: any) => f.status === "verified")?.id ||
            null;
        }
        if (!targetFactorId) {
          throw new Error("Aucun facteur Authenticator vérifié trouvé.");
        }

        const { data: verifyData, error } = await mfaApi.challengeAndVerify({
          factorId: targetFactorId,
          code: cleanCode,
        });
        if (error) {
          throw new Error(error.message || "Code Authenticator invalide ou expiré.");
        }

        mfaRequiredRef.current = false;
        setMfaRequired(false);
        setMfaFactorId(null);

        const verifiedUserId =
          verifyData?.user?.id ||
          activeUserIdRef.current ||
          (await supabase.auth.getSession()).data.session?.user?.id;

        if (verifiedUserId) {
          activeUserIdRef.current = verifiedUserId;
          const gen = ++generationRef.current;
          setLoading(true);
          await loadProfileForGeneration(verifiedUserId, gen, {
            background: false,
          });
        }
      },
      async cancelMfaLogin() {
        await triggerLogout();
      },
      logout: triggerLogout,
      updateUser(updatedFields: Partial<User>) {
        setUser((prev) => {
          const next = prev ? { ...prev, ...updatedFields } : null;
          userRef.current = next;
          return next;
        });
      },
      async refreshUser() {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          activeUserIdRef.current = session.user.id;
          const gen = ++generationRef.current;
          await loadProfileForGeneration(session.user.id, gen, {
            background: true,
          });
        }
      },
      async getAccessToken() {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          return session?.access_token || null;
        } catch {
          return null;
        }
      },
    }),
    [
      user,
      loading,
      isLoggingOut,
      mfaRequired,
      mfaFactorId,
      checkMfaRequirement,
      loadProfileForGeneration,
      triggerLogout,
    ]
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
  return (
    <AuthProviderContent navigate={fallbackNavigate}>
      {children}
    </AuthProviderContent>
  );
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
  const { user, loading, isLoggingOut, mfaRequired } = useAuth();
  const inRouter = useInRouterContext();
  const location = inRouter ? useLocation() : null;
  const currentPath =
    location?.pathname ||
    (typeof window !== "undefined" ? window.location.pathname : "");

  // Écran bloquant réservé STRICTEMENT :
  // 1. Au processus de déconnexion volontaire (isLoggingOut)
  // 2. À l'initialisation quand l'utilisateur n'est pas encore connu (!user && loading)
  // Une vérification en arrière-plan d'un utilisateur déjà connu ne DOIT JAMAIS démonter le contenu.
  if (isLoggingOut || (!user && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">
            {isLoggingOut
              ? "Déconnexion en cours..."
              : "Vérification de la session..."}
          </p>
        </div>
      </div>
    );
  }

  if (mfaRequired || !user) {
    return <Navigate to="/login" replace />;
  }

  // Si le renouvellement obligatoire du mot de passe est actif,
  // forcer la navigation vers /profil pour changer le mot de passe
  if (user.must_change_password && currentPath !== "/profil") {
    return (
      <Navigate to="/profil" state={{ mustChangePassword: true }} replace />
    );
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
