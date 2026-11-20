import { RecordForm } from "@/components/common/RecordForm";
import { useFormDraft } from "@/hooks/use-form-draft";
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
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";
import { toast } from "sonner";
import {
  useUsers,
  useLoginHistory,
  useAuditLogs,
  useRolePermissions,
} from "@/hooks/use-data-queries";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  summarizeAuditDetails,
  formatUserAgentLabel,
} from "@/lib/audit-format";
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
} from "@/lib/rbac";
import api, { type Role } from "@/data/api";
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
  Users,
  Activity,
  Clock,
  Search,
  History,
  Eye,
  Laptop,
  Lock,
} from "lucide-react";

dayjs.extend(relativeTime);
dayjs.locale("fr");
import { CredentialsModal } from "@/components/ui/CredentialsModal";
import { AdminPasswordChoice } from "@/components/common/AdminPasswordChoice";
import {
  buildAdminPasswordRequest,
  type AdminPasswordMode,
  type AdminPasswordSource,
} from "@shared/admin-password";

interface User {
  id: string;
  nom: string;
  prenom?: string;
  email: string;
  role: "ADMIN" | "CONTROLEUR" | "AGENT";
  statut: "actif" | "suspendu" | "invitation_envoyee" | "desactive";
  derniere_connexion?: string;
  cree_le: string;
  mis_a_jour_le?: string;
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
  const {
    data: loginHistory = [],
    isFetching: fetchingLogins,
    refetch: refetchLogins,
  } = useLoginHistory();
  const {
    data: auditLogs = [],
    isFetching: fetchingAudit,
    refetch: refetchAudit,
  } = useAuditLogs();
  const { data: rolePerms } = useRolePermissions();

  const [activeTab, setActiveTab] = useState<"accounts" | "logins" | "audit">(
    "accounts",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [inspectedUser, setInspectedUser] = useState<User | null>(null);
  const [savingPermKey, setSavingPermKey] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForPasswordReset, setUserForPasswordReset] = useState<User | null>(
    null,
  );

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
      passwordSource?: AdminPasswordSource;
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
    statut: "actif" as User["statut"],
    password: "",
  });

  const {
    hasDraft,
    savedAtFormatted,
    hasConflict,
    saveStatus,
    restoreDraft,
    discardDraft,
    clearDraftOnSuccess,
    notifyChange,
  } = useFormDraft(formData, setFormData, {
    entityType: "users",
    recordId: editingUser?.id || "new",
    serverUpdatedAt: editingUser?.mis_a_jour_le || editingUser?.cree_le,
  });

  const [manualResetPassword, setManualResetPassword] = useState("");
  const [createPasswordMode, setCreatePasswordMode] =
    useState<AdminPasswordMode>("manual");
  const [resetPasswordMode, setResetPasswordMode] =
    useState<AdminPasswordMode>("manual");

  // Calcul du nombre d'administrateurs actifs pour le garde-fou
  const activeAdminCount = useMemo(() => {
    return users.filter((u) => u.role === "ADMIN" && u.statut === "actif")
      .length;
  }, [users]);

  function isLastActiveAdmin(user: User): boolean {
    return (
      user.role === "ADMIN" && user.statut === "actif" && activeAdminCount <= 1
    );
  }

  function openDialog(user?: User) {
    setCreatePasswordMode("manual");
    if (user) {
      setEditingUser(user);
      setFormData({
        nom: user.nom,
        prenom: user.prenom || "",
        email: user.email,
        role: user.role,
        statut: user.statut,
        password: "",
      });
    } else {
      setEditingUser(null);
      setFormData({
        nom: "",
        prenom: "",
        email: "",
        role: "AGENT",
        statut: "actif",
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
      if (!token)
        throw new Error("Session expirée. Veuillez vous reconnecter.");

      if (
        isLastActiveAdmin(editingUser) &&
        (formData.role !== "ADMIN" || formData.statut !== "actif")
      ) {
        throw new Error(
          "Impossible de suspendre ou rétrograder le dernier administrateur actif.",
        );
      }
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
        if (!roleRes.ok)
          throw new Error(roleData.error || "Erreur de mise à jour du rôle");
      }

      // 2. Si l'email a changé, synchronisation auth.users + table users
      if (formData.email.toLowerCase() !== editingUser.email.toLowerCase()) {
        const emailRes = await fetch(
          `/api/admin/users/${editingUser.id}/email`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ email: formData.email }),
          },
        );
        const emailData = await emailRes.json();
        if (!emailRes.ok)
          throw new Error(
            emailData.error || "Erreur de synchronisation de l'email",
          );
      }

      // 3. Mise à jour des informations d'identité (nom, prénom) via l'API Admin serveur
      if (
        formData.nom !== editingUser.nom ||
        formData.prenom !== (editingUser.prenom || "")
      ) {
        const profileRes = await fetch(
          `/api/admin/users/${editingUser.id}/profile`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              nom: formData.nom.trim(),
              prenom: formData.prenom.trim() || null,
            }),
          },
        );
        const profileData = await profileRes.json();
        if (!profileRes.ok)
          throw new Error(
            profileData.error || "Erreur de mise à jour du profil",
          );
      }

      if (formData.statut !== editingUser.statut) {
        const response = await fetch(
          `/api/admin/users/${editingUser.id}/status`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ statut: formData.statut }),
          },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Erreur de modification du statut");
      }
      toast.success("Utilisateur mis à jour avec succès");
      clearDraftOnSuccess();
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
    if (isSubmitting) return;
    if (!formData.nom || !formData.email) {
      toast.error("Veuillez renseigner le nom et l'adresse email.");
      return;
    }

    setIsSubmitting(true);
    try {
      const passwordRequest = buildAdminPasswordRequest(
        createPasswordMode,
        formData.password,
      );
      const token = await getAccessToken();
      if (!token)
        throw new Error("Session expirée. Veuillez vous reconnecter.");

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
          ...passwordRequest,
          sendEmail: false,
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error || "Erreur lors de la création de l'utilisateur",
        );

      clearDraftOnSuccess();
      setDialogOpen(false);
      // Présentation immédiate des identifiants exacts dans la modal
      setCredentialsModal({
        isOpen: true,
        title: "Compte utilisateur créé avec succès",
        description:
          "Le compte est créé. Transmettez le mot de passe effectivement enregistré à l’utilisateur.",
        credentials: {
          email: formData.email.trim(),
          password: data.temporaryPassword,
          passwordSource: data.passwordSource,
          role: formData.role,
          nom: `${formData.prenom} ${formData.nom}`.trim(),
        },
      });
      setFormData((previous) => ({ ...previous, password: "" }));
      void refetch();
    } catch (error: any) {
      console.error("Erreur création utilisateur:", error);
      toast.error(error.message || "Erreur lors de la création");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openPasswordDialog(user: User) {
    setUserForPasswordReset(user);
    setManualResetPassword("");
    setResetPasswordMode("manual");
    setPasswordDialogOpen(true);
  }

  async function handleResetPassword() {
    if (!userForPasswordReset || isResettingPassword || isSendingLink) return;

    setIsResettingPassword(true);
    try {
      const passwordRequest = buildAdminPasswordRequest(
        resetPasswordMode,
        manualResetPassword,
      );
      const token = await getAccessToken();
      if (!token)
        throw new Error("Session expirée. Veuillez vous reconnecter.");

      const res = await fetch(
        `/api/admin/users/${userForPasswordReset.id}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...passwordRequest,
            sendEmail: false,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Erreur lors de la réinitialisation");

      setPasswordDialogOpen(false);

      setCredentialsModal({
        isOpen: true,
        title: "Mot de passe réinitialisé",
        description:
          "Le nouveau mot de passe temporaire a été appliqué. Il sera demandé à l'utilisateur de le changer dès sa prochaine connexion.",
        credentials: {
          email: userForPasswordReset.email,
          password: data.temporaryPassword,
          passwordSource: data.passwordSource,
          role: userForPasswordReset.role,
          nom: `${userForPasswordReset.prenom || ""} ${userForPasswordReset.nom}`.trim(),
        },
      });
      setManualResetPassword("");
    } catch (error: any) {
      console.error("Erreur réinitialisation mot de passe:", error);
      toast.error(
        error.message || "Impossible de réinitialiser le mot de passe.",
      );
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleSendResetLink() {
    if (!userForPasswordReset || isSendingLink || isResettingPassword) return;

    setIsSendingLink(true);
    try {
      const publicOrigin =
        typeof window !== "undefined" &&
        !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
          ? window.location.origin
          : "https://open.businessmoresarl.com";
      const { error } = await supabase.auth.resetPasswordForEmail(
        userForPasswordReset.email,
        {
          redirectTo: `${publicOrigin}/reset-password`,
        },
      );

      if (error) throw error;

      toast.success(
        `Email de réinitialisation envoyé à ${userForPasswordReset.email}`,
      );
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

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      map[u.id] = [u.nom, u.prenom].filter(Boolean).join(" ") || u.email;
    }
    return map;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (statusFilter !== "ALL" && u.statut !== statusFilter) return false;
      if (!q) return true;
      const fullName = `${u.nom || ""} ${u.prenom || ""}`.toLowerCase();
      return (
        fullName.includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const filteredLogins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return loginHistory.filter((entry) => {
      if (roleFilter !== "ALL" && entry.user_role !== roleFilter) return false;
      if (!q) return true;
      return (
        (entry.user_name || "").toLowerCase().includes(q) ||
        (entry.user_email || "").toLowerCase().includes(q) ||
        formatUserAgentLabel(entry.user_agent).toLowerCase().includes(q)
      );
    });
  }, [loginHistory, searchQuery, roleFilter]);

  const filteredAudit = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (roleFilter !== "ALL" && entry.user?.role !== roleFilter) return false;
      if (!q) return true;
      const summary = summarizeAuditDetails(entry.details, userNameById).toLowerCase();
      return (
        (entry.user?.email || "").toLowerCase().includes(q) ||
        (entry.action || "").toLowerCase().includes(q) ||
        (entry.entity || "").toLowerCase().includes(q) ||
        summary.includes(q)
      );
    });
  }, [auditLogs, searchQuery, roleFilter, userNameById]);

  const statsSummary = useMemo(() => {
    const active = users.filter((u) => u.statut === "actif").length;
    const admins = users.filter((u) => u.role === "ADMIN").length;
    const controleurs = users.filter((u) => u.role === "CONTROLEUR").length;
    const agents = users.filter((u) => u.role === "AGENT").length;
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    const logins24h = loginHistory.filter(
      (l) => new Date(l.logged_in_at).getTime() >= cutoff24h,
    ).length;
    return { active, admins, controleurs, agents, logins24h };
  }, [users, loginHistory]);

  async function handleTogglePermission(role: Role, perm: Permission) {
    if (!rolePerms || role === "ADMIN") return;
    const key = `${role}:${perm}`;
    setSavingPermKey(key);
    try {
      const current = rolePerms[role] || [];
      const next = current.includes(perm)
        ? current.filter((p) => p !== perm)
        : [...current, perm];
      await api.roles.setPermissions(role, next);
      await queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      toast.success("Permissions mises à jour");
    } catch (err: any) {
      toast.error(err?.message || "Impossible de modifier les permissions");
    } finally {
      setSavingPermKey(null);
    }
  }

  function refreshAll() {
    void refetch();
    void refetchLogins();
    void refetchAudit();
  }

  const anyFetching = isFetching || fetchingLogins || fetchingAudit;

  if (isLoading && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#006B2D]" />
        <div className="text-sm text-[#556B5C]">
          Chargement de la gouvernance des comptes...
        </div>
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
            Gouvernance des comptes, historique des connexions, audit d&apos;activité et permissions RBAC
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            className="min-h-[44px] h-10 px-3 bg-white border-[#D8E6DB] hover:bg-[#F5F8F5] text-[#17251C]"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${anyFetching ? "animate-spin text-[#006B2D]" : ""}`}
            />
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

      {/* Bento KPI Grid (4 cartes solides) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#556B5C]">
            <span>Comptes enregistrés</span>
            <Users className="h-4 w-4 text-[#006B2D]" />
          </div>
          <div className="text-2xl font-bold text-[#17251C] tabular-nums">
            {users.length}
          </div>
          <p className="text-[11px] text-[#556B5C]">
            {statsSummary.admins} Admin · {statsSummary.controleurs} Contrôleur · {statsSummary.agents} Agent
          </p>
        </div>

        <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#556B5C]">
            <span>Comptes actifs</span>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-[#17251C] tabular-nums">
            {statsSummary.active}
          </div>
          <p className="text-[11px] text-[#556B5C]">
            {users.length - statsSummary.active} suspendu(s) ou en attente
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab("logins")}
          className="text-left rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-1.5 hover:border-[#006B2D] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#556B5C]">
            <span>Connexions (24h)</span>
            <Clock className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-[#17251C] tabular-nums">
            {statsSummary.logins24h}
          </div>
          <p className="text-[11px] text-[#006B2D] font-medium">
            {loginHistory.length} session(s) enregistrée(s) →
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className="text-left rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-1.5 hover:border-[#006B2D] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#556B5C]">
            <span>Événements d&apos;audit</span>
            <Activity className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-[#17251C] tabular-nums">
            {auditLogs.length}
          </div>
          <p className="text-[11px] text-[#006B2D] font-medium">
            Voir le journal &amp; permissions →
          </p>
        </button>
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
              Le système protège automatiquement le dernier administrateur actif
              contre toute rétrogradation, suspension ou suppression pour
              garantir la continuité de gestion.
            </p>
          </div>
        </div>
      )}

      {/* Barre de recherche & filtres dynamiques */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-[#D8E6DB] bg-white p-3 shadow-xs">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-[#556B5C] absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, email, action ou appareil..."
            className="pl-9 h-9 bg-[#F5F8F5] border-[#D8E6DB] text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["ALL", "ADMIN", "CONTROLEUR", "AGENT"] as const).map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={roleFilter === r ? "default" : "outline"}
              onClick={() => setRoleFilter(r)}
              className={
                roleFilter === r
                  ? "h-8 text-xs bg-[#006B2D] hover:bg-[#004D20] text-white"
                  : "h-8 text-xs border-[#D8E6DB] text-[#17251C]"
              }
            >
              {r === "ALL" ? "Tous les rôles" : r}
            </Button>
          ))}
          {activeTab === "accounts" && (
            <Button
              type="button"
              size="sm"
              variant={statusFilter === "actif" ? "default" : "outline"}
              onClick={() =>
                setStatusFilter(statusFilter === "actif" ? "ALL" : "actif")
              }
              className={
                statusFilter === "actif"
                  ? "h-8 text-xs bg-emerald-700 text-white"
                  : "h-8 text-xs border-[#D8E6DB] text-[#556B5C]"
              }
            >
              Actifs uniquement
            </Button>
          )}
        </div>
      </div>

      {/* Navigation par onglets de gouvernance */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "accounts" | "logins" | "audit")}
        className="space-y-4"
      >
        <TabsList className="bg-white border border-[#D8E6DB] p-1 h-auto flex-wrap">
          <TabsTrigger
            value="accounts"
            className="gap-1.5 data-[state=active]:bg-[#006B2D] data-[state=active]:text-white"
          >
            <Users className="h-3.5 w-3.5" />
            Comptes &amp; Accès ({filteredUsers.length})
          </TabsTrigger>
          <TabsTrigger
            value="logins"
            className="gap-1.5 data-[state=active]:bg-[#006B2D] data-[state=active]:text-white"
          >
            <History className="h-3.5 w-3.5" />
            Historique des connexions ({filteredLogins.length})
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            className="gap-1.5 data-[state=active]:bg-[#006B2D] data-[state=active]:text-white"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Audit &amp; Permissions ({filteredAudit.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4 mt-0">
      {/* =========================================================================
          VUE MOBILE (Cartes interactives pour écrans < 768px, target >= 44px)
          ========================================================================= */}
      <div className="md:hidden space-y-3">
        {filteredUsers.length > 0 ? (
          filteredUsers.map((u) => {
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
                  <span>
                    Créé le {new Date(u.cree_le).toLocaleDateString("fr-FR")}
                  </span>
                  <span>
                    Dernière conn. :{" "}
                    {u.derniere_connexion
                      ? new Date(u.derniere_connexion).toLocaleDateString(
                          "fr-FR",
                        )
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
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">
                Nom complet
              </TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">
                Email
              </TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">
                Rôle opérationnel
              </TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">
                Statut du compte
              </TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">
                Dernière connexion
              </TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5">
                Créé le
              </TableHead>
              <TableHead className="text-[#556B5C] font-semibold text-xs py-3.5 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-[#D8E6DB]">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((u) => {
                const isProtectedAdmin = isLastActiveAdmin(u);
                return (
                  <TableRow
                    key={u.id}
                    className="border-[#D8E6DB] hover:bg-[#F5F8F5]/60 transition-colors"
                  >
                    <TableCell className="font-medium text-[#17251C] text-xs py-3">
                      <div className="flex items-center gap-2">
                        <span>
                          {u.nom} {u.prenom}
                        </span>
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
                    <TableCell className="text-[#556B5C] font-mono text-xs py-3">
                      {u.email}
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={getRoleBadge(u.role)}>{u.role}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={getStatusBadge(u.statut)}>
                        {u.statut === "invitation_envoyee"
                          ? "Invitation en attente"
                          : u.statut === "actif"
                            ? "Actif"
                            : u.statut === "suspendu"
                              ? "Suspendu"
                              : "Désactivé"}
                      </span>
                    </TableCell>
                    <TableCell className="text-[#556B5C] text-xs py-3">
                      {u.derniere_connexion ? (
                        <div>
                          <div className="font-medium text-[#17251C]">
                            {dayjs(u.derniere_connexion).fromNow()}
                          </div>
                          <div className="text-[11px] text-[#556B5C]">
                            {new Date(u.derniere_connexion).toLocaleString("fr-FR")}
                          </div>
                        </div>
                      ) : (
                        "Jamais"
                      )}
                    </TableCell>
                    <TableCell className="text-[#556B5C] text-xs py-3">
                      {new Date(u.cree_le).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-right py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectedUser(u)}
                          className="h-8 px-2 text-xs text-[#006B2D] hover:bg-[#E8F3EC]"
                          title="Voir connexions et audit"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Activité
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(u)}
                          className="h-8 w-8 p-0 text-[#556B5C] hover:text-[#17251C] hover:bg-[#F5F8F5]"
                          title="Consulter l’utilisateur"
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
                  Aucun utilisateur ne correspond aux filtres.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
        </TabsContent>

        {/* ONGLET 2 : HISTORIQUE DES CONNEXIONS */}
        <TabsContent value="logins" className="mt-0">
          <div className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs overflow-hidden">
            <Table>
              <TableHeader className="bg-[#F5F8F5] border-b border-[#D8E6DB]">
                <TableRow>
                  <TableHead className="text-[#556B5C] font-semibold text-xs py-3">
                    Utilisateur
                  </TableHead>
                  <TableHead className="text-[#556B5C] font-semibold text-xs py-3">
                    Rôle
                  </TableHead>
                  <TableHead className="text-[#556B5C] font-semibold text-xs py-3">
                    Date &amp; Heure
                  </TableHead>
                  <TableHead className="text-[#556B5C] font-semibold text-xs py-3">
                    Appareil / Navigateur
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogins.length > 0 ? (
                  filteredLogins.slice(0, 60).map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="border-b border-[#E2ECE4] hover:bg-[#F5F8F5]/60"
                    >
                      <TableCell className="py-3">
                        <div className="font-semibold text-sm text-[#17251C]">
                          {entry.user_name || userNameById[entry.user_id] || "Utilisateur"}
                        </div>
                        <div className="text-xs text-[#556B5C] font-mono">
                          {entry.user_email || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className={getRoleBadge(entry.user_role || "")}>
                          {entry.user_role || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-xs">
                        <div className="font-medium text-[#17251C]">
                          {dayjs(entry.logged_in_at).fromNow()}
                        </div>
                        <div className="text-[#556B5C]">
                          {new Date(entry.logged_in_at).toLocaleString("fr-FR")}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-[#556B5C]">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#F5F8F5] border border-[#D8E6DB] text-[#17251C]">
                          <Laptop className="h-3.5 w-3.5 text-[#006B2D]" />
                          {formatUserAgentLabel(entry.user_agent)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-sm text-[#556B5C] py-10"
                    >
                      Aucune connexion enregistrée pour cette sélection.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ONGLET 3 : JOURNAL D'AUDIT & PERMISSIONS RBAC */}
        <TabsContent value="audit" className="space-y-6 mt-0">
          {rolePerms && (
            <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-3">
              <div>
                <h2 className="text-sm font-bold text-[#17251C] flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#006B2D]" />
                  Matrice des Habilitations (Admin décide)
                </h2>
                <p className="text-xs text-[#556B5C]">
                  Activez ou retirez les droits des rôles Contrôleur et Agent (appliqué immédiatement en base).
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#F5F8F5]">
                    <TableRow>
                      <TableHead className="text-xs font-semibold text-[#556B5C]">
                        Permission
                      </TableHead>
                      <TableHead className="text-center text-xs font-semibold text-[#556B5C]">
                        ADMIN
                      </TableHead>
                      <TableHead className="text-center text-xs font-semibold text-[#556B5C]">
                        CONTROLEUR
                      </TableHead>
                      <TableHead className="text-center text-xs font-semibold text-[#556B5C]">
                        AGENT
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ALL_PERMISSIONS.map((perm) => (
                      <TableRow key={perm} className="border-b border-[#E2ECE4]">
                        <TableCell className="text-xs font-medium text-[#17251C] py-2">
                          {PERMISSION_LABELS[perm]}
                        </TableCell>
                        <TableCell className="text-center py-2">
                          <Badge variant="secondary" className="text-[10px]">
                            Toujours actif
                          </Badge>
                        </TableCell>
                        {(["CONTROLEUR", "AGENT"] as const).map((r) => {
                          const enabled = Boolean(rolePerms[r]?.includes(perm));
                          const busy = savingPermKey === `${r}:${perm}`;
                          return (
                            <TableCell key={r} className="text-center py-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={enabled ? "default" : "outline"}
                                disabled={busy}
                                onClick={() => void handleTogglePermission(r, perm)}
                                className={
                                  enabled
                                    ? "h-7 px-2.5 text-[11px] bg-[#006B2D] hover:bg-[#004D20] text-white"
                                    : "h-7 px-2.5 text-[11px] border-[#D8E6DB] text-[#556B5C]"
                                }
                              >
                                {enabled ? "Autorisé" : "Refusé"}
                              </Button>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-[#D8E6DB] bg-[#F5F8F5] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#17251C]">
                Journal d&apos;audit récent ({filteredAudit.length})
              </h2>
              <a
                href="/journal"
                className="text-xs font-semibold text-[#006B2D] hover:underline"
              >
                Ouvrir le journal complet →
              </a>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#D8E6DB]">
                  <TableHead className="text-xs font-semibold text-[#556B5C]">
                    Date
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-[#556B5C]">
                    Utilisateur
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-[#556B5C]">
                    Détails lisibles
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAudit.length > 0 ? (
                  filteredAudit.slice(0, 40).map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="border-b border-[#E2ECE4] hover:bg-[#F5F8F5]/60"
                    >
                      <TableCell className="text-xs text-[#556B5C] whitespace-nowrap py-2.5">
                        <div className="font-medium text-[#17251C]">
                          {dayjs(entry.ts).fromNow()}
                        </div>
                        <div className="text-[11px]">
                          {new Date(entry.ts).toLocaleString("fr-FR")}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs py-2.5">
                        <div className="font-medium text-[#17251C]">
                          {entry.user?.email || "Système"}
                        </div>
                        {entry.user?.role && (
                          <span className="text-[11px] text-[#556B5C]">
                            {entry.user.role}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-[#17251C] py-2.5">
                        {summarizeAuditDetails(entry.details, userNameById) ||
                          `${entry.action} — ${entry.entity}`}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-sm text-[#556B5C] py-8"
                    >
                      Aucun événement d&apos;audit pour cette sélection.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL INSPECTEUR D'ACTIVITÉ UTILISATEUR */}
      <Dialog
        open={!!inspectedUser}
        onOpenChange={(open) => {
          if (!open) setInspectedUser(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto bg-white border border-[#D8E6DB] text-[#17251C]">
          {inspectedUser && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-[#17251C]">
                  <span>
                    {inspectedUser.nom} {inspectedUser.prenom}
                  </span>
                  <span className={getRoleBadge(inspectedUser.role)}>
                    {inspectedUser.role}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-[#556B5C]">
                  {inspectedUser.email} · Créé le{" "}
                  {new Date(inspectedUser.cree_le).toLocaleDateString("fr-FR")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div className="rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] p-3.5 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#556B5C] flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-[#006B2D]" />
                    Dernières connexions
                  </h3>
                  {loginHistory.filter((l) => l.user_id === inspectedUser.id)
                    .length > 0 ? (
                    <div className="space-y-1.5">
                      {loginHistory
                        .filter((l) => l.user_id === inspectedUser.id)
                        .slice(0, 6)
                        .map((l) => (
                          <div
                            key={l.id}
                            className="flex items-center justify-between text-xs bg-white rounded-lg border border-[#D8E6DB] px-3 py-2"
                          >
                            <span className="font-medium text-[#17251C]">
                              {new Date(l.logged_in_at).toLocaleString("fr-FR")} (
                              {dayjs(l.logged_in_at).fromNow()})
                            </span>
                            <span className="text-[#556B5C]">
                              {formatUserAgentLabel(l.user_agent)}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#556B5C]">
                      Aucune session enregistrée pour cet utilisateur.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] p-3.5 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#556B5C] flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-[#006B2D]" />
                    Actions d&apos;audit récentes
                  </h3>
                  {auditLogs.filter(
                    (a) =>
                      a.user?.id === inspectedUser.id ||
                      a.user?.email === inspectedUser.email,
                  ).length > 0 ? (
                    <div className="space-y-1.5">
                      {auditLogs
                        .filter(
                          (a) =>
                            a.user?.id === inspectedUser.id ||
                            a.user?.email === inspectedUser.email,
                        )
                        .slice(0, 8)
                        .map((a) => (
                          <div
                            key={a.id}
                            className="text-xs bg-white rounded-lg border border-[#D8E6DB] px-3 py-2 space-y-0.5"
                          >
                            <div className="font-medium text-[#17251C]">
                              {summarizeAuditDetails(a.details, userNameById) ||
                                `${a.action} — ${a.entity}`}
                            </div>
                            <div className="text-[11px] text-[#556B5C]">
                              {new Date(a.ts).toLocaleString("fr-FR")} (
                              {dayjs(a.ts).fromNow()})
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#556B5C]">
                      Aucune action d&apos;audit enregistrée pour ce compte.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DIALOG DE CRÉATION / MODIFICATION D'UTILISATEUR
          ========================================================================= */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (isSubmitting) return;
          setDialogOpen(open);
          if (!open) setFormData((previous) => ({ ...previous, password: "" }));
        }}
      >
        <DialogContent className="max-w-md bg-white border border-[#D8E6DB] text-[#17251C] shadow-2xl p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold text-[#17251C]">
              {editingUser
                ? "Consulter l’utilisateur"
                : "Créer un nouvel utilisateur"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#556B5C]">
              {editingUser
                ? "Consultez les informations du compte. Utilisez Modifier pour les mettre à jour."
                : "Renseignez les coordonnées et choisissez comment définir le mot de passe initial."}
            </DialogDescription>
          </DialogHeader>

          <RecordForm
            key={`${dialogOpen}-${editingUser?.id || "new"}`}
            existing={!!editingUser}
            onSave={handleSaveUser}
            onClose={() => setDialogOpen(false)}
            onRestore={() => openDialog(editingUser!)}
            createLabel="Créer le compte utilisateur"
            busy={isSubmitting}
            hasDraft={hasDraft}
            draftTime={savedAtFormatted}
            hasConflict={hasConflict}
            onRestoreDraft={restoreDraft}
            onDiscardDraft={discardDraft}
            draftSaveStatus={saveStatus}
          >
            <div className="grid gap-4 py-2">
              <div>
                <label className="text-xs font-semibold text-[#17251C] block mb-1.5">
                  Nom de famille *
                </label>
                <Input
                  value={formData.nom}
                  onChange={(e) =>
                    setFormData({ ...formData, nom: e.target.value })
                  }
                  placeholder="Ex : Diallo"
                  className="bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] text-sm h-10"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#17251C] block mb-1.5">
                  Prénom
                </label>
                <Input
                  value={formData.prenom}
                  onChange={(e) =>
                    setFormData({ ...formData, prenom: e.target.value })
                  }
                  placeholder="Ex : Amadou"
                  className="bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] text-sm h-10"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#17251C] block mb-1.5">
                  Adresse email *
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="amadou.diallo@example.com"
                  className="bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] text-sm h-10 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#17251C] block mb-1.5">
                  Rôle opérationnel *
                </label>
                <select
                  className="w-full bg-[#F5F8F5] border border-[#D8E6DB] rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-1 focus:ring-[#006B2D] h-10"
                  disabled={!!editingUser && isLastActiveAdmin(editingUser)}
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

              {editingUser && (
                <div>
                  <label
                    htmlFor="account-status"
                    className="text-xs font-semibold block mb-1.5"
                  >
                    Statut du compte
                  </label>
                  <select
                    id="account-status"
                    className="w-full min-h-11 rounded-lg border bg-background px-3"
                    disabled={isLastActiveAdmin(editingUser)}
                    value={formData.statut}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        statut: event.target.value as User["statut"],
                      })
                    }
                  >
                    <option value="actif">Actif</option>
                    <option value="suspendu">Suspendu</option>
                    <option value="invitation_envoyee">
                      Invitation en attente
                    </option>
                    <option value="desactive">Désactivé</option>
                  </select>
                </div>
              )}
              {/* Option mot de passe en mode création */}
              {!editingUser && (
                <AdminPasswordChoice
                  mode={createPasswordMode}
                  password={formData.password}
                  onModeChange={setCreatePasswordMode}
                  onPasswordChange={(password) =>
                    setFormData((previous) => ({ ...previous, password }))
                  }
                  disabled={isSubmitting}
                />
              )}
            </div>
          </RecordForm>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DIALOG DE RÉINITIALISATION DU MOT DE PASSE
          ========================================================================= */}
      <Dialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          if (isResettingPassword || isSendingLink) return;
          setPasswordDialogOpen(open);
          if (!open) setManualResetPassword("");
        }}
      >
        <DialogContent className="max-w-md bg-white border border-[#D8E6DB] text-[#17251C] shadow-2xl p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold text-[#17251C]">
              Réinitialiser le mot de passe
            </DialogTitle>
            <DialogDescription className="text-xs text-[#556B5C]">
              Définir un nouveau mot de passe temporaire ou envoyer un lien
              sécurisé par email.
            </DialogDescription>
          </DialogHeader>

          {userForPasswordReset && (
            <div className="grid gap-4 py-2">
              <div className="bg-[#F5F8F5] border border-[#D8E6DB] rounded-lg p-3 text-xs space-y-1">
                <p className="font-semibold text-[#17251C]">
                  {userForPasswordReset.nom} {userForPasswordReset.prenom}
                </p>
                <p className="font-mono text-[#556B5C]">
                  {userForPasswordReset.email}
                </p>
                <p className="text-[11px] text-[#006B2D] font-medium">
                  Rôle : {userForPasswordReset.role}
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <AdminPasswordChoice
                    mode={resetPasswordMode}
                    password={manualResetPassword}
                    onModeChange={setResetPasswordMode}
                    onPasswordChange={setManualResetPassword}
                    disabled={isResettingPassword || isSendingLink}
                  />
                  <Button
                    type="button"
                    disabled={isResettingPassword || isSendingLink}
                    onClick={handleResetPassword}
                    className="w-full min-h-[44px] bg-[#006B2D] hover:bg-[#004D20] text-white text-xs font-semibold shadow-xs"
                  >
                    {isResettingPassword ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Application en cours...
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4 mr-2" />
                        {resetPasswordMode === "manual"
                          ? "Appliquer le mot de passe saisi"
                          : "Générer et appliquer un mot de passe"}
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[#D8E6DB]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-[#556B5C] font-semibold">
                      Ou
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#17251C] block">
                    Option 2 : Envoyer un lien de réinitialisation
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSendingLink || isResettingPassword}
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
                  disabled={isResettingPassword || isSendingLink}
                  onClick={() => {
                    setPasswordDialogOpen(false);
                    setManualResetPassword("");
                  }}
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
        onClose={() =>
          setCredentialsModal((prev) => ({
            ...prev,
            isOpen: false,
            credentials: null,
          }))
        }
        title={credentialsModal.title}
        description={credentialsModal.description}
        credentials={credentialsModal.credentials}
      />
    </div>
  );
}
