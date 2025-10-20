import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (!token) {
      setIsValid(false);
      setMessage({
        type: "error",
        text: "Lien de réinitialisation invalide ou expiré.",
      });
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage({
        type: "error",
        text: "Les mots de passe ne correspondent pas.",
      });
      return;
    }

    if (password.length < 6) {
      setMessage({
        type: "error",
        text: "Le mot de passe doit contenir au moins 6 caractères.",
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue");
      }

      setMessage({
        type: "success",
        text: "Mot de passe réinitialisé avec succès. Redirection en cours...",
      });

      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message ?? "Erreur lors de la réinitialisation",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!isValid) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm text-center">
          <h1 className="text-xl font-bold mb-4">Lien invalide</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Ce lien de réinitialisation est invalide ou a expiré.
          </p>
          <a
            href="/forgot-password"
            className="text-primary hover:underline text-sm"
          >
            Demander un nouveau lien
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold mb-2 text-center">
          Réinitialiser le mot de passe
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Entrez un nouveau mot de passe.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nouveau mot de passe</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Entrez un nouveau mot de passe"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez le mot de passe"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                disabled={loading}
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Minimum 6 caractères.
            </p>
          </div>

          {message && (
            <div
              className={`text-sm p-3 rounded ${
                message.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <Button className="w-full" disabled={loading}>
            {loading
              ? "Réinitialisation en cours…"
              : "Réinitialiser le mot de passe"}
          </Button>

          <a
            href="/login"
            className="block text-center text-sm text-primary hover:underline"
          >
            Retour à la connexion
          </a>
        </div>
      </form>
    </div>
  );
}
