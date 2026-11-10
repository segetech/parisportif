import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUsers } from "@/hooks/use-data-queries";
import { supabase } from "@/lib/supabase";
import { Plus, Copy, RefreshCw, Pencil, Key, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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
  const { getAccessToken } = useAuth();
  // Cache TanStack React Query pour fluidité instantanée
  const { data: users = [], isLoading, isFetching, refetch } = useUsers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForPasswordReset, setUserForPasswordReset] = useState<User | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const [formData, setFormData] = useState({
    nom: "",
    prenom: "",
    email: "",
    role: "AGENT" as "ADMIN" | "CONTROLEUR" | "AGENT",
    password: "",
  });

  function generatePassword() {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    
    // Au moins une majuscule, une minuscule, un chiffre et un caractère spécial
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    password += "0123456789"[Math.floor(Math.random() * 10)];
    password += "!@#$%^&*"[Math.floor(Math.random() * 8)];
    
    // Compléter avec des caractères aléatoires
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Mélanger les caractères
    password = password.split("").sort(() => Math.random() - 0.5).join("");
    
    setFormData({ ...formData, password });
    setGeneratedPassword(password);
    setShowPassword(true);
  }

  function openDialog(user?: User) {
    if (user) {
      // Mode édition
      setEditingUser(user);
      setFormData({
        nom: user.nom,
        prenom: user.prenom || "",
        email: user.email,
        role: user.role,
        password: "", // Pas de mot de passe en mode édition
      });
    } else {
      // Mode création
      setEditingUser(null);
      setFormData({
        nom: "",
        prenom: "",
        email: "",
        role: "AGENT",
        password: "",
      });
    }
    setGeneratedPassword("");
    setShowPassword(false);
    setDialogOpen(true);
  }

  async function handleSaveUser() {
    if (editingUser) {
      // Mode édition
      return handleUpdateUser();
    } else {
      // Mode création
      return handleCreateUser();
    }
  }

  async function handleUpdateUser() {
    if (!formData.nom || !formData.email) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      const { error } = await supabase
        .from("users")
        .update({
          nom: formData.nom,
          prenom: formData.prenom || null,
          email: formData.email,
          role: formData.role,
        })
        .eq("id", editingUser!.id);

      if (error) throw error;

      toast.success("Utilisateur mis à jour avec succès");
      setDialogOpen(false);
      await refetch();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error(error.message || "Erreur lors de la mise à jour");
    }
  }

  async function handleCreateUser() {
    if (!formData.nom || !formData.email || !formData.password) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Session expirée. Veuillez vous reconnecter.");
      }

      // Appel sécurisé à l'API Admin côté serveur (ne remplace pas la session de l'administrateur)
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nom: formData.nom,
          prenom: formData.prenom || undefined,
          email: formData.email,
          role: formData.role,
          sendEmail: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la création");
      }

      toast.success("Utilisateur créé avec succès !");

      const tempPass = data.temporaryPassword || formData.password;
      const credentials = `
📧 Email: ${formData.email}
🔑 Mot de passe: ${tempPass}

⚠️ Notez bien ces identifiants et communiquez-les à l'utilisateur.
L'utilisateur peut se connecter immédiatement avec ces identifiants.
      `.trim();

      toast.info(credentials, { duration: 15000 });

      const clipboardText = `Email: ${formData.email}\nMot de passe: ${tempPass}`;
      navigator.clipboard.writeText(clipboardText);
      toast.success("Identifiants copiés dans le presse-papiers !");

      setDialogOpen(false);
      await refetch();
    } catch (error: any) {
      console.error("Erreur création utilisateur:", error);
      toast.error(error.message || "Erreur lors de la création");
    }
  }

  async function toggleUserStatus(user: User) {
    const newStatus = user.statut === "actif" ? "suspendu" : "actif";
    
    try {
      const { error } = await supabase
        .from("users")
        .update({ statut: newStatus })
        .eq("id", user.id);

      if (error) throw error;

      toast.success(
        newStatus === "actif" ? "Utilisateur réactivé" : "Utilisateur suspendu"
      );
      await refetch();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la modification");
    }
  }

  async function updateUserRole(userId: string, newRole: "ADMIN" | "CONTROLEUR" | "AGENT") {
    try {
      const { error } = await supabase
        .from("users")
        .update({ role: newRole })
        .eq("id", userId);

      if (error) throw error;

      toast.success("Rôle mis à jour avec succès");
      await refetch();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la modification");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copié dans le presse-papiers");
  }

  function openPasswordDialog(user: User) {
    setUserForPasswordReset(user);
    setNewPassword("");
    setGeneratedPassword("");
    setShowPassword(false);
    setPasswordDialogOpen(true);
  }

  function generateNewPassword() {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    password += "0123456789"[Math.floor(Math.random() * 10)];
    password += "!@#$%^&*"[Math.floor(Math.random() * 8)];
    
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    password = password.split("").sort(() => Math.random() - 0.5).join("");
    
    setNewPassword(password);
    setGeneratedPassword(password);
    setShowPassword(true);
  }

  async function handleResetPassword() {
    if (!userForPasswordReset || !newPassword) {
      toast.error("Veuillez générer un mot de passe");
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Session expirée. Veuillez vous reconnecter.");
      }

      // Appel sécurisé à l'API Admin pour réinitialiser le mot de passe de l'utilisateur cible
      const res = await fetch(`/api/admin/users/${userForPasswordReset.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sendEmail: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la réinitialisation");
      }

      const tempPass = data.temporaryPassword || newPassword;
      toast.success("Mot de passe réinitialisé avec succès");
      
      const credentials = `Email: ${userForPasswordReset.email}\nNouveau mot de passe: ${tempPass}`;
      navigator.clipboard.writeText(credentials);
      toast.info("Identifiants copiés dans le presse-papiers", { duration: 10000 });
      
      setPasswordDialogOpen(false);
    } catch (error: any) {
      console.error("Erreur réinitialisation mot de passe:", error);
      toast.error(error.message || "Impossible de réinitialiser le mot de passe.");
    }
  }

  async function handleSendResetLink() {
    if (!userForPasswordReset) return;

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
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'envoi de l'email");
    }
  }

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case "actif":
        return "px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700";
      case "suspendu":
        return "px-2 py-1 text-xs rounded bg-red-100 text-red-700";
      case "invitation_envoyee":
        return "px-2 py-1 text-xs rounded bg-blue-100 text-blue-700";
      case "desactive":
        return "px-2 py-1 text-xs rounded bg-slate-100 text-slate-700";
      default:
        return "px-2 py-1 text-xs rounded bg-slate-100 text-slate-700";
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "px-2 py-1 text-xs rounded bg-purple-100 text-purple-700 font-medium";
      case "CONTROLEUR":
        return "px-2 py-1 text-xs rounded bg-orange-100 text-orange-700 font-medium";
      case "AGENT":
        return "px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 font-medium";
      default:
        return "px-2 py-1 text-xs rounded bg-slate-100 text-slate-700";
    }
  };

  if (isLoading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion des utilisateurs</h1>
          <p className="text-sm text-muted-foreground">
            Créer et gérer les comptes utilisateurs
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvel utilisateur
        </Button>
      </div>

      {/* Tableau */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead>Créé le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length > 0 ? (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.nom} {user.prenom}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <select
                      className={getRoleBadge(user.role)}
                      value={user.role}
                      onChange={(e) =>
                        updateUserRole(
                          user.id,
                          e.target.value as "ADMIN" | "CONTROLEUR" | "AGENT"
                        )
                      }
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="CONTROLEUR">CONTROLEUR</option>
                      <option value="AGENT">AGENT</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <span className={getStatusBadge(user.statut)}>
                      {user.statut}
                    </span>
                  </TableCell>
                  <TableCell>
                    {user.derniere_connexion
                      ? new Date(user.derniere_connexion).toLocaleString("fr-FR")
                      : "Jamais"}
                  </TableCell>
                  <TableCell>
                    {new Date(user.cree_le).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(user)}
                        title="Modifier l'utilisateur"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPasswordDialog(user)}
                        title="Réinitialiser le mot de passe"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {user.statut === "actif" ? "Actif" : "Suspendu"}
                        </span>
                        <Switch
                          checked={user.statut === "actif"}
                          onCheckedChange={() => toggleUserStatus(user)}
                        />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  Aucun utilisateur trouvé
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Total : {users.length} utilisateur(s)
      </div>

      {/* Dialog de création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Modifier" : "Nouvel"} utilisateur
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="text-xs font-medium">Nom *</label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Nom de famille"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Prénom</label>
              <Input
                value={formData.prenom}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                placeholder="Prénom (optionnel)"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Email *</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Rôle *</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: e.target.value as "ADMIN" | "CONTROLEUR" | "AGENT",
                  })
                }
              >
                <option value="AGENT">Agent</option>
                <option value="CONTROLEUR">Contrôleur</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </div>

            {/* Champ mot de passe uniquement en mode création */}
            {!editingUser && (
              <>
                <div>
                  <label className="text-xs font-medium">Mot de passe *</label>
                  <div className="flex gap-2">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Mot de passe"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generatePassword}
                      title="Générer un mot de passe"
                    >
                      <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-[#006B2D]" : ""}`} />
                    </Button>
                  </div>
                  {generatedPassword && (
                    <div className="mt-2 p-2 bg-slate-100 rounded text-sm flex items-center justify-between">
                      <code className="font-mono">{generatedPassword}</code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(generatedPassword)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Min. 12 caractères, avec majuscule, minuscule, chiffre et caractère spécial
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                  <p className="font-medium text-amber-900 mb-1">⚠️ Important</p>
                  <p className="text-amber-800">
                    Notez bien le mot de passe généré. Il ne sera plus accessible après la création.
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSaveUser}>
                {editingUser ? "Enregistrer" : "Créer l'utilisateur"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de réinitialisation du mot de passe */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          </DialogHeader>
          {userForPasswordReset && (
            <div className="grid gap-4">
              <div className="bg-slate-50 border rounded p-3">
                <p className="text-sm">
                  <span className="font-medium">Utilisateur :</span>{" "}
                  {userForPasswordReset.nom} {userForPasswordReset.prenom}
                </p>
                <p className="text-sm text-muted-foreground">
                  {userForPasswordReset.email}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium mb-2">Option 1 : Générer un nouveau mot de passe</h3>
                  <div className="flex gap-2">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nouveau mot de passe"
                      readOnly={!!generatedPassword}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generateNewPassword}
                      title="Générer un mot de passe"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  {generatedPassword && (
                    <div className="mt-2 p-2 bg-slate-100 rounded text-sm flex items-center justify-between">
                      <code className="font-mono">{generatedPassword}</code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(generatedPassword)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <Button
                    className="w-full mt-2"
                    onClick={handleResetPassword}
                    disabled={!newPassword}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Réinitialiser avec ce mot de passe
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">Ou</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Option 2 : Envoyer un lien de réinitialisation</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    L'utilisateur recevra un email avec un lien pour définir son propre mot de passe.
                  </p>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleSendResetLink}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Envoyer le lien par email
                  </Button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                <p className="font-medium text-amber-900 mb-1">⚠️ Important</p>
                <p className="text-amber-800 text-xs">
                  Si vous générez un nouveau mot de passe, notez-le bien et communiquez-le à l'utilisateur de manière sécurisée.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
