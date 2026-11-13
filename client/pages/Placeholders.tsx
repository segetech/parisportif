import { testStatusLabel, testCatalogLabel } from "@/lib/test-vocabulary";
import AppLayout from "@/components/layout/AppLayout";
import Placeholder from "@/components/common/Placeholder";
import { RequireAuth, RequireRole } from "@/context/AuthContext";

export function BetsPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <Placeholder title="Tests" />
      </AppLayout>
    </RequireAuth>
  );
}
export function VenuesPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <Placeholder title="Sites" />
      </AppLayout>
    </RequireAuth>
  );
}
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LookupDialog from "@/components/common/LookupDialog";
import { fetchExportData, exportToCSV, exportToExcel, exportToPDF } from "@/lib/exports";
import { generateBlankImportTemplate } from "@/lib/excel-export";
import { toast } from "sonner";
import api, { Lookups, LookupKey } from "@/data/api";
import { Pencil, Trash, Plus, FileText, Download } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LookupsPage() {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [filter, setFilter] = useState("");
  const [dlg, setDlg] = useState<{
    key: LookupKey;
    mode: "add" | "edit";
    initial?: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      setLookups(await api.lookups.all());
    })();
  }, []);

  async function refresh() {
    setLookups(await api.lookups.all());
  }

  const keys: { key: LookupKey; title: string }[] = useMemo(
    () => [
      { key: "operators", title: "Opérateurs" },
      { key: "payment_operators", title: "Opérateurs de paiement" },
      { key: "platforms", title: "Plateformes" },
      { key: "supports", title: "Supports" },
      { key: "bet_types", title: "Types de test" },
      { key: "statuses", title: "Statuts de test" },
    ],
    [],
  );

  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <div className="mb-4 flex items-center gap-2">
            <Input
              placeholder="Rechercher dans les valeurs"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {lookups &&
              keys.map(({ key, title }) => (
                <Card key={key}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base font-semibold">
                      {title}
                    </CardTitle>
                    <Button
                      size="sm"
                      onClick={() => setDlg({ key, mode: "add" })}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Ajouter
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {lookups[key]
                        .filter((v) =>
                          v.toLowerCase().includes(filter.toLowerCase()),
                        )
                        .map((v) => (
                          <li
                            key={v}
                            className="flex items-center justify-between border rounded px-2 py-1"
                          >
                            <span>{v}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setDlg({ key, mode: "edit", initial: v })
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  await api.lookups.remove(key, v);
                                  await refresh();
                                }}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
          </div>

          {dlg && (
            <LookupDialog
              open={!!dlg}
              onOpenChange={(o) => !o && setDlg(null)}
              title={dlg.mode === "add" ? `Ajouter` : `Modifier`}
              initialValue={dlg.initial}
              onConfirm={async (name) => {
                if (
                  dlg.mode === "edit" &&
                  dlg.initial &&
                  dlg.initial !== name
                ) {
                  await api.lookups.remove(dlg.key, dlg.initial);
                }
                await api.lookups.add(dlg.key, name);
                await refresh();
              }}
            />
          )}
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
export { MatchingPage } from "./Matching";

export function ExportsPage() {
  const [moduleKey, setModuleKey] = useState<"transactions" | "bets" | "venues">("transactions");
  const [operator, setOperator] = useState<string>("");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [period, setPeriod] = useState<"today" | "week" | "month" | "range">("today");
  const [lookups, setLookups] = useState<{ operators: string[] }>({ operators: [] });
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const l = await api.lookups.all();
      setLookups({ operators: l.operators });
      applyPeriod("today");
    })();
  }, []);

  function applyPeriod(p: typeof period) {
    const now = new Date();
    const toIso = (d: Date) => d.toISOString().slice(0, 10);
    if (p === "today") {
      const s = toIso(now);
      setStart(s);
      setEnd(s);
    } else if (p === "week") {
      const day = now.getDay();
      const diffToMon = (day + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMon);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setStart(toIso(monday));
      setEnd(toIso(sunday));
    } else if (p === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStart(toIso(first));
      setEnd(toIso(last));
    }
    setPeriod(p);
  }

  async function onSearch() {
    try {
      setLoading(true);
      const data = await fetchExportData(moduleKey, operator, start, end);
      setCount(data.length);
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function filenameBase() {
    const mod = moduleKey === "transactions" ? "Transactions" : moduleKey === "bets" ? "Tests" : "Sites";
    return `${mod}_${operator || "Operateur"}_${start}_${end}`;
  }

  async function doExportExcel() {
    try {
      setLoading(true);
      const data = await fetchExportData(moduleKey, operator, start, end);
      if (!data.length) {
        toast.message("Aucune donnée pour ces filtres.");
        return;
      }
      // Colonnes par module
      let headers: { key: string; title: string; width?: number; numFmt?: string }[] = [];
      if (moduleKey === "transactions") {
        headers = [
          { key: "date", title: "Date", width: 12, numFmt: "yyyy-mm-dd" },
          { key: "time", title: "Heure", width: 10, numFmt: "hh:mm" },
          { key: "operator", title: "Opérateur", width: 18 },
          { key: "platform", title: "Plateforme", width: 16 },
          { key: "payment_operator", title: "Opérateur de paiement", width: 22 },
          { key: "type", title: "Type (Dépôt/Retrait)", width: 16 },
          { key: "amount_fcfa", title: "Montant (F CFA)", width: 18, numFmt: "#,##0 \"F CFA\"" },
          { key: "phone", title: "Téléphone", width: 16 },
          { key: "reference", title: "Référence", width: 20 },
          { key: "proof", title: "Preuve", width: 10 },
          { key: "notes", title: "Notes", width: 30 },
        ];
      } else if (moduleKey === "bets") {
        headers = [
          { key: "date", title: "Date", width: 12, numFmt: "yyyy-mm-dd" },
          { key: "time", title: "Heure", width: 10, numFmt: "hh:mm" },
          { key: "operator", title: "Opérateur", width: 18 },
          { key: "support", title: "Support", width: 16 },
          { key: "category", title: "Catégorie", width: 14 },
          { key: "forme", title: "Forme", width: 14 },
          { key: "amount_fcfa", title: "Montant (F CFA)", width: 18, numFmt: "#,##0 \"F CFA\"" },
          { key: "status", title: "Statut", width: 12 },
          { key: "amount_won_fcfa", title: "Montant retourné (F CFA)", width: 22, numFmt: "#,##0 \"F CFA\"" },
          { key: "reference", title: "Référence", width: 20 },
          { key: "ticket_url", title: "Lien du justificatif", width: 24 },
          { key: "notes", title: "Notes", width: 30 },
        ];
      } else {
        headers = [
          { key: "quartier_no", title: "N° quartier", width: 12 },
          { key: "quartier", title: "Quartier", width: 18 },
          { key: "operator", title: "Opérateur", width: 18 },
          { key: "support", title: "Support", width: 16 },
          { key: "bet_type", title: "Type de test", width: 16 },
          { key: "address", title: "Adresse", width: 24 },
          { key: "contact_phone", title: "Téléphone", width: 16 },
          { key: "gps_lat", title: "Latitude", width: 14, numFmt: "0.000000" },
          { key: "gps_lng", title: "Longitude", width: 14, numFmt: "0.000000" },
          { key: "notes", title: "Notes", width: 30 },
        ];
      }
      await exportToExcel(
        moduleKey === "transactions" ? "Transactions" : moduleKey === "bets" ? "Tests" : "Sites",
        headers,
        data,
        `${filenameBase()}.xlsx`,
      );
      toast.success("Export Excel généré.");
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function doExportCSV() {
    try {
      setLoading(true);
      const data = await fetchExportData(moduleKey, operator, start, end);
      if (!data.length) {
        toast.message("Aucune donnée pour ces filtres.");
        return;
      }
      // En-têtes FR
      const headers = moduleKey === "bets"
        ? ["operator", "support", "bet_type", "date", "time", "amount_fcfa", "reference", "status", "amount_won_fcfa", "phone"]
        : Object.keys(data[0]);
      await exportToCSV(headers, data, `${filenameBase()}.csv`);
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function doExportPDF() {
    try {
      setLoading(true);
      const data = await fetchExportData(moduleKey, operator, start, end);
      if (!data.length) {
        toast.message("Aucune donnée pour ces filtres.");
        return;
      }
      let headers: { key: string; title: string; width?: number; numFmt?: string }[] = [];
      if (moduleKey === "transactions") {
        headers = [
          { key: "date", title: "Date" },
          { key: "time", title: "Heure" },
          { key: "operator", title: "Opérateur" },
          { key: "platform", title: "Plateforme" },
          { key: "payment_operator", title: "Moyen paiement" },
          { key: "type", title: "Type" },
          { key: "amount_fcfa", title: "Montant (F CFA)" },
          { key: "phone", title: "Téléphone" },
          { key: "reference", title: "Référence" },
          { key: "notes", title: "Notes" },
        ];
      } else if (moduleKey === "bets") {
        headers = [
          { key: "operator", title: "Opérateur" },
          { key: "support", title: "Support" },
          { key: "montant_text", title: "Montant" },
          { key: "heure_text", title: "Heure" },
          { key: "reference", title: "Référence" },
          { key: "statut", title: "Statut" },
          { key: "montant_retourne_text", title: "Montants retournés" },
        ];
      } else {
        headers = [
          { key: "quartier_no", title: "N° quartier" },
          { key: "quartier", title: "Quartier" },
          { key: "operator", title: "Opérateur" },
          { key: "support", title: "Support" },
          { key: "bet_type", title: "Type" },
          { key: "address", title: "Adresse" },
          { key: "contact_phone", title: "Téléphone" },
        ];
      }
      const titleMod = moduleKey === "transactions" ? "Transactions" : moduleKey === "bets" ? "Tests" : "Sites de test";
      await exportToPDF(
        titleMod,
        headers,
        data,
        `${filenameBase()}.pdf`,
        operator,
        start && end ? `${start} au ${end}` : undefined
      );
      toast.success("Export PDF généré avec succès.");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export PDF");
    } finally {
      setLoading(false);
    }
  }

  const disableExport = !count;

  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "AGENT"]}>
        <AppLayout>
          <h2 className="mb-3 text-lg font-semibold">Exports simples — sélection libre</h2>

          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="flex flex-col">
              <label className="text-xs font-medium">Module</label>
              <select className="border rounded px-2 py-1 text-sm min-w-[14rem]" value={moduleKey} onChange={(e) => setModuleKey(e.target.value as any)}>
                <option value="transactions">Transactions</option>
                <option value="bets">Tests</option>
                <option value="venues">Sites</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium">Opérateur</label>
              <select className="border rounded px-2 py-1 text-sm min-w-[14rem]" value={operator || ""} onChange={(e) => setOperator(e.target.value)}>
                <option value="" disabled>Choisir…</option>
                {lookups.operators.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium">Début</label>
              <input className="border rounded px-2 py-1 text-sm" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium">Fin</label>
              <input className="border rounded px-2 py-1 text-sm" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="ml-auto flex items-end gap-2">
              <div className="flex flex-col">
                <label className="text-xs font-medium">Période</label>
                <select className="border rounded px-2 py-1 text-sm" value={period} onChange={(e) => applyPeriod(e.target.value as any)}>
                  <option value="today">Aujourd’hui</option>
                  <option value="week">Semaine</option>
                  <option value="month">Mois</option>
                  <option value="range">Intervalle</option>
                </select>
              </div>
              <Button onClick={onSearch} disabled={loading}>Rechercher</Button>
              <Button variant="outline" onClick={() => { setModuleKey("transactions"); setOperator(""); applyPeriod("today"); setCount(0); }} disabled={loading}>Réinitialiser</Button>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <div className="text-sm">
              {count ? `${count} lignes prêtes à l’export` : "Aucune donnée pour ces filtres."}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                onClick={doExportPDF}
                disabled={disableExport || loading}
                className="gap-1.5 border-[#006B2D]/30 text-[#006B2D] hover:bg-[#006B2D]/10 font-bold"
              >
                <FileText className="h-4 w-4 text-[#006B2D]" />
                Exporter en PDF
              </Button>
              <Button
                onClick={doExportExcel}
                disabled={disableExport || loading}
                className="gap-1.5 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold"
              >
                <Download className="h-4 w-4 text-[#FFD000]" />
                Exporter en Excel
              </Button>
              <Button variant="outline" onClick={doExportCSV} disabled={disableExport || loading}>
                Exporter en CSV
              </Button>
            </div>
          </div>

          {/* SÉPARATION EXPLICITE : GÉNÉRATION DES MODÈLES VIERGES D'IMPORTATION */}
          <div className="mt-8 p-5 rounded-2xl border border-[#D8E6DB] bg-white space-y-3 shadow-xs">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-[#006B2D]" />
              <div>
                <h3 className="text-sm font-bold text-[#17251C]">
                  Modèles d’import Excel
                </h3>
                <p className="text-xs text-[#556B5C]">
                  Téléchargez un gabarit pré-formaté avec les en-têtes attendus et des exemples pour préparer vos saisies d'agents.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => generateBlankImportTemplate("depotretrait")}
                className="justify-start gap-2 border-[#D8E6DB] bg-[#F5F8F5] hover:bg-white text-[#17251C] text-xs font-semibold min-h-[44px]"
              >
                <Download className="h-4 w-4 text-[#006B2D]" />
                Modèle Dépôts & Retraits (.xlsx)
              </Button>

              <Button
                variant="outline"
                onClick={() => generateBlankImportTemplate("tests")}
                className="justify-start gap-2 border-[#D8E6DB] bg-[#F5F8F5] hover:bg-white text-[#17251C] text-xs font-semibold min-h-[44px]"
              >
                <Download className="h-4 w-4 text-[#006B2D]" />

                Modèle Tests & Montants engagés (.xlsx)
              </Button>

              <Button
                variant="outline"
                onClick={() => generateBlankImportTemplate("salles")}
                className="justify-start gap-2 border-[#D8E6DB] bg-[#F5F8F5] hover:bg-white text-[#17251C] text-xs font-semibold min-h-[44px]"
              >
                <Download className="h-4 w-4 text-[#006B2D]" />

                Modèle Sites de test (.xlsx)
              </Button>
            </div>
          </div>
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
export function SettingsPage() {
  const { settings, setSettings, applyNormalization, reset, save } = useSettings();

  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <div className="w-full space-y-4">
            <Tabs defaultValue="saisie">
              <TabsList>
                <TabsTrigger value="saisie">Saisie & qualité</TabsTrigger>
                <TabsTrigger value="roles">Rôles & permissions</TabsTrigger>
                <TabsTrigger value="matching">Matching</TabsTrigger>
                <TabsTrigger value="exports">Exports</TabsTrigger>
                <TabsTrigger value="systeme">Système</TabsTrigger>
              </TabsList>

              <TabsContent value="saisie">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Saisie & qualité</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium">Références uniques</label>
                        <div className="flex items-center justify-between border rounded p-2 mt-1">
                          <span>Transactions</span>
                          <input type="checkbox" className="h-4 w-4" checked={settings.uniqueReferences.transactions} onChange={(e) => setSettings((s) => ({ ...s, uniqueReferences: { ...s.uniqueReferences, transactions: e.target.checked } }))} />
                        </div>
                        <div className="flex items-center justify-between border rounded p-2 mt-2">
                          <span>Tests</span>
                          <input type="checkbox" className="h-4 w-4" checked={settings.uniqueReferences.bets} onChange={(e) => setSettings((s) => ({ ...s, uniqueReferences: { ...s.uniqueReferences, bets: e.target.checked } }))} />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border rounded p-2">
                          <span>Preuve requise (Transactions)</span>
                          <input type="checkbox" className="h-4 w-4" checked={settings.requireProofTransactions} onChange={(e) => setSettings((s) => ({ ...s, requireProofTransactions: e.target.checked }))} />
                        </div>
                        <div className="flex items-center justify-between border rounded p-2">
                          <span>Téléphone requis (Transactions)</span>
                          <input type="checkbox" className="h-4 w-4" checked={settings.requirePhoneTransactions} onChange={(e) => setSettings((s) => ({ ...s, requirePhoneTransactions: e.target.checked }))} />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <div>
                        <label className="text-xs font-medium">Durée d’édition Agent (minutes)</label>
                        <Input type="number" min={0} value={settings.agentEditWindowMinutes} onChange={(e) => setSettings((s) => ({ ...s, agentEditWindowMinutes: Number(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Normalisation auto</label>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" className="h-4 w-4" checked={settings.normalizationEnabled} onChange={(e) => setSettings((s) => ({ ...s, normalizationEnabled: e.target.checked }))} />
                          <Button variant="outline" onClick={async () => { const n = await applyNormalization(); toast.success(`Normalisation exécutée : ${n} corrections`); }}>Appliquer maintenant</Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="outline" onClick={reset}>Réinitialiser</Button>
                      <Button onClick={save}>Enregistrer</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="roles">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rôles & permissions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium">Portée du tableau de bord (Agent)</label>
                        <select className="border rounded px-2 py-2 text-sm w-full" value={settings.dashboardScopeAgent} onChange={(e) => setSettings((s) => ({ ...s, dashboardScopeAgent: e.target.value as any }))}>
                          <option value="self">Ses données</option>
                          <option value="all">Toutes les données</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between border rounded p-2">
                        <span>Agent peut exporter</span>
                        <input type="checkbox" className="h-4 w-4" checked={settings.agentCanExport} onChange={(e) => setSettings((s) => ({ ...s, agentCanExport: e.target.checked }))} />
                      </div>
                      <div className="flex items-center justify-between border rounded p-2">
                        <span>Agent peut gérer Sites</span>
                        <input type="checkbox" className="h-4 w-4" checked={settings.agentCanManageVenues} onChange={(e) => setSettings((s) => ({ ...s, agentCanManageVenues: e.target.checked }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Contrôleur peut supprimer</label>
                        <select className="border rounded px-2 py-2 text-sm w-full" value={settings.controllerCanDelete} onChange={(e) => setSettings((s) => ({ ...s, controllerCanDelete: e.target.value as any }))}>
                          <option value="interdite">Interdite</option>
                          <option value="autorisee">Autorisée</option>
                        </select>
                        <div className="flex items-center justify-between border rounded p-2 mt-2">
                          <span>Motif requis</span>
                          <input type="checkbox" className="h-4 w-4" checked={settings.controllerDeleteReasonRequired} onChange={(e) => setSettings((s) => ({ ...s, controllerDeleteReasonRequired: e.target.checked }))} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium">Suppression par Agent</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input type="checkbox" className="h-4 w-4" checked={settings.agentCanDelete.allowed} onChange={(e) => setSettings((s) => ({ ...s, agentCanDelete: { ...s.agentCanDelete, allowed: e.target.checked } }))} />
                          <span>Autorisé ≤ N minutes</span>
                          <Input type="number" className="w-28" min={0} value={settings.agentCanDelete.minutesLimit || 0} onChange={(e) => setSettings((s) => ({ ...s, agentCanDelete: { ...s.agentCanDelete, minutesLimit: Number(e.target.value) || 0 } }))} />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="outline" onClick={reset}>Réinitialiser</Button>
                      <Button onClick={save}>Enregistrer</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="matching">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Matching</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center justify-between border rounded p-2">
                        <span>Activer le matching</span>
                        <input type="checkbox" className="h-4 w-4" checked={settings.matchingEnabled} onChange={(e) => setSettings((s) => ({ ...s, matchingEnabled: e.target.checked }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Fenêtre horaire (± minutes)</label>
                        <Input type="number" min={0} value={settings.matchingWindowMinutes} onChange={(e) => setSettings((s) => ({ ...s, matchingWindowMinutes: Number(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Tolérance montant (± %)</label>
                        <Input type="number" min={0} max={100} value={settings.amountTolerancePercent} onChange={(e) => setSettings((s) => ({ ...s, amountTolerancePercent: Number(e.target.value) || 0 }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-medium">Score minimal par défaut</label>
                        <Input type="number" min={0} max={100} value={settings.defaultMinScore} onChange={(e) => setSettings((s) => ({ ...s, defaultMinScore: Number(e.target.value) || 0 }))} />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="outline" onClick={reset}>Réinitialiser</Button>
                      <Button onClick={save}>Enregistrer</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="exports">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Exports</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium">Format par défaut</label>
                        <select className="border rounded px-2 py-2 text-sm w-full" value={settings.defaultExportFormat} onChange={(e) => setSettings((s) => ({ ...s, defaultExportFormat: e.target.value as any }))}>
                          <option value="excel">Excel</option>
                          <option value="csv">CSV</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium">Taille max export</label>
                        <Input type="number" min={0} value={settings.exportsMaxRows} onChange={(e) => setSettings((s) => ({ ...s, exportsMaxRows: Number(e.target.value) || 0 }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between border rounded p-2">
                        <span>Inclure colonne « Numéro de téléphone » (Tests)</span>
                        <input type="checkbox" className="h-4 w-4" checked={settings.includePhoneInBetsExport} onChange={(e) => setSettings((s) => ({ ...s, includePhoneInBetsExport: e.target.checked }))} />
                      </div>
                      <div className="space-y-2">
                        <div className="font-medium text-sm">Styles Excel</div>
                        <div className="flex items-center justify-between border rounded p-2">
                          <span>Freeze ligne 1</span>
                          <input type="checkbox" className="h-4 w-4" checked={settings.exportExcelStyles.freezeTopRow} onChange={(e) => setSettings((s) => ({ ...s, exportExcelStyles: { ...s.exportExcelStyles, freezeTopRow: e.target.checked } }))} />
                        </div>
                        <div className="flex items-center justify-between border rounded p-2">
                          <span>AutoFilter</span>
                          <input type="checkbox" className="h-4 w-4" checked={settings.exportExcelStyles.autoFilter} onChange={(e) => setSettings((s) => ({ ...s, exportExcelStyles: { ...s.exportExcelStyles, autoFilter: e.target.checked } }))} />
                        </div>
                        <div className="flex items-center justify-between border rounded p-2">
                          <span>Couleur par opérateur (Tests)</span>
                          <input type="checkbox" className="h-4 w-4" checked={settings.exportExcelStyles.colorByOperator} onChange={(e) => setSettings((s) => ({ ...s, exportExcelStyles: { ...s.exportExcelStyles, colorByOperator: e.target.checked } }))} />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="outline" onClick={reset}>Réinitialiser</Button>
                      <Button onClick={save}>Enregistrer</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="systeme">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Système</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground">Locale</label>
                        <div className="border rounded p-2">{settings.locale}</div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Fuseau</label>
                        <div className="border rounded p-2">{settings.timezone}</div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Format date</label>
                        <div className="border rounded p-2">{settings.dateFormat}</div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Format heure</label>
                        <div className="border rounded p-2">{settings.timeFormat}</div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Rétention journal d’audit (jours)</label>
                      <Input type="number" min={0} value={settings.auditRetentionDays} onChange={(e) => setSettings((s) => ({ ...s, auditRetentionDays: Number(e.target.value) || 0 }))} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "config.json";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        Télécharger configuration (JSON)
                      </Button>
                      <label className="inline-flex items-center gap-2 border rounded px-3 py-2 text-sm cursor-pointer">
                        Importer configuration (JSON)
                        <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const text = await file.text();
                          try {
                            const json = JSON.parse(text);
                            setSettings((s) => ({ ...s, ...json }));
                            toast.success("Configuration importée.");
                          } catch {
                            toast.error("Fichier invalide");
                          }
                        }} />
                      </label>
                      <Button variant="destructive" onClick={() => {
                        if (!confirm("Réinitialiser toute la configuration ?")) return;
                        reset();
                        toast.success("Configuration réinitialisée.");
                      }}>Réinitialiser</Button>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <Button onClick={save}>Enregistrer</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
