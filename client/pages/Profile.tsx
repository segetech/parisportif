import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
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
  const { user, logout } = useAuth();
  const [nom, setNom] = useState(user?.nom || "");
  const [prenom, setPrenom] = useState(user?.prenom || "");
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function handleProfileUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user?.id || "",
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
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user?.id || "",
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
    return <div>Chargement...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Mon Profil</h1>
        <p className="text-muted-foreground">Gérez vos informations personnelles</p>
      </div>

      {/* Informations personnelles */}
      <div className="rounded-lg border p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-4">Informations personnelles</h2>
        </div>

        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Nom</label>
              <Input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Prénom</label>
              <Input
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <Input value={email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground mt-1">
              L'email ne peut pas être changé
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Rôle</label>
              <Input value={user.role} disabled className="bg-muted" />
            </div>
            <div>
              <label className="text-sm font-medium">Statut</label>
              <Input
                value={
                  user.statut === "invitation_envoyee"
                    ? "Invitation envoyée"
                    : user.statut === "desactive"
                      ? "Désactivé"
                      : user.statut.charAt(0).toUpperCase() + user.statut.slice(1)
                }
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement…" : "Enregistrer les modifications"}
            </Button>
          </div>
        </form>
      </div>

      {/* Sécurité - Changer le mot de passe */}
      <div className="rounded-lg border p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-4">Sécurité</h2>
        </div>

        {!showChangePassword ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Mot de passe</p>
              <p className="text-xs text-muted-foreground">
                Changez votre mot de passe régulièrement pour sécuriser votre compte
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowChangePassword(true)}
              disabled={loading}
            >
              Changer le mot de passe
            </Button>
          </div>
        ) : (
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Mot de passe actuel</label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Entrez votre mot de passe actuel"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  disabled={loading}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Nouveau mot de passe</label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Entrez un nouveau mot de passe"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  disabled={loading}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 6 caractères
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Confirmer le nouveau mot de passe</label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmez le nouveau mot de passe"
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
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowChangePassword(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                disabled={loading}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Changement…" : "Changer le mot de passe"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Déconnexion */}
      <div className="rounded-lg border p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-4">Autres actions</h2>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            logout();
            window.location.href = "/login";
          }}
        >
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
