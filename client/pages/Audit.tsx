import AppLayout from "@/components/layout/AppLayout";
import { RequireAuth, RequireRole, useAuth } from "@/context/AuthContext";
import { auditService, type AuditEntry } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function AuditLogPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "CONTROLEUR"]}>
        <AppLayout>
          <AuditTable />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}

function AuditTable() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [filters, setFilters] = useState({
    start: "",
    end: "",
    userEmail: "",
    role: "",
    action: "",
    entity: "",
    userId: "",
  });

  function load() {
    const base = auditService.list({
      start: filters.start || undefined,
      end: filters.end || undefined,
      userEmail: filters.userEmail || undefined,
      role: (filters.role as any) || undefined,
      action: (filters.action as any) || undefined,
      entity: (filters.entity as any) || undefined,
    });
    const uid = filters.userId.trim();
    const filtered = uid
      ? base.filter((e) => e.entityId === uid || (e.details && (e.details.userId === uid || e.details.user?.id === uid)))
      : base;
    setRows(filtered);
  }

  useEffect(() => {
    // Pre-filter by userId if present in URL
    const uid = searchParams.get("user") || "";
    setFilters((f) => ({ ...f, userId: uid }));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canExport = true;
  const csv = useMemo(() => {
    const headers = [
      "Date/Heure",
      "Utilisateur",
      "Rôle",
      "Action",
      "Entité",
      "ID",
      "Détails",
    ];
    const lines = rows.map((r) => [
      r.ts,
      r.user?.email || "",
      r.user?.role || "",
      labelAction(r.action),
      labelEntity(r.entity),
      r.entityId || "",
      summarizeDetails(r.details || {}),
    ]);
    return [headers, ...lines]
      .map((l) =>
        l
          .map((x) => {
            const s = String(x);
            const escaped = s.split('"').join('""');
            return `"${escaped}"`;
          })
          .join(","),
      )
      .join("\n");
  }, [rows]);

  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Journal d’audit</div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col">
          <label className="text-xs font-medium">Début</label>
          <input type="date" className="border rounded px-2 py-1 text-sm" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Fin</label>
          <input type="date" className="border rounded px-2 py-1 text-sm" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Utilisateur</label>
          <input className="border rounded px-2 py-1 text-sm" value={filters.userEmail} onChange={(e) => setFilters({ ...filters, userEmail: e.target.value })} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Rôle</label>
          <select className="border rounded px-2 py-1 text-sm" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
            <option value="">Tous</option>
            <option value="ADMIN">ADMIN</option>
            <option value="CONTROLEUR">CONTROLEUR</option>
            <option value="AGENT">AGENT</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Action</label>
          <select className="border rounded px-2 py-1 text-sm" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
            <option value="">Toutes</option>
            <option value="cree">crée</option>
            <option value="edite">édite</option>
            <option value="valide">valide</option>
            <option value="rejete">rejette</option>
            <option value="supprime">supprime</option>
            <option value="normalise">normalise</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Entité</label>
          <select className="border rounded px-2 py-1 text-sm" value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })}>
            <option value="">Toutes</option>
            <option value="Transaction">Transaction</option>
            <option value="Pari">Pari</option>
            <option value="Salle">Salle</option>
            <option value="Systeme">Système</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Utilisateur (ID)</label>
          <input className="border rounded px-2 py-1 text-sm" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })} placeholder="Filtrer par userId" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={load}>Rechercher</Button>
          <Button variant="outline" onClick={downloadCsv} disabled={!canExport}>Exporter CSV</Button>
        </div>
      </div>

      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2">Date/Heure</th>
              <th className="text-left p-2">Utilisateur</th>
              <th className="text-left p-2">Rôle</th>
              <th className="text-left p-2">Action</th>
              <th className="text-left p-2">Entité</th>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Détails</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{new Date(r.ts).toLocaleString("fr-FR")}</td>
                <td className="p-2">{r.user?.email || ""}</td>
                <td className="p-2">{r.user?.role || ""}</td>
                <td className="p-2">{labelAction(r.action)}</td>
                <td className="p-2">{labelEntity(r.entity)}</td>
                <td className="p-2">{r.entityId || ""}</td>
                <td className="p-2 text-xs">
                  <DetailsView details={r.details} />
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="text-center text-sm text-muted-foreground p-3">Aucune entrée.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function labelAction(a: AuditEntry["action"]): string {
  switch (a) {
    case "cree":
      return "Création";
    case "edite":
      return "Modification";
    case "valide":
      return "Validation";
    case "rejete":
      return "Rejet";
    case "supprime":
      return "Suppression";
    case "normalise":
      return "Normalisation";
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

function summarizeDetails(d: any): string {
  if (!d) return "";
  if (d.change && d.from !== undefined && d.to !== undefined) {
    return `${d.change}: ${d.from} → ${d.to}`;
  }
  if (d.action === "suspend" && d.motif) return `Suspension (motif: ${d.motif})`;
  if (d.motif && d.soft) return `Suppression logique (motif: ${d.motif})`;
  if (d.permissions) return `Permissions: ${Array.isArray(d.permissions) ? d.permissions.join(", ") : String(d.permissions)}`;
  if (d.values && d.values.email) return `Email: ${d.values.email}`;
  if (d.user && d.user.email) return `Utilisateur: ${d.user.email}`;
  const s = JSON.stringify(d);
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}

function DetailsView({ details }: { details: any }) {
  if (!details || typeof details !== "object") return <span>{String(details || "")}</span>;
  // Cas fréquents
  if (details.change && details.from !== undefined && details.to !== undefined) {
    return (
      <ul className="list-disc pl-4">
        <li>
          <strong>Changement</strong>: {details.change} — {String(details.from)} → {String(details.to)}
        </li>
      </ul>
    );
  }
  if (details.action === "suspend" && details.motif) {
    return (
      <ul className="list-disc pl-4">
        <li><strong>Suspension</strong></li>
        <li>Motif: {details.motif}</li>
      </ul>
    );
  }
  if (details.motif && details.soft) {
    return (
      <ul className="list-disc pl-4">
        <li><strong>Suppression logique</strong></li>
        <li>Motif: {details.motif}</li>
      </ul>
    );
  }
  if (Array.isArray(details.permissions)) {
    return (
      <ul className="list-disc pl-4">
        <li><strong>Permissions</strong>:</li>
        {details.permissions.map((p: string) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    );
  }
  // Rendu générique key → value
  const entries = Object.entries(details);
  if (!entries.length) return <span />;
  return (
    <ul className="list-disc pl-4">
      {entries.map(([k, v]) => (
        <li key={k}>
          <strong>{k}</strong>: {typeof v === "object" ? summarizeDetails(v) : String(v)}
        </li>
      ))}
    </ul>
  );
}
