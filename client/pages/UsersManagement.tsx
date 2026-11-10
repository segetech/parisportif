import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequireAuth, RequireRole, useAuth } from "@/context/AuthContext";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useUsers } from "@/hooks/use-data-queries";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  RefreshCw,
  Pencil,
  Key,
  Mail,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { CredentialsModal } from "@/components/ui/CredentialsModal";

interface User {
  id: string;
  nom: string;
  prenom?: string;
  email: string;
  role: "ADMIN" | "CONTROLEUR" | "AGENT";
  statut: "actif" | "suspendu" | "invitation_envoyee" | "desactive";
  derniere_connexion?: string;
  cree_le: string;
}

export default function UsersManagementPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <UsersManagement />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}

function UsersManagement() {
  const { getAccessToken, user: currentUser } = useAuth();
  const { data: users = [], isLoading, isFetching, refetch } = useUsers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForPasswordReset, setUserForPasswordReset] = useState<User | null>(null);

  // Soumissions en cours
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);

  // Modal d'affichage sécurisé des identifiants
  const [credentialsModal, setCredentialsModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    credentials: {
      email: string;
      password?: string;
      role?: string;
      nom?: string;
    } | null;
  }>({
    isOpen: false,
    title: "",
    description: "",
    credentials: null,
  });

  const [formData, setFormData] = useState({
    nom: "",
    prenom: "",
    email: "",
    role: "AGENT" as "ADMIN" | "CONTROLEUR" | "AGENT",
    password: "",
  });

  const [manualResetPassword, setManualResetPassword] = useState("");

  // Calcul du nombre d'administrateurs actifs pour le garde-fou
  const activeAdminCount = useMemo(() => {
    return users.filter((u) => u.role === "ADMIN" && u.statut === "actif").length;
  }, [users]);

  function isLastActiveAdmin(user: User): boolean {
    return user.role === "ADMIN" && user.statut === "actif" && activeAdminCount <= 1;
  }

  function openDialog(user?: User) {
    if (user) {
      setEditingUser(user);
      setFormData({
        nom: user.nom,
        prenom: user.prenom || "",
        email: user.email,
        role: user.role,
        password: "",
      });
    } else {
      setEditingUser(null);
      setFormData({
        nom: "",
        prenom: "",
        email: "",
        role: "AGENT",
        password: "",
      });
    }
    setDialogOpen(true);
  }

  async function handleSaveUser() {
    if (editingUser) {
      return handleUpdateUser();
    } else {
      return handleCreateUser();
    }
  }

  async function handleUpdateUser() {
    if (!formData.nom || !formData.email) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    if (!editingUser) return;

    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expirée. Veuillez vous reconnecter.");

      // 1. Si le rôle a changé, appel à l'API Admin serveur protégée
      if (formData.role !== editingUser.role) {
        const roleRes = await fetch(`/api/admin/users/${editingUser.id}/role`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ role: formData.role }),
        });
        const roleData = await roleRes.json();
        if (!roleRes.ok) throw new Error(roleData.error || "Erreur de mise à jour du rôle");
      }

      // 2. Si l'email a changé, synchronisation auth.users + table users
      if (formData.email.toLowerCase() !== editingUser.email.toLowerCase()) {
        const emailRes = await fetch(`/api/admin/users/${editingUser.id}/email`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email: formData.email }),
        });
        const emailData = await emailRes.json();
        if (!emailRes.ok) throw new Error(emailData.error || "Erreur de synchronisation de l'email");
      }

      // 3. Mise à jour des informations d'identité (nom, prénom) via l'API Admin serveur
      if (formData.nom !== editingUser.nom || formData.prenom !== (editingUser.prenom || "")) {
        const profileRes = await fetch(`/api/admin/users/${editingUser.id}/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nom: formData.nom.trim(),
            prenom: formData.prenom.trim() || null,
          }),
        });
        const profileData = await profileRes.json();
        if (!profileRes.ok) throw new Error(profileData.error || "Erreur de mise à jour du profil");
      }

      toast.success("Utilisateur mis à jour avec succès");
      setDialogOpen(false);
      await refetch();
    } catch (error: any) {
      console.error("Erreur mise à jour utilisateur:", error);
      toast.error(error.message || "Erreur lors de la mise à jour");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateUser() {
    if (!formData.nom || !formData.email) {
      toast.error("Veuillez renseigner le nom et l'adresse email.");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expirée. Veuillez vous reconnecter.");

      // Création centralisée via l'API Admin (source unique de vérité pour le mot de passe)
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nom: formData.nom.trim(),
          prenom: formData.prenom.trim() || undefined,
          email: formData.email.trim(),
          role: formData.role,
          password: formData.password || undefined,
          sendEmail: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la création de l'utilisateur");

      setDialogOpen(false);
      await refetch();

      // Présentation immédiate des identifiants exacts dans la modal
      setCredentialsModal({
        isOpen: true,
        title: "Compte utilisateur créé avec succès",
        description:
          "Le mot de passe a été généré de manière cryptographique et sécurisée. Transmettez ces identifiants à l'utilisateur.",
        credentials: {
          email: formData.email.trim(),
          password: data.temporaryPassword,
          role: formData.role,
          nom: `${formData.prenom} ${formData.nom}`.trim(),
        },
      });
    } catch (error: any) {
      console.error("Erreur création utilisateur:", error);
      toast.error(error.message || "Erreur lors de la création");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateStatus(user: User, newStatus: User["statut"]) {
    if (user.statut === newStatus) return;

    if (isLastActiveAdmin(user) && newStatus !== "actif") {
      toast.error(
        "Action refusée : Impossible de désactiver ou suspendre le dernier administrateur actif du système."
      );
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expirée. Veuillez vous reconnecter.");

      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ statut: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de modification du statut");

      toast.success(`Statut mis à jour : ${newStatus}`);
      await refetch();
    } catch (error: any) {
      console.error("Erreur statut:", error);
      toast.error(error.message || "Erreur lors de la modification du statut");
    }
  }

  async function handleUpdateRole(user: User, newRole: User["role"]) {
    if (user.role === newRole) return;

    if (isLastActiveAdmin(user) && newRole !== "ADMIN") {
      toast.error(
        "Action refusée : Impossible de rétrograder le dernier administrateur actif du système."
      );
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expirée. Veuillez vous reconnecter.");

      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de modification du rôle");

      toast.success(`Rôle mis à jour : ${newRole}`);
      await refetch();
    } catch (error: any) {
      console.error("Erreur rôle:", error);
      toast.error(error.message || "Erreur lors de la modification du rôle");
    }
  }

  function openPasswordDialog(user: User) {
    setUserForPasswordReset(user);
    setManualResetPassword("");
    setPasswordDialogOpen(true);
  }

  async function handleResetPassword() {
    if (!userForPasswordReset) return;

    setIsResettingPassword(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expirée. Veuillez vous reconnecter.");

      const res = await fetch(
        `/api/admin/users/${userForPasswordReset.id}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            password: manualResetPassword || undefined,
            sendEmail: false,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la réinitialisation");

      setPasswordDialogOpen(false);

      setCredentialsModal({
        isOpen: true,
        title: "Mot de passe réinitialisé",
        description:
          "Le nouveau mot de passe temporaire a été appliqué. Il sera demandé à l'utilisateur de le changer dès sa prochaine connexion.",
        credentials: {
          email: userForPasswordReset.email,
          password: data.temporaryPassword,
          role: userForPasswordReset.role,
          nom: `${userForPasswordReset.prenom || ""} ${userForPasswordReset.nom}`.trim(),
        },
      });
    } catch (error: any) {
      console.error("Erreur réinitialisation mot de passe:", error);
      toast.error(error.message || "Impossible de réinitialiser le mot de passe.");
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleSendResetLink() {
    if (!userForPasswordReset) return;

    setIsSendingLink(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        userForPasswordReset.email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) throw error;

      toast.success(`Email de réinitialisation envoyé à ${userForPasswordReset.email}`);
      setPasswordDialogOpen(false);
    } catch (error: any) {
      console.error("Erreur envoi lien:", error);
      toast.error("Erreur lors de l'envoi de l'email de réinitialisation.");
    } finally {
      setIsSendingLink(false);
    }
  }

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case "actif":
        return "px-2.5 py-1 text-xs rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold";
      case "suspendu":
        return "px-2.5 py-1 text-xs rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-semibold";
      case "invitation_envoyee":
        return "px-2.5 py-1 text-xs rounded-md bg-blue-50 text-blue-800 border border-blue-300 font-semibold";
      case "desactive":
        return "px-2.5 py-1 text-xs rounded-md bg-rose-50 text-rose-800 border border-rose-300 font-semibold";
      default:
        return "px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-700 border border-slate-300 font-semibold";
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "px-2.5 py-1 text-xs rounded-md bg-purple-50 text-purple-800 border border-purple-300 font-bold tracking-wide";
      case "CONTROLEUR":
        return "px-2.5 py-1 text-xs rounded-md bg-blue-50 text-blue-800 border border-blue-300 font-bold tracking-wide";
      case "AGENT":
        return "px-2.5 py-1 text-xs rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold tracking-wide";
      default:
        return "px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-700 border border-slate-300";
    }
  };

  if (isLoading && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#006B2D]" />
        <div className="text-sm text-[#556B5C]">Chargement de la gouvernance des comptes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D8E6DB]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#17251C]">
              Gestion des Utilisateurs
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F3EC] text-[#006B2D] border border-[#C2DEC9]">
              {users.length} compte(s)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#556B5C] mt-1">
            Contrôle des accès, rôles opérationnels et sécurité des habilitations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="min-h-[44px] h-10 px-3 bg-white border-[#D8E6DB] hover:bg-[#F5F8F5] text-[#17251C]"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin text-[#006B2D]" : ""}`} />
            Actualiser
          </Button>

          <Button
            onClick={() => openDialog()}
            className="min-h-[44px] h-10 bg-[#006B2D] hover:bg-[#004D20] text-white font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nouvel utilisateur
          </Button>
        </div>
      </div>

      {/* Alerte Garde-fou Administrateur */}
      {activeAdminCount <= 1 && (
        <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-bold text-amber-800">
              Sécurité Critique : 1 seul administrateur actif détecté
            </p>
            <p className="text-amber-700">
              Le système protège automatiquement le dernier administrateur actif contre toute rétrogradation, suspension ou suppression pour garantir la continuité de gestion.
            </p>
          </div>
        </div>
      )}

      {/* =========================================================================
          VUE MOBILE (Cartes interactives pour écrans < 768px, target >= 44px)
          ========================================================================= */}
      <div className="md:hidden space-y-3">
        {users.length > 0 ? (
          users.map((u) => {
            const isProtectedAdmin = isLastActiveAdmin(u);
            return (
              <div
                key={u.id}
                className="p-4 rounded-xl border border-[#D8E6DB] bg-white space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#17251C] text-sm">
                      {u.nom} {u.prenom}
                    </div>
                    <div className="text-xs text-[#556B5C] font-mono mt-0.5">
                      {u.email}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={getRoleBadge(u.role)}>{u.role}</span>
                    <span className={getStatusBadge(u.statut)}>
                      {u.statut === "invitation_envoyee"
                        ? "Invitation en attente"
                        : u.statut === "desactive"
                        ? "Désactivé"
                        : u.statut === "suspendu"
                        ? "Suspendu"
                        : "Actif"}
                    </span>
                  </div>
                </div>

                {isProtectedAdmin && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-800 font-medium bg-amber-50 p-1.5 rounded border border-amber-200">
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                    <span>Dernier administrateur actif protégé</span>
                  </div>
                )}

                <div className="text-[11px] text-[#556B5C] flex justify-between pt-1 border-t border-[#D8E6DB]">
                  <span>Créé le {new Date(u.cree_le).toLocaleDateString("fr-FR")}</span>
                  <span>
                    Dernière conn. :{" "}
                    {u.derniere_connexion
                      ? new Date(u.derniere_connexion).toLocaleDateString("fr-FR")
                      : "Jamais"}
                  </span>
                </div>

                {/* Actions mobile à cible tactile >= 44px */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => openDialog(u)}
                    className="min-h-[44px] bg-[#F5F8F5] hover:bg-[#E2EBE4] border-[#D8E6DB] text-[#17251C] text-xs font-medium"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5 text-[#006B2D]" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openPasswordDialog(u)}
                    className="min-h-[44px] bg-[#F5F8F5] hover:bg-[#E2EBE4] border-[#D8E6DB] text-[#17251C] text-xs font-medium"
                  >
                    <Key className="h-3.5 w-3.5 mr-1.5 text-[#006B2D]" />
                    Mot de passe
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-xs text-[#556B5C] bg-white rounded-xl border border-[#D8E6DB]">
            Aucun utilisateur enregistré.
          </div>
        )}
      </div>

      {/* =========================================================================
          VUE DESKTOP (Tableau professionnel pour écrans >= 768px)
          ========================================================================= */}
      <div className="hidden md:block rounded-xl border border-[#D8E6DB] bg-white overflow-hidden shadow-xs">
        <Table>
          <TableHeader className="bg-[#F5F8F5] border-b border-[#D8E6DB]">
            <TableRow className="border-[#D8E6DB] hover:bg-transparent">
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">Nom complet</TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">Email</TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">Rôle opérationnel</TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">Statut du compte</TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">Dernière connexion</TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">Créé le</TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-[#D8E6DB]">
            {users.length > 0 ? (
              users.map((u) => {
                const isProtectedAdmin = isLastActiveAdmin(u);
                return (
                  <TableRow key={u.id} className="border-[#D8E6DB] hover:bg-[#F5F8F5]/60 transition-colors">
                    <TableCell className="font-medium text-[#17251C] text-xs py-3">
                      <div className="flex items-center gap-2">
                        <span>{u.nom} {u.prenom}</span>
                        {isProtectedAdmin && (
                          <span
                            title="Dernier administrateur actif du système (protégé)"
                            className="inline-flex p-1 rounded bg-amber-50 text-amber-700 border border-amber-200"
                          >
                            <ShieldCheck className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[#556B5C] font-mono text-xs py-3">{u.email}</TableCell>
                    <TableCell className="py-3">
                      <select
                        aria-label="Modifier le rôle"
                        disabled={isProtectedAdmin}
                        className={`${getRoleBadge(u.role)} bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                        value={u.role}
                        onChange={(e) =>
                          handleUpdateRole(u, e.target.value as "ADMIN" | "CONTROLEUR" | "AGENT")
                        }
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="CONTROLEUR">CONTROLEUR</option>
                        <option value="AGENT">AGENT</option>
                      </select>
                    </TableCell>
                    <TableCell className="py-3">
                      <select
                        aria-label="Modifier le statut"
                        disabled={isProtectedAdmin}
                        className={`${getStatusBadge(u.statut)} bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                        value={u.statut}
                        onChange={(e) =>
                          handleUpdateStatus(u, e.target.value as User["statut"])
                        }
                      >
                        <option value="actif">Actif</option>
                        <option value="suspendu">Suspendu</option>
                        <option value="invitation_envoyee">Invitation en attente</option>
                        <option value="desactive">Désactivé</option>
                      </select>
                    </TableCell>
                    <TableCell className="text-[#556B5C] text-xs py-3">
                      {u.derniere_connexion
                        ? new Date(u.derniere_connexion).toLocaleString("fr-FR")
                        : "Jamais"}
                    </TableCell>
                    <TableCell className="text-[#556B5C] text-xs py-3">
                      {new Date(u.cree_le).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-right py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(u)}
                          className="h-8 w-8 p-0 text-[#556B5C] hover:text-[#17251C] hover:bg-[#F5F8F5]"
                          title="Modifier l'utilisateur"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPasswordDialog(u)}
                          className="h-8 w-8 p-0 text-[#556B5C] hover:text-[#17251C] hover:bg-[#F5F8F5]"
                          title="Réinitialiser le mot de passe"
                        >
                          <Key className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-[#556B5C] py-10"
                >
                  Aucun utilisateur enregistré.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* =========================================================================
          DIALOG DE CRÉATION / MODIFICATION D'UTILISATEUR
          ========================================================================= */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !isSubmitting && setDialogOpen(open)}>
        <DialogContent className="max-w-md bg-white border border-[#D8E6DB] text-[#17251C] shadow-2xl p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold text-[#17251C]">
              {editingUser ? "Modifier l'utilisateur" : "Créer un nouvel utilisateur"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#556B5C]">
              {editingUser
                ? "Mettez à jour les informations du compte. Les synchronisations d'accès sont automatiques."
                : "Renseignez les coordonnées. Un mot de passe temporaire cryptographique sera généré par le serveur."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div>
              <label className="text-xs font-semibold text-[#17251C] block mb-1.5">Nom de famille *</label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Ex : Diallo"
                className="bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] text-sm h-10"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#17251C] block mb-1.5">Prénom</label>
              <Input
                value={formData.prenom}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                placeholder="Ex : Amadou"
                className="bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] text-sm h-10"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#17251C] block mb-1.5">Adresse email *</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="amadou.diallo@parisportif.com"
                className="bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] text-sm h-10 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#17251C] block mb-1.5">Rôle opérationnel *</label>
              <select
                className="w-full bg-[#F5F8F5] border border-[#D8E6DB] rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-1 focus:ring-[#006B2D] h-10"
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: e.target.value as "ADMIN" | "CONTROLEUR" | "AGENT",
                  })
                }
              >
                <option value="AGENT">Agent de saisie</option>
                <option value="CONTROLEUR">Contrôleur de conformité</option>
                <option value="ADMIN">Administrateur système</option>
              </select>
            </div>

            {/* Option mot de passe en mode création */}
            {!editingUser && (
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-[#17251C] block">
                  Mot de passe temporaire (optionnel)
                </label>
                <Input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Laisser vide pour génération automatique forte"
                  className="bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] text-xs h-10 font-mono"
                />
                <p className="text-[11px] text-[#556B5C]">
                  Si laissé vide, le serveur génère un mot de passe aléatoire cryptographique (14 caractères avec minuscules, majuscules, chiffres et symboles).
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#D8E6DB]">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setDialogOpen(false)}
                className="min-h-[44px] bg-[#F5F8F5] hover:bg-[#E2EBE4] text-[#17251C] border-[#D8E6DB] text-xs font-medium"
              >
                Annuler
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveUser}
                className="min-h-[44px] bg-[#006B2D] hover:bg-[#004D20] text-white text-xs font-semibold shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : editingUser ? (
                  "Enregistrer les modifications"
                ) : (
                  "Créer le compte utilisateur"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DIALOG DE RÉINITIALISATION DU MOT DE PASSE
          ========================================================================= */}
      <Dialog
        open={passwordDialogOpen}
        onOpenChange={(open) => !isResettingPassword && !isSendingLink && setPasswordDialogOpen(open)}
      >
        <DialogContent className="max-w-md bg-white border border-[#D8E6DB] text-[#17251C] shadow-2xl p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold text-[#17251C]">
              Réinitialiser le mot de passe
            </DialogTitle>
            <DialogDescription className="text-xs text-[#556B5C]">
              Définir un nouveau mot de passe temporaire ou envoyer un lien sécurisé par email.
            </DialogDescription>
          </DialogHeader>

          {userForPasswordReset && (
            <div className="grid gap-4 py-2">
              <div className="bg-[#F5F8F5] border border-[#D8E6DB] rounded-lg p-3 text-xs space-y-1">
                <p className="font-semibold text-[#17251C]">
                  {userForPasswordReset.nom} {userForPasswordReset.prenom}
                </p>
                <p className="font-mono text-[#556B5C]">{userForPasswordReset.email}</p>
                <p className="text-[11px] text-[#006B2D] font-medium">Rôle : {userForPasswordReset.role}</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#17251C] block">
                    Option 1 : Générer un nouveau mot de passe serveur
                  </label>
                  <Input
                    type="text"
                    value={manualResetPassword}
                    onChange={(e) => setManualResetPassword(e.target.value)}
                    placeholder="Laisser vide pour génération automatique forte"
                    className="bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] text-xs h-10 font-mono"
                  />
                  <Button
                    type="button"
                    disabled={isResettingPassword}
                    onClick={handleResetPassword}
                    className="w-full min-h-[44px] bg-[#006B2D] hover:bg-[#004D20] text-white text-xs font-semibold shadow-xs"
                  >
                    {isResettingPassword ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Génération en cours...
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4 mr-2" />
                        Appliquer ce nouveau mot de passe
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[#D8E6DB]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-[#556B5C] font-semibold">Ou</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#17251C] block">
                    Option 2 : Envoyer un lien de réinitialisation
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSendingLink}
                    onClick={handleSendResetLink}
                    className="w-full min-h-[44px] bg-[#F5F8F5] border-[#D8E6DB] hover:bg-[#E2EBE4] text-[#17251C] text-xs font-semibold"
                  >
                    {isSendingLink ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2 text-[#006B2D]" />
                        Envoyer le lien par email
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-[#D8E6DB]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPasswordDialogOpen(false)}
                  className="min-h-[44px] bg-[#F5F8F5] hover:bg-[#E2EBE4] text-[#17251C] border-[#D8E6DB] text-xs font-medium"
                >
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAL SÉCURISÉE D'AFFICHAGE ET DE COPIE DES IDENTIFIANTS
          ========================================================================= */}
      <CredentialsModal
        isOpen={credentialsModal.isOpen}
        onClose={() => setCredentialsModal((prev) => ({ ...prev, isOpen: false, credentials: null }))}
        title={credentialsModal.title}
        description={credentialsModal.description}
        credentials={credentialsModal.credentials}
      />
    </div>
  );
}
