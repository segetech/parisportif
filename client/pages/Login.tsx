import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Shield,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Redirection automatique si l'utilisateur est déjà connecté
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
      // Redirection après succès de connexion
      navigate("/");
    } catch (err: any) {
      console.error("Erreur de connexion:", err);
      const msg = err?.message || "";
      if (
        msg.includes("Invalid login credentials") ||
        msg.includes("invalid_credentials")
      ) {
        setError("Identifiants incorrects. Veuillez vérifier votre adresse e-mail et votre mot de passe.");
      } else if (msg.includes("suspendu") || msg.includes("inactif")) {
        setError("Votre compte a été suspendu ou désactivé. Veuillez contacter un administrateur.");
      } else if (msg.includes("Email not confirmed")) {
        setError("Votre adresse e-mail n'a pas encore été confirmée.");
      } else {
        setError(msg || "Une erreur est survenue lors de la connexion. Veuillez réessayer.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#F5F8F5] text-[#17251C]">
      {/* =====================================================================
          1. ESPACE DE MARQUE (Visible à gauche sur Desktop, masqué sur Mobile)
          ===================================================================== */}
      <section
        aria-label="Espace de marque Test"
        className="hidden md:flex relative md:w-5/12 lg:w-1/2 bg-[#004D20] text-white p-6 sm:p-10 lg:p-16 flex-col justify-between overflow-hidden border-r border-[#003816]"
      >
        {/* Motifs géométriques décoratifs discrets (solid lines, no gradients) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-10"
        >
          {/* Cercles fins inspirés du ballon et du logo */}
          <svg
            className="absolute -right-20 -bottom-20 w-96 h-96 text-white"
            viewBox="0 0 400 400"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="200" cy="200" r="180" strokeDasharray="6 6" />
            <circle cx="200" cy="200" r="130" />
            <circle cx="200" cy="200" r="80" strokeDasharray="4 4" />
            <path d="M 20 200 L 380 200 M 200 20 L 200 380" />
          </svg>
          <svg
            className="absolute -left-16 -top-16 w-80 h-80 text-[#FFD000]"
            viewBox="0 0 300 300"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            <circle cx="150" cy="150" r="140" />
            <polygon points="150,30 250,210 50,210" />
          </svg>
        </div>

        {/* En-tête de marque avec Logo */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#003816] border border-[#006B2D] text-[11px] font-semibold text-[#FFD000] tracking-wider uppercase mb-6 sm:mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FFD000]" />
            Application de test
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-white p-2.5 shadow-md flex items-center justify-center border border-white/20 flex-shrink-0">
              <img
                src="/logo-test.svg"
                alt="Logo Test"
                className="h-full w-full object-contain"
                loading="eager"
              />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                Test
              </h1>
              <p className="text-xs sm:text-sm text-[#FFD000] font-semibold tracking-wide">
                Application de test
              </p>
            </div>
          </div>

          <p className="text-sm sm:text-base text-white/90 font-normal leading-relaxed max-w-lg">

            Une application pour saisir vos tests, suivre les opérations
            et consulter leurs résultats.
          </p>
        </div>

        {/* Piliers institutionnels (visible sur grand écran) */}
        <div className="relative z-10 hidden sm:grid grid-cols-1 gap-3.5 my-8">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#003816]/70 border border-[#006B2D]/60">
            <div className="h-8 w-8 rounded-lg bg-[#006B2D] text-[#FFD000] flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="text-xs">
              <p className="font-semibold text-white">Historique et traçabilité</p>
              <p className="text-white/70">
                Historique des actions et suivi des transactions.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#003816]/70 border border-[#006B2D]/60">
            <div className="h-8 w-8 rounded-lg bg-[#006B2D] text-white flex items-center justify-center flex-shrink-0">
              <Activity className="h-4 w-4" />
            </div>
            <div className="text-xs">
              <p className="font-semibold text-white">Suivi des opérations</p>
              <p className="text-white/70">
                Saisie et validation selon les rôles des utilisateurs.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#003816]/70 border border-[#006B2D]/60">
            <div className="h-8 w-8 rounded-lg bg-[#006B2D] text-[#FFD000] flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="text-xs">
              <p className="font-semibold text-white">Contrôle des données</p>
              <p className="text-white/70">
                Repérage des anomalies et des données à vérifier.
              </p>
            </div>
          </div>
        </div>

        {/* Pied de l'espace de marque */}
        <div className="relative z-10 pt-4 border-t border-[#006B2D]/50 flex items-center justify-between text-[11px] text-white/75">
          <span>Contrôle et suivi des tests</span>
          <span className="font-mono text-white/60">v2.4.0 • 2026</span>
        </div>
      </section>

      {/* =====================================================================
          2. ESPACE DU FORMULAIRE DE CONNEXION (Sur surface claire)
          ===================================================================== */}
      <main
        aria-label="Formulaire d'accès sécurisé"
        className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12"
      >
        <div className="w-full max-w-md mx-auto">
          {/* Header Mobile avec Logo (visible uniquement sur petit écran < md) */}
          <div className="md:hidden flex flex-col items-center text-center mb-5">
            <div className="h-16 w-16 rounded-2xl bg-white p-2 flex items-center justify-center border border-[#D8E6DB] shadow-xs mb-3">
              <img
                src="/logo-test.svg"
                alt="Logo Test"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#004D20] text-[10px] font-bold text-[#FFD000] tracking-wider uppercase mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FFD000]" />
              Application de test
            </div>
            <h1 className="text-xl font-extrabold text-[#17251C] tracking-tight">
              Test
            </h1>
            <p className="text-xs text-[#556B5C]">
              Application de test
            </p>
          </div>

          {/* Carte du Formulaire */}
          <div className="bg-white rounded-2xl border border-[#D8E6DB] p-6 sm:p-8 shadow-sm">
            {/* Titre et accueil */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006B2D] mb-1.5">
                <Shield className="h-3.5 w-3.5 text-[#006B2D]" />
                <span>Espace d'Authentification</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#17251C]">
                Connexion
              </h2>
              <p className="text-xs sm:text-sm text-[#556B5C] mt-1">
                Saisissez vos identifiants pour accéder à votre espace de contrôle.
              </p>
            </div>

            {/* Bannière d'erreur soignée */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 p-3.5 rounded-xl bg-[#FEECEB] border border-[#F87171] text-[#E52329] flex items-start gap-2.5 text-xs sm:text-sm"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-[#E52329]" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Formulaire */}
            <form onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-5">
              {/* Champ E-mail */}
              <div>
                <label
                  htmlFor="email-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[#17251C] mb-1.5"
                >
                  Adresse e-mail
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#556B5C]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="email-input"
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="agent@example.com"
                    autoComplete="email"
                    required
                    disabled={loading}
                    className="pl-10 h-11 bg-white border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C]/60 focus-visible:ring-2 focus-visible:ring-[#006B2D] focus-visible:border-[#006B2D] transition-all rounded-lg"
                  />
                </div>
              </div>

              {/* Champ Mot de passe */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password-input"
                    className="block text-xs font-bold uppercase tracking-wider text-[#17251C]"
                  >
                    Mot de passe
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-[#006B2D] hover:text-[#004D20] hover:underline transition-colors focus:outline-none focus:ring-1 focus:ring-[#006B2D] rounded"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#556B5C]">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    id="password-input"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    className="pl-10 pr-11 h-11 bg-white border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C]/60 focus-visible:ring-2 focus-visible:ring-[#006B2D] focus-visible:border-[#006B2D] transition-all rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#556B5C] hover:text-[#17251C] transition-colors focus:outline-none focus:ring-2 focus:ring-[#006B2D] rounded-r-lg"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Bouton Principal de Soumission */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold text-sm tracking-wide rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#006B2D]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Connexion en cours…</span>
                    </>
                  ) : (
                    <>
                      <span>Se connecter</span>
                      <ArrowRight className="h-4 w-4 text-[#FFD000]" />
                    </>
                  )}
                </Button>
              </div>

              {/* Accès rapide aperçu local & consignes de sécurité */}
              <div className="pt-4 border-t border-[#E2ECE4] flex flex-col gap-2.5 text-center">
                <Link
                  to="/"
                  className="text-xs font-semibold text-[#006B2D] hover:text-[#004D20] hover:underline transition-colors"
                >
                  ← Accéder au tableau de bord (mode aperçu)
                </Link>
                <p className="text-[11px] text-[#556B5C] leading-tight">
                  Connectez-vous avec votre compte pour accéder
                  aux fonctionnalités de l’application.
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
