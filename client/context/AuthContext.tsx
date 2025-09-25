import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api, { Role, User } from "@/data/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

const LS_KEY = "ps.auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as User;
      setUser(parsed);
    }
    setLoading(false);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(email: string, password: string) {
        const u = await api.auth.login(email, password);
        setUser(u);
        localStorage.setItem(LS_KEY, JSON.stringify(u));
      },
      logout() {
        setUser(null);
        localStorage.removeItem(LS_KEY);
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
