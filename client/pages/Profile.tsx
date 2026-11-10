import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  User as UserIcon,
  ShieldCheck,
  KeyRound,
  Mail,
  Calendar,
  Clock,
  CheckCircle2,
  Lock,
  LogOut,
  Save,
} from "lucide-react";
import { RequireAuth } from "@/context/AuthContext";

export default function ProfilePage() {
  return (
    <RequireAuth>
      <AppLayout>
        <ProfileForm />
      </AppLayout>
    </RequireAuth>
  );
}

function ProfileForm() {
  const { user, updateUser, getAccessToken, logout } = useAuth();
  const [nom, setNom] = useState(user?.nom || "");
  const [prenom, setPrenom] = useState(user?.prenom || "");
  const [email] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const initials = `${user?.nom?.[0] || ""}${user?.prenom?.[0] || ""}`.toUpperCase() || "PS";

  const roleBadge = (() => {
    switch (user?.role) {
      case "ADMIN":
        return { label: "Administrateur", className: "bg-emerald-600 text-white" };
      case "CONTROLEUR":
        return { label: "Contrôleur", className: "bg-blue-600 text-white" };
      default:
        return { label: "Agent de saisie", className: "bg-slate-700 text-slate-100" };
    }
  })();

  async function handleProfileUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Session expirée. Veuillez vous reconnecter.");
      }

      const response = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nom: nom.trim(),
          prenom: prenom.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }

      if (data.user) {
        updateUser(data.user);
        setNom(data.user.nom || "");
        setPrenom(data.user.prenom || "");
      }

      toast.success("Profil mis à jour avec succès");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la mise à jour");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Tous les champs sont requis");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Les nouveaux mots de passe ne correspondent pas");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Le nouveau mot de passe doit contenir au moins 6 caractères");
      return;
    }

    setLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Session expirée. Veuillez vous reconnecter.");
      }

      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors du changement de mot de passe");
      }

      toast.success("Mot de passe changé avec succès");
      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du changement de mot de passe");
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="w-full flex items-center justify-center p-12">
        <div className="text-slate-400">Chargement du profil...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D8E6DB]">
        <div>
          <h1 className="text-2xl font-extrabold text-[#17251C] tracking-tight">Mon Profil</h1>
          <p className="text-xs sm:text-sm text-[#556B5C] mt-0.5">
            Gérez vos informations personnelles et paramètres de sécurité
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs px-2.5 py-1 rounded-lg border-0 ${roleBadge.className}`}>
            {roleBadge.label}
          </Badge>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#006B2D]/10 border border-[#006B2D]/20 text-[#006B2D] text-xs font-bold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Compte actif</span>
          </div>
        </div>
      </div>

      {/* Grille pleine largeur 3 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
        {/* =========================================================================
            COLONNE GAUCHE (1/3) : CARTE D'IDENTITÉ & RÉSUMÉ DU COMPTE
            ========================================================================= */}
        <div className="space-y-6">
          {/* Carte Résumé Profil */}
          <div className="rounded-2xl border border-[#D8E6DB] bg-white p-6 space-y-6 shadow-xs">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3">
                <Avatar className="h-24 w-24 rounded-2xl border-2 border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] shadow-xs">
                  <AvatarFallback className="font-extrabold text-2xl tracking-wider bg-[#004D20] text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span
                  className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-[#006B2D] border-2 border-white"
                  title="En ligne"
                />
              </div>
              <h2 className="text-lg font-bold text-[#17251C] truncate max-w-full">
                {[nom, prenom].filter(Boolean).join(" ") || "Utilisateur"}
              </h2>
              <p className="text-xs text-[#556B5C] truncate max-w-full mt-0.5">{email}</p>
              <div className="mt-3">
                <Badge className={`text-xs px-2.5 py-0.5 rounded-md border-0 ${roleBadge.className}`}>
                  {roleBadge.label}
                </Badge>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-[#D8E6DB] text-xs">
              <div className="flex items-center justify-between text-[#556B5C]">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-[#556B5C]" /> Adresse email
                </span>
                <span className="font-mono text-[#17251C] font-semibold truncate max-w-[150px]">{email}</span>
              </div>

              <div className="flex items-center justify-between text-[#556B5C]">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#556B5C]" /> Rôle attribué
                </span>
                <span className="font-bold text-[#17251C]">{user.role}</span>
              </div>

              <div className="flex items-center justify-between text-[#556B5C]">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#556B5C]" /> Dernière connexion
                </span>
                <span className="text-[#17251C] font-medium">
                  {user.derniere_connexion
                    ? new Date(user.derniere_connexion).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Récemment"}
                </span>
              </div>

              <div className="flex items-center justify-between text-[#556B5C]">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#556B5C]" /> Membre depuis
                </span>
                <span className="text-[#17251C] font-medium">
                  {user.cree_le
                    ? new Date(user.cree_le).toLocaleDateString("fr-FR", {
                        month: "long",
                        year: "numeric",
                      })
                    : "—"}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-[#D8E6DB]">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await logout();
                  } finally {
                    window.location.href = "/login";
                  }
                }}
                className="w-full text-xs font-bold text-[#E52329] border-[#E52329]/30 bg-[#E52329]/10 hover:bg-[#E52329]/20 hover:text-[#E52329] gap-2 h-10 rounded-xl"
              >
                <LogOut className="h-4 w-4" />
                <span>Se déconnecter de la session</span>
              </Button>
            </div>
          </div>
        </div>

        {/* =========================================================================
            COLONNE DROITE (2/3) : FORMULAIRES INFORMATIONS & SÉCURITÉ
            ========================================================================= */}
        <div className="lg:col-span-2 space-y-6">
          {/* Carte 1 : Informations personnelles */}
          <div className="rounded-2xl border border-[#D8E6DB] bg-white p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E6DB]">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#006B2D]/10 border border-[#006B2D]/20 text-[#006B2D] flex items-center justify-center">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#17251C]">Informations personnelles</h2>
                  <p className="text-xs text-[#556B5C]">Modifiez votre nom et prénom enregistrés</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                    Nom de famille *
                  </label>
                  <Input
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    required
                    disabled={loading}
                    placeholder="Votre nom"
                    className="h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C] rounded-xl focus:border-[#006B2D]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                    Prénom
                  </label>
                  <Input
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    disabled={loading}
                    placeholder="Votre prénom"
                    className="h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C] rounded-xl focus:border-[#006B2D]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                  Adresse e-mail (identifiant de connexion)
                </label>
                <Input
                  value={email}
                  disabled
                  className="h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#556B5C] rounded-xl cursor-not-allowed"
                />
                <p className="text-[11px] text-[#556B5C]">
                  L'adresse email est verrouillée pour des raisons de sécurité. Contactez un administrateur pour tout changement.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                    Rôle système
                  </label>
                  <Input
                    value={user.role}
                    disabled
                    className="h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#556B5C] rounded-xl cursor-not-allowed font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                    Statut du compte
                  </label>
                  <Input
                    value={
                      user.statut === "invitation_envoyee"
                        ? "Invitation envoyée"
                        : user.statut === "desactive"
                        ? "Désactivé"
                        : user.statut === "suspendu"
                        ? "Suspendu"
                        : "Actif"
                    }
                    disabled
                    className="h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#556B5C] rounded-xl cursor-not-allowed font-medium"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-[#D8E6DB]">
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-10 gap-2 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold text-xs px-5 rounded-xl shadow-xs"
                >
                  <Save className="h-4 w-4" />
                  <span>{loading ? "Enregistrement…" : "Enregistrer les modifications"}</span>
                </Button>
              </div>
            </form>
          </div>

          {/* Carte 2 : Sécurité et Mot de passe */}
          <div className="rounded-2xl border border-[#D8E6DB] bg-white p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E6DB]">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#006B2D]/10 border border-[#006B2D]/20 text-[#006B2D] flex items-center justify-center">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#17251C]">Sécurité du compte</h2>
                  <p className="text-xs text-[#556B5C]">
                    Changez votre mot de passe pour maintenir la sécurité de vos accès
                  </p>
                </div>
              </div>

              {!showChangePassword && (
                <Button
                  variant="outline"
                  onClick={() => setShowChangePassword(true)}
                  disabled={loading}
                  className="text-xs h-9 rounded-xl border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white font-bold"
                >
                  Modifier le mot de passe
                </Button>
              )}
            </div>

            {!showChangePassword ? (
              <div className="flex items-center justify-between p-4 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] text-xs">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-[#556B5C]" />
                  <div>
                    <p className="font-bold text-[#17251C]">Mot de passe de connexion</p>
                    <p className="text-[#556B5C] mt-0.5">
                      Dernière vérification active via authentification sécurisée Supabase.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[#006B2D] font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Protégé</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePasswordChange} className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                    Mot de passe actuel *
                  </label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Entrez votre mot de passe actuel"
                      required
                      disabled={loading}
                      className="h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C] rounded-xl pr-10 focus:border-[#006B2D]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#556B5C] hover:text-[#17251C] transition-colors"
                      tabIndex={-1}
                      disabled={loading}
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                      Nouveau mot de passe *
                    </label>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Au moins 6 caractères"
                        required
                        disabled={loading}
                        className="h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C] rounded-xl pr-10 focus:border-[#006B2D]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#556B5C] hover:text-[#17251C] transition-colors"
                        tabIndex={-1}
                        disabled={loading}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                      Confirmer le nouveau mot de passe *
                    </label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Répétez le nouveau mot de passe"
                        required
                        disabled={loading}
                        className="h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C] rounded-xl pr-10 focus:border-[#006B2D]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#556B5C] hover:text-[#17251C] transition-colors"
                        tabIndex={-1}
                        disabled={loading}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[#D8E6DB]">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowChangePassword(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    disabled={loading}
                    className="h-10 text-xs rounded-xl border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white font-bold"
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-10 text-xs bg-[#006B2D] hover:bg-[#004D20] text-white font-bold rounded-xl px-5 shadow-xs"
                  >
                    {loading ? "Changement…" : "Confirmer le nouveau mot de passe"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
