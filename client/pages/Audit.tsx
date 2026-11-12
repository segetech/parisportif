import AppLayout from "@/components/layout/AppLayout";
import { RequireAuth, RequireRole, useAuth } from "@/context/AuthContext";
import { auditService, type AuditEntry } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { exportStyledExcel } from "@/lib/excel-export";
import { exportStyledPDF } from "@/lib/pdf-export";
import { FileText, Download, RefreshCw } from "lucide-react";
import { useAuditLogs } from "@/hooks/use-data-queries";
import { DatePickerCustom } from "@/components/ui/date-picker-custom";

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
  const [filters, setFilters] = useState({
    start: "",
    end: "",
    userEmail: "",
    role: "",
    action: "",
    entity: "",
    userId: searchParams.get("user") || "",
  });

  // Cache TanStack React Query pour fluidité instantanée
  const { data: rows = [], isLoading, isFetching, refetch } = useAuditLogs(filters);

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

  async function downloadExcel() {
    if (!rows.length) {
      toast.error("Aucune ligne d'audit à exporter");
      return;
    }
    const columns = [
      { header: "DATE & HEURE", key: "ts", width: 22, align: "center" as const },
      { header: "UTILISATEUR", key: "user", width: 26, align: "left" as const },
      { header: "RÔLE", key: "role", width: 14, align: "center" as const, isStatus: true },
      { header: "ACTION", key: "action", width: 16, align: "center" as const, isStatus: true },
      { header: "ENTITÉ", key: "entity", width: 16, align: "left" as const },
      { header: "ID ENTITÉ", key: "entityId", width: 20, align: "center" as const },
      { header: "DÉTAILS", key: "details", width: 35, align: "left" as const },
    ];
    const data = rows.map((r) => ({
      ts: new Date(r.ts).toLocaleString("fr-FR"),
      user: r.user?.email || "Système",
      role: r.user?.role || "—",
      action: labelAction(r.action),
      entity: labelEntity(r.entity),
      entityId: r.entityId || "—",
      details: summarizeDetails(r.details || {}),
    }));

    try {
      toast.loading("Génération du rapport d'audit Excel...", { id: "audit-export" });
      await exportStyledExcel({
        sheetName: "Audit",
        title: "Journal d'Audit et Traçabilité Système",
        subtitle: "Historique d'activité et de sécurité des opérations",
        columns,
        data,
        filename: `journal_audit_${new Date().toISOString().slice(0, 10)}.xlsx`,
        showTotals: false,
      });
      toast.success(`${rows.length} entrée(s) d'audit exportée(s) en Excel`, { id: "audit-export" });
    } catch (e: any) {
      toast.error("Erreur lors de l'export Excel", { id: "audit-export" });
    }
  }

  async function downloadPdf() {
    if (!rows.length) {
      toast.error("Aucune ligne d'audit à exporter");
      return;
    }
    const columns = [
      { header: "DATE/HEURE", key: "ts", align: "center" as const },
      { header: "UTILISATEUR", key: "user", align: "left" as const },
      { header: "RÔLE", key: "role", align: "center" as const, isStatus: true },
      { header: "ACTION", key: "action", align: "center" as const, isStatus: true },
      { header: "ENTITÉ", key: "entity", align: "left" as const },
      { header: "DÉTAILS", key: "details", align: "left" as const },
    ];
    const data = rows.map((r) => ({
      ts: new Date(r.ts).toLocaleString("fr-FR"),
      user: r.user?.email || "Système",
      role: r.user?.role || "—",
      action: labelAction(r.action),
      entity: labelEntity(r.entity),
      details: summarizeDetails(r.details || {}),
    }));

    try {
      toast.loading("Génération du rapport d'audit PDF...", { id: "audit-pdf" });
      await exportStyledPDF({
        title: "Journal d'Audit et Traçabilité Système",
        subtitle: "Historique d'activité et de sécurité des opérations",
        columns,
        data,
        filename: `journal_audit_${new Date().toISOString().slice(0, 10)}.pdf`,
        showTotals: false,
        orientation: "landscape",
      });
      toast.success(`${rows.length} entrée(s) d'audit exportée(s) en PDF`, { id: "audit-pdf" });
    } catch (e: any) {
      toast.error("Erreur lors de l'export PDF", { id: "audit-pdf" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Journal d’audit</div>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-44">
          <DatePickerCustom
            label="Début"
            value={filters.start}
            onChange={(val) => setFilters({ ...filters, start: val })}
            showPresets={false}
          />
        </div>
        <div className="w-44">
          <DatePickerCustom
            label="Fin"
            value={filters.end}
            onChange={(val) => setFilters({ ...filters, end: val })}
            showPresets={false}
          />
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
            <option value="Pari">Test</option>
            <option value="Salle">Site</option>
            <option value="Systeme">Système</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium">Utilisateur (ID)</label>
          <input className="border rounded px-2 py-1 text-sm" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })} placeholder="Filtrer par userId" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-white" : ""}`} />
            <span>Rechercher</span>
          </Button>
          <Button
            variant="outline"
            onClick={downloadPdf}
            disabled={!canExport || !rows.length}
            className="gap-1.5 border-[#006B2D]/30 text-[#006B2D] hover:bg-[#006B2D]/10 font-bold"
          >
            <FileText className="h-4 w-4 text-[#006B2D]" />
            PDF
          </Button>
          <Button
            onClick={downloadExcel}
            disabled={!canExport || !rows.length}
            className="gap-1.5 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold"
          >
            <Download className="h-4 w-4 text-[#FFD000]" />
            Excel
          </Button>
          <Button variant="outline" onClick={downloadCsv} disabled={!canExport || !rows.length}>
            CSV
          </Button>
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
      return "Test";
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
