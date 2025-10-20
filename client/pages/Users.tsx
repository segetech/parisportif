import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequireAuth, RequireRole, useAuth } from "@/context/AuthContext";
import api, { Role, User, UserStatus } from "@/data/api";
import { auditService, type AuditEntry } from "@/lib/audit";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function UsersPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "CONTROLEUR"]}>
        <AppLayout>
          <UsersTable />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}

function UsersTable() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isController = user?.role === "CONTROLEUR";

  // Filtres et pagination
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "TOUS">("TOUS");
  const [statut, setStatut] = useState<UserStatus | "TOUS">("TOUS");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<User[]>([]);

  const debouncer = useRef<number | undefined>(undefined);

  async function load(params?: Partial<{ q: string; role: Role | "TOUS"; statut: UserStatus | "TOUS"; page: number; size: number }>) {
    const res = await api.users.list({ q, role, statut, page, size, ...(params || {}) });
    setRows(res.rows);
    setTotal(res.total);
  }

  function labelAction(a: AuditEntry["action"]): string {
    switch (a) {
      case "cree":
        return "créé";
      case "edite":
        return "modifié";
      case "valide":
        return "validé";
      case "rejete":
        return "rejeté";
      case "supprime":
        return "supprimé";
      case "normalise":
        return "normalisé";
      default:
        return a;
    }
  }

  function labelEntity(e: AuditEntry["entity"]): string {
    switch (e) {
      case "Systeme":
        return "Système";
      case "Transaction":
        return "Transaction";
      case "Pari":
        return "Pari";
      case "Salle":
        return "Salle";
      default:
        return e as string;
    }
  }

  function formatDetails(details: any): string {
    if (!details) return "";
    try {
      if (details.change && details.from !== undefined && details.to !== undefined) {
        return `${details.change}: ${details.from} → ${details.to}`;
      }
      if (details.action === "suspend" && details.motif) {
        return `suspension (motif: ${details.motif})`;
      }
      if (details.motif && details.soft) {
        return `suppression logique (motif: ${details.motif})`;
      }
      if (details.permissions) {
        return `permissions: ${Array.isArray(details.permissions) ? details.permissions.join(", ") : String(details.permissions)}`;
      }
      if (details.values && details.values.email) {
        return `email: ${details.values.email}`;
      }
      if (details.user && details.user.email) {
        return `utilisateur: ${details.user.email}`;
      }
      const str = JSON.stringify(details);
      return str.length > 140 ? str.slice(0, 140) + "…" : str;
    } catch {
      return String(details);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, statut, page, size]);

  function onSearchChange(val: string) {
    setQ(val);
    if (debouncer.current) window.clearTimeout(debouncer.current);
    debouncer.current = window.setTimeout(() => {
      setPage(1);
      load({ q: val });
    }, 300);
  }

  // Modales
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<null | User>(null);
  const [roleOpen, setRoleOpen] = useState<null | User>(null);
  const [suspendOpen, setSuspendOpen] = useState<null | User>(null);
  const [deleteOpen, setDeleteOpen] = useState<null | User>(null);
  const [resetOpen, setResetOpen] = useState<null | { user: User; url: string }>(null);

  // Invite
  const [invNom, setInvNom] = useState("");
  const [invPrenom, setInvPrenom] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<Role>("AGENT");
  const [invStatut, setInvStatut] = useState<UserStatus>("invitation_envoyee");

  async function inviteSubmit() {
    try {
      const row = await api.users.create({
        nom: invNom.trim(),
        prenom: invPrenom.trim() || undefined,
        email: invEmail.trim().toLowerCase(),
        role: invRole,
        statut: invStatut,
      });
      toast.success(
        invStatut === "invitation_envoyee" ? "Invitation envoyée." : "Utilisateur créé.",
      );
      setInviteOpen(false);
      setInvNom("");
      setInvPrenom("");
      setInvEmail("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  }

  // Edit
  const [edNom, setEdNom] = useState("");
  const [edPrenom, setEdPrenom] = useState("");
  const [edEmail, setEdEmail] = useState("");
  const [edRole, setEdRole] = useState<Role>("AGENT");
  const [edStatut, setEdStatut] = useState<UserStatus>("actif");
  useEffect(() => {
    if (editOpen) {
      setEdNom(editOpen.nom);
      setEdPrenom(editOpen.prenom || "");
      setEdEmail(editOpen.email);
      setEdRole(editOpen.role);
      setEdStatut(editOpen.statut);
    }
  }, [editOpen]);
  async function editSubmit() {
    try {
      if (!editOpen) return;
      const updated = await api.users.update(editOpen.id, {
        nom: edNom.trim(),
        prenom: edPrenom.trim() || undefined,
        email: edEmail.trim().toLowerCase(),
        role: edRole,
        statut: edStatut,
      });
      toast.success("Utilisateur mis à jour.");
      setEditOpen(null);
      setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  }

  // Change role
  const [crRole, setCrRole] = useState<Role>("AGENT");
  useEffect(() => {
    if (roleOpen) setCrRole(roleOpen.role);
  }, [roleOpen]);
  async function changeRoleSubmit() {
    try {
      if (!roleOpen) return;
      const updated = await api.users.changeRole(roleOpen.id, crRole);
      toast.success("Rôle mis à jour.");
      setRoleOpen(null);
      setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  }

  // Suspend
  const [susMotif, setSusMotif] = useState("");
  async function suspendSubmit() {
    try {
      if (!suspendOpen) return;
      if (!susMotif.trim()) return toast.error("Motif requis");
      await api.users.suspend(suspendOpen.id, susMotif.trim());
      toast.success("Utilisateur suspendu.");
      setSuspendOpen(null);
      setSusMotif("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  }
  async function reactivate(u: User) {
    try {
      await api.users.activate(u.id);
      toast.success("Utilisateur réactivé.");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  }

  // Reset password
  async function resetPassword(u: User) {
    try {
      const { resetUrl } = await api.users.resetPassword(u.id);
      setResetOpen({ user: u, url: resetUrl });
      await navigator.clipboard.writeText(resetUrl);
      toast.success("Lien de réinitialisation généré et copié.");
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  }

  // Delete (soft)
  const [delMotif, setDelMotif] = useState("");
  async function deleteSubmit() {
    try {
      if (!deleteOpen) return;
      if (!delMotif.trim()) return toast.error("Motif requis");
      await api.users.delete(deleteOpen.id, delMotif.trim());
      toast.success("Utilisateur supprimé.");
      setDeleteOpen(null);
      setDelMotif("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  }

  // Export CSV de la vue filtrée
  function exportCsv() {
    const headers = ["Nom", "Prénom", "Email", "Rôle", "Statut", "Dernière connexion", "Créé le"];
    const lines = rows.map((r) => [r.nom, r.prenom || "", r.email, r.role, r.statut, r.derniere_connexion || "", r.cree_le]);
    const csv = [headers, ...lines]
      .map((l) => l.map((x) => `"${String(x).split('"').join('""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Utilisateurs_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / size));

  // Drawer profil
  const [profileOpen, setProfileOpen] = useState<null | User>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditEntry[]>([]);

  async function openUserAudit(u: User) {
    const all = auditService.list({});
    const filtered = all.filter(
      (e) => e.entityId === u.id || (e.details && (e.details.userId === u.id || e.details.user?.id === u.id)),
    );
    setAuditRows(filtered);
    setAuditOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Utilisateurs</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>Exporter CSV</Button>
          {isAdmin && <Button onClick={() => setInviteOpen(true)}>+ Inviter un utilisateur</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col">
          <label className="text-xs font-medium">Rechercher par nom ou email</label>
          <Input value={q} onChange={(e) => onSearchChange(e.target.value)} placeholder="Nom, Email…" className="min-w-[18rem]" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Rôle</label>
          <select className="border rounded px-2 py-2 text-sm" value={role} onChange={(e) => { setRole(e.target.value as any); setPage(1); }}>
            <option value="TOUS">Tous</option>
            <option value="ADMIN">Admin</option>
            <option value="CONTROLEUR">Contrôleur</option>
            <option value="AGENT">Agent</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Statut</label>
          <select className="border rounded px-2 py-2 text-sm" value={statut} onChange={(e) => { setStatut(e.target.value as any); setPage(1); }}>
            <option value="TOUS">Tous</option>
            <option value="actif">Actif</option>
            <option value="suspendu">Suspendu</option>
            <option value="invitation_envoyee">Invitation envoyée</option>
            <option value="desactive">Désactivé</option>
          </select>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs font-medium">Taille</label>
            <select className="border rounded px-2 py-2 text-sm" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
              {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Précédent</Button>
            <div className="text-sm">Page {page} / {totalPages}</div>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Suivant</Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2">Utilisateur</th>
              <th className="text-left p-2">Rôle</th>
              <th className="text-left p-2">Statut</th>
              <th className="text-left p-2">Dernière connexion</th>
              <th className="text-left p-2">Créé le</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <button
                    className="flex items-center gap-3 group"
                    onClick={() => setProfileOpen(r)}
                    title="Voir le profil"
                  >
                    <div className="h-8 w-8 rounded-full bg-slate-200 grid place-items-center text-xs font-semibold group-hover:ring-2 ring-offset-2 ring-slate-300">
                      {(r.prenom?.[0] || r.nom[0] || "").toUpperCase()}
                    </div>
                    <div className="text-left">
                      <div className="font-medium group-hover:underline">{r.nom}{r.prenom ? ` ${r.prenom}` : ""}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </div>
                  </button>
                </td>
                <td className="p-2">
                  <span className={
                    r.role === 'ADMIN' ? 'px-2 py-0.5 text-xs rounded bg-fuchsia-100 text-fuchsia-700' :
                    r.role === 'CONTROLEUR' ? 'px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700' :
                    'px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700'
                  }>
                    {r.role}
                  </span>
                </td>
                <td className="p-2">
                  <span className={
                    r.statut === 'actif' ? 'px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700' :
                    r.statut === 'suspendu' ? 'px-2 py-0.5 text-xs rounded bg-red-100 text-red-700' :
                    r.statut === 'invitation_envoyee' ? 'px-2 py-0.5 text-xs rounded bg-orange-100 text-orange-700' :
                    'px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700'
                  }>
                    {r.statut === 'invitation_envoyee' ? 'Invitation envoyée' : r.statut === 'desactive' ? 'Désactivé' : r.statut.charAt(0).toUpperCase() + r.statut.slice(1)}
                  </span>
                </td>
                <td className="p-2" title={r.derniere_connexion || ''}>
                  {r.derniere_connexion ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.derniere_connexion)) : '—'}
                </td>
                <td className="p-2">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(r.cree_le))}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">Actions</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => setProfileOpen(r)}>Voir le profil</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditOpen(r)}>Éditer…</DropdownMenuItem>
                        {isAdmin && <DropdownMenuItem onClick={() => setRoleOpen(r)}>Changer le rôle</DropdownMenuItem>}
                        {isAdmin && <DropdownMenuItem onClick={() => resetPassword(r)}>Réinitialiser le mot de passe</DropdownMenuItem>}
                        {isAdmin && (r.statut !== 'suspendu'
                          ? <DropdownMenuItem onClick={() => setSuspendOpen(r)}>Suspendre…</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => reactivate(r)}>Réactiver</DropdownMenuItem>)}
                        {isAdmin && <DropdownMenuItem className="text-red-600" onClick={() => setDeleteOpen(r)}>Supprimer…</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => (window.location.href = `/journal?user=${encodeURIComponent(r.id)}`)}>Voir l’historique</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="text-center text-sm text-muted-foreground p-3" colSpan={6}>Aucun utilisateur trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modale: Inviter */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Inviter un utilisateur</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-medium">Nom</label>
              <Input value={invNom} onChange={(e) => setInvNom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Prénom</label>
              <Input value={invPrenom} onChange={(e) => setInvPrenom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Email</label>
              <Input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="prenom.nom@exemple.com" />
            </div>
            <div>
              <label className="text-xs font-medium">Rôle</label>
              <select className="border rounded px-2 py-2 text-sm w-full" value={invRole} onChange={(e) => setInvRole(e.target.value as Role)}>
                <option value="ADMIN">Admin</option>
                <option value="CONTROLEUR">Contrôleur</option>
                <option value="AGENT">Agent</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Statut initial</label>
              <select className="border rounded px-2 py-2 text-sm w-full" value={invStatut} onChange={(e) => setInvStatut(e.target.value as UserStatus)}>
                <option value="invitation_envoyee">Invitation envoyée</option>
                <option value="actif">Actif</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Annuler</Button>
              <Button onClick={inviteSubmit} disabled={!isAdmin || !invNom.trim() || !invEmail.trim()}>Envoyer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawer profil */}
      <Sheet open={!!profileOpen} onOpenChange={(o) => !o && setProfileOpen(null)}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px]">
          <SheetHeader>
            <SheetTitle>Profil utilisateur</SheetTitle>
          </SheetHeader>
          {profileOpen && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-slate-200 grid place-items-center text-sm font-semibold">
                  {(profileOpen.prenom?.[0] || profileOpen.nom[0] || "").toUpperCase()}
                </div>
                <div>
                  <div className="text-lg font-semibold">{profileOpen.nom}{profileOpen.prenom ? ` ${profileOpen.prenom}` : ""}</div>
                  <div className="text-sm text-muted-foreground">{profileOpen.email}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Rôle</div>
                  <div>
                    <span className={
                      profileOpen.role === 'ADMIN' ? 'px-2 py-0.5 text-xs rounded bg-fuchsia-100 text-fuchsia-700' :
                      profileOpen.role === 'CONTROLEUR' ? 'px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700' :
                      'px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700'
                    }>{profileOpen.role}</span>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Statut</div>
                  <div>
                    <span className={
                      profileOpen.statut === 'actif' ? 'px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700' :
                      profileOpen.statut === 'suspendu' ? 'px-2 py-0.5 text-xs rounded bg-red-100 text-red-700' :
                      profileOpen.statut === 'invitation_envoyee' ? 'px-2 py-0.5 text-xs rounded bg-orange-100 text-orange-700' :
                      'px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700'
                    }>
                      {profileOpen.statut === 'invitation_envoyee' ? 'Invitation envoyée' : profileOpen.statut === 'desactive' ? 'Désactivé' : profileOpen.statut.charAt(0).toUpperCase() + profileOpen.statut.slice(1)}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Dernière connexion</div>
                  <div title={profileOpen.derniere_connexion || ''}>{profileOpen.derniere_connexion ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(profileOpen.derniere_connexion)) : '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Créé le</div>
                  <div>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(profileOpen.cree_le))}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Mis à jour le</div>
                  <div>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(profileOpen.mis_a_jour_le))}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">MFA activée</div>
                  <div>{profileOpen.mfa_active ? 'Oui' : 'Non'}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {isAdmin && <Button onClick={() => { setProfileOpen(null); setRoleOpen(profileOpen); }}>Changer le rôle</Button>}
                {isAdmin && (profileOpen.statut !== 'suspendu'
                  ? <Button variant="outline" onClick={() => { setProfileOpen(null); setSuspendOpen(profileOpen); }}>Suspendre…</Button>
                  : <Button variant="outline" onClick={() => reactivate(profileOpen)}>Réactiver</Button>)}
                {isAdmin && <Button variant="outline" onClick={() => resetPassword(profileOpen)}>Reset MDP</Button>}
                <Button variant="outline" onClick={() => openUserAudit(profileOpen)}>Voir l’historique</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Modal: Audit utilisateur */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Historique de l’utilisateur</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border overflow-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Date/Heure</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Entité</th>
                  <th className="text-left p-2">ID</th>
                  <th className="text-left p-2">Détails</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.length ? (
                  auditRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{new Date(r.ts).toLocaleString("fr-FR")}</td>
                      <td className="p-2">{labelAction(r.action)}</td>
                      <td className="p-2">{labelEntity(r.entity)}</td>
                      <td className="p-2">{r.entityId || ""}</td>
                      <td className="p-2 text-xs">{formatDetails(r.details)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-muted-foreground p-3">Aucun historique.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale: Éditer */}
      <Dialog open={!!editOpen} onOpenChange={(o) => !o && setEditOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Éditer l’utilisateur</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-medium">Nom</label>
              <Input value={edNom} onChange={(e) => setEdNom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Prénom</label>
              <Input value={edPrenom} onChange={(e) => setEdPrenom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Email</label>
              <Input type="email" value={edEmail} onChange={(e) => setEdEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Rôle</label>
              <select className="border rounded px-2 py-2 text-sm w-full" value={edRole} onChange={(e) => setEdRole(e.target.value as Role)} disabled={!isAdmin}>
                <option value="ADMIN">Admin</option>
                <option value="CONTROLEUR">Contrôleur</option>
                <option value="AGENT">Agent</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Statut</label>
              <select className="border rounded px-2 py-2 text-sm w-full" value={edStatut} onChange={(e) => setEdStatut(e.target.value as UserStatus)}>
                <option value="actif">Actif</option>
                <option value="suspendu">Suspendu</option>
                <option value="invitation_envoyee">Invitation envoyée</option>
                <option value="desactive">Désactivé</option>
              </select>
            </div>
            <div className="text-xs text-muted-foreground">MFA activée: {editOpen?.mfa_active ? 'Oui' : 'Non'}</div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(null)}>Annuler</Button>
              <Button onClick={editSubmit} disabled={!isAdmin}>Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale: Changer le rôle */}
      <Dialog open={!!roleOpen} onOpenChange={(o) => !o && setRoleOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Changer le rôle</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-medium">Rôle</label>
              <select className="border rounded px-2 py-2 text-sm w-full" value={crRole} onChange={(e) => setCrRole(e.target.value as Role)}>
                <option value="ADMIN">Admin</option>
                <option value="CONTROLEUR">Contrôleur</option>
                <option value="AGENT">Agent</option>
              </select>
              <div className="text-xs text-muted-foreground mt-1">Attention: Au moins un Administrateur doit rester actif.</div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRoleOpen(null)}>Annuler</Button>
              <Button onClick={changeRoleSubmit} disabled={!isAdmin}>Mettre à jour</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale: Suspendre */}
      <Dialog open={!!suspendOpen} onOpenChange={(o) => !o && setSuspendOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Suspendre l’utilisateur</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-medium">Motif</label>
              <textarea className="border rounded px-2 py-1 text-sm w-full min-h-[100px]" value={susMotif} onChange={(e) => setSusMotif(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSuspendOpen(null)}>Annuler</Button>
              <Button onClick={suspendSubmit} disabled={!isAdmin}>Suspendre</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale: Delete */}
      <Dialog open={!!deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmer la suppression</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="text-sm">Cette action désactivera le compte (suppression logique).</div>
            <div>
              <label className="text-xs font-medium">Motif</label>
              <textarea className="border rounded px-2 py-1 text-sm w-full min-h-[100px]" value={delMotif} onChange={(e) => setDelMotif(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteOpen(null)}>Annuler</Button>
              <Button onClick={deleteSubmit} disabled={!isAdmin} className="bg-red-600 text-white hover:bg-red-700">Supprimer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale: Reset password */}
      <Dialog open={!!resetOpen} onOpenChange={(o) => !o && setResetOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lien de réinitialisation</DialogTitle></DialogHeader>
          {resetOpen && (
            <div className="grid gap-3">
              <div className="text-sm">Un lien a été généré. Il est copié dans votre presse-papiers.</div>
              <div className="text-xs break-all border rounded p-2 bg-muted/30">{resetOpen.url}</div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setResetOpen(null)}>Fermer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
