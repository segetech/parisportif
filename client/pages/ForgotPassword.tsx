import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Mail, AlertCircle, CheckCircle2, Loader2, Shield } from "lucide-react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue");
      }

      setMessage({
        type: "success",
        text: data.message || "Si cet e-mail correspond à un compte actif, un lien de réinitialisation vous a été envoyé.",
      });
      setEmail("");
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message ?? "Erreur lors de l'envoi du lien",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F8F5] text-[#17251C] p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* En-tête avec Logo officiel */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-[#004D20] p-2 flex items-center justify-center border border-[#003816] shadow-sm mb-3">
            <img
              src="/logo.png"
              alt="Logo Pari Sportif"
              className="h-full w-full object-contain"
            />
          </div>
          <span className="text-xs font-bold text-[#006B2D] uppercase tracking-wider">
            Pari Sportif • Récupération
          </span>
        </div>

        {/* Formulaire */}
        <div className="bg-white rounded-2xl border border-[#D8E6DB] p-6 sm:p-8 shadow-sm">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006B2D] hover:text-[#004D20] hover:underline mb-5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour à la connexion</span>
          </Link>

          <h1 className="text-2xl font-extrabold tracking-tight text-[#17251C] mb-1">
            Mot de passe oublié
          </h1>
          <p className="text-xs sm:text-sm text-[#556B5C] mb-6 leading-relaxed">
            Saisissez votre adresse e-mail professionnelle pour recevoir un lien sécurisé à usage unique.
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-xs font-bold uppercase tracking-wider text-[#17251C] mb-1.5"
              >
                Adresse e-mail
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#556B5C]">
                  <Mail className="h-4 w-4" />
                </div>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@parisportif.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                  className="pl-10 h-11 bg-white border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C]/60 focus-visible:ring-2 focus-visible:ring-[#006B2D] focus-visible:border-[#006B2D] rounded-lg"
                />
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
                  <span>Envoi en cours…</span>
                </>
              ) : (
                <span>Envoyer le lien de réinitialisation</span>
              )}
            </Button>
          </form>

          <div className="pt-4 mt-6 border-t border-[#E2ECE4] text-center">
            <p className="text-[11px] text-[#556B5C] flex items-center justify-center gap-1">
              <Shield className="h-3 w-3 text-[#006B2D]" />
              Lien valide pendant 1 heure • Usage unique
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
