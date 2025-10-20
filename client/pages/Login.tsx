import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { unregisterAllServiceWorkers } from "@/lib/service-worker-cleanup";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Clean up service worker on login page load
  useEffect(() => {
    unregisterAllServiceWorkers().catch(console.error);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      console.log("Login attempt:", email);
      await login(email, password);
      console.log("Login successful");
      window.location.href = "/";
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message ?? "Erreur de connexion");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm"
      >
        <div className="flex justify-center mb-6">
          <img src="/logo.png" alt="Logo" className="h-20 w-auto" />
        </div>
        <h1 className="text-xl font-bold mb-4 text-center">Connexion</h1>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Mot de passe</label>
              <a
                href="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                Mot de passe oublié?
              </a>
            </div>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Entrez votre mot de passe"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <Button className="w-full" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </Button>
        </div>
      </form>
    </div>
  );
}
