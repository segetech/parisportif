import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      window.location.href = "/";
    } catch (err: any) {
      setError(err?.message ?? "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 to-slate-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold mb-4">Connexion</h1>
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
            <label className="text-sm font-medium">Mot de passe</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="admin ou agent"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Astuce: utilisez « admin » ou « agent » comme mot de passe.
            </p>
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
