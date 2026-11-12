import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle2, Loader2, ArrowLeft, Shield } from "lucide-react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

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
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    async function checkRecoveryMode() {
      if (token) {
        setIsValid(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setHasSession(true);
        setIsValid(true);
        return;
      }

      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        setHasSession(true);
        setIsValid(true);
        return;
      }

      setIsValid(false);
      setMessage({
        type: "error",
        text: "Lien de réinitialisation invalide ou expiré.",
      });
    }

    checkRecoveryMode();
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
        text: "Le mot de passe doit comporter au moins 6 caractères.",
      });
      return;
    }

    setLoading(true);

    try {
      if (token) {
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Une erreur est survenue");
        }
      } else if (hasSession) {
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) {
          throw updateError;
        }
      } else {
        throw new Error("Lien de réinitialisation invalide ou expiré");
      }

      setMessage({
        type: "success",
        text: "Mot de passe réinitialisé avec succès. Redirection vers la page de connexion...",
      });

      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message ?? "Erreur lors de la réinitialisation du mot de passe",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!isValid) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F8F5] text-[#17251C] p-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#D8E6DB] bg-white p-6 sm:p-8 shadow-sm text-center">
          <div className="h-12 w-12 rounded-xl bg-[#FEECEB] text-[#E52329] mx-auto flex items-center justify-center mb-4">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold mb-2 text-[#17251C]">Lien invalide ou expiré</h1>
          <p className="text-xs sm:text-sm text-[#556B5C] mb-6">
            Ce lien de réinitialisation a déjà été consommé ou a expiré. Veuillez formuler une nouvelle demande.
          </p>
          <Link
            to="/forgot-password"
            className="inline-flex items-center justify-center w-full h-10 bg-[#006B2D] hover:bg-[#004D20] text-white font-semibold text-xs rounded-lg transition-colors"
          >
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F8F5] text-[#17251C] p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* En-tête avec Logo officiel */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-[#004D20] p-2 flex items-center justify-center border border-[#003816] shadow-sm mb-3">
            <img
              src="/logo.png"
              alt="Logo OPEN"
              className="h-full w-full object-contain"
            />
          </div>
          <span className="text-xs font-bold text-[#006B2D] uppercase tracking-wider">
            OPEN • Sécurité
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-[#D8E6DB] p-6 sm:p-8 shadow-sm">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006B2D] hover:text-[#004D20] hover:underline mb-5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour à la connexion</span>
          </Link>

          <h1 className="text-2xl font-extrabold tracking-tight text-[#17251C] mb-1">
            Nouveau mot de passe
          </h1>
          <p className="text-xs sm:text-sm text-[#556B5C] mb-6">
            Définissez votre nouveau mot de passe sécurisé pour accéder à la plateforme.
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-bold uppercase tracking-wider text-[#17251C] mb-1.5"
              >
                Nouveau mot de passe
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#556B5C]">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  required
                  disabled={loading}
                  autoComplete="new-password"
                  className="pl-10 pr-11 h-11 bg-white border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C]/60 focus-visible:ring-2 focus-visible:ring-[#006B2D] focus-visible:border-[#006B2D] rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer" : "Afficher"}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#556B5C] hover:text-[#17251C]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-bold uppercase tracking-wider text-[#17251C] mb-1.5"
              >
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#556B5C]">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmez le nouveau mot de passe"
                  required
                  disabled={loading}
                  autoComplete="new-password"
                  className="pl-10 pr-11 h-11 bg-white border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C]/60 focus-visible:ring-2 focus-visible:ring-[#006B2D] focus-visible:border-[#006B2D] rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Masquer" : "Afficher"}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#556B5C] hover:text-[#17251C]"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {message && (
              <div
                role="alert"
                className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${
                  message.type === "success"
                    ? "bg-[#EBF7EE] border-[#86EFAC] text-[#006B2D]"
                    : "bg-[#FEECEB] border-[#F87171] text-[#E52329]"
                }`}
              >
                {message.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-[#006B2D]" />
                ) : (
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-[#E52329]" />
                )}
                <span className="leading-snug">{message.text}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold text-sm tracking-wide rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Enregistrement en cours…</span>
                </>
              ) : (
                <span>Mettre à jour mon mot de passe</span>
              )}
            </Button>
          </form>

          <div className="pt-4 mt-6 border-t border-[#E2ECE4] text-center">
            <p className="text-[11px] text-[#556B5C] flex items-center justify-center gap-1">
              <Shield className="h-3 w-3 text-[#006B2D]" />
              Connexion chiffrée de bout en bout
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
