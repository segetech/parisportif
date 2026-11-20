import { useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { RequireAuth, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  Plus,
  Upload,
  Download,
  RefreshCw,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Coins,
  Receipt,
  Loader2,
} from "lucide-react";
import {
  useBets,
  useTransactions,
  useMonthlyExpenses,
  type MonthlyExpense,
} from "@/hooks/use-data-queries";
import { useOptionalSettings, resolveStoredTransactionFee } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { DatePickerCustom } from "@/components/ui/date-picker-custom";
import { toast } from "sonner";

dayjs.locale("fr");

function evaluateSimpleSumFormula(formula: string): number {
  const cleaned = formula.replace(/^=/, "").trim();
  if (!/^[\d\s.+()-]+$/.test(cleaned)) return 0;
  const parts = cleaned.split("+");
  let sum = 0;
  for (const part of parts) {
    const val = Number(part.trim());
    if (!Number.isFinite(val)) return 0;
    sum += val;
  }
  return Math.round(sum);
}

function extractNumericCell(cell: ExcelJS.Cell): number {
  const raw = cell.value;
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return Math.round(raw);
  if (typeof raw === "object" && "result" in raw) {
    const res = Number((raw as any).result);
    if (Number.isFinite(res)) return Math.round(res);
  }
  if (typeof raw === "object" && "formula" in raw && typeof (raw as any).formula === "string") {
    const evaluated = evaluateSimpleSumFormula((raw as any).formula);
    if (evaluated !== 0) return evaluated;
  }
  const cleaned = String(cell.text || raw)
    .replace(/\s+/g, "")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function extractTextCell(cell: ExcelJS.Cell): string {
  const raw = cell.value;
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object" && "result" in raw) {
    return String((raw as any).result ?? "").trim();
  }
  return String(cell.text || raw).trim();
}

function extractDateCell(cell: ExcelJS.Cell): string | null {
  const raw = cell.value;
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = extractTextCell(cell);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function formatFCFA(val: number): string {
  return `${Math.round(val || 0).toLocaleString("fr-FR")} FCFA`;
}

export default function DepensesPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <DepensesContent />
      </AppLayout>
    </RequireAuth>
  );
}

type AutoSourceMode = "circuit" | "tests" | "transactions";

interface ConsolidatedExpenseRow {
  key: string;
  date: string;
  designation: string;
  testCount: number;
  retraitCount: number;
  testMontant: number;
  testGains: number;
  autoGainsSource: "retraits" | "tests" | null;
  operatorFees: number;
  manualMontant: number;
  manualDepenses: number;
  manualGains: number;
  montant_fcfa: number;
  depenses_fcfa: number;
  gains_fcfa: number;
  observations?: string | null;
  financement_fcfa: number;
  financement_source?: string | null;
  soldes_fcfa: number;
  computed_solde_fcfa: number;
  manualEntry: MonthlyExpense | null;
}

function DepensesContent() {
  const { user } = useAuth();
  const settings = useOptionalSettings();
  const { data: rows = [], isLoading, isFetching, refetch } = useMonthlyExpenses();
  const {
    data: bets = [],
    isLoading: betsLoading,
    isFetching: betsFetching,
    refetch: refetchBets,
  } = useBets();
  const {
    data: transactions = [],
    isFetching: txFetching,
    refetch: refetchTx,
  } = useTransactions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [sourceMode, setSourceMode] = useState<AutoSourceMode>("circuit");
  const [showFullMonthCalendar, setShowFullMonthCalendar] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [importing, setImporting] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MonthlyExpense | null>(null);
  const [saving, setSaving] = useState(false);
  const [entryKind, setEntryKind] = useState<"depense" | "apport" | "complet">("depense");
  const [form, setForm] = useState({
    date: dayjs().format("YYYY-MM-DD"),
    designation: "DEPOT",
    montant_fcfa: 0,
    depenses_fcfa: 0,
    gains_fcfa: 0,
    observations: "",
    financement_fcfa: 0,
    financement_source: "DIABY",
    soldes_fcfa: 0,
  });

  // Agrégation journalière automatique (Tests + Retraits Dépôts & Retraits) + Saisies manuelles
  const consolidatedAll = useMemo<ConsolidatedExpenseRow[]>(() => {
    const betsByDate = new Map<
      string,
      { count: number; montant: number; gains: number }
    >();
    for (const b of bets) {
      if (!b.date || b.validation_status === "brouillon") continue;
      const cur = betsByDate.get(b.date) || { count: 0, montant: 0, gains: 0 };
      cur.count += 1;
      cur.montant += Number(b.amount_fcfa || 0);
      cur.gains += Number(b.amount_won_fcfa || 0);
      betsByDate.set(b.date, cur);
    }

    const txByDate = new Map<
      string,
      { depotCount: number; depot: number; retraitCount: number; retrait: number; fees: number }
    >();
    for (const tx of transactions as any[]) {
      if (!tx.date || tx.validation_status === "brouillon" || tx.validation_status === "refuse") {
        continue;
      }
      const cur = txByDate.get(tx.date) || {
        depotCount: 0,
        depot: 0,
        retraitCount: 0,
        retrait: 0,
        fees: 0,
      };
      const amt = Number(tx.amount_fcfa || 0);
      const isRetrait = String(tx.type || "").toLowerCase().includes("retrait");
      if (!isRetrait) {
        cur.fees += resolveStoredTransactionFee(tx, settings.paymentFees).feeFcfa;
      }
      if (isRetrait) {
        cur.retraitCount += 1;
        cur.retrait += amt;
      } else {
        cur.depotCount += 1;
        cur.depot += amt;
      }
      txByDate.set(tx.date, cur);
    }

    const manualsByDate = new Map<string, MonthlyExpense[]>();
    for (const r of rows) {
      const list = manualsByDate.get(r.date) || [];
      list.push(r);
      manualsByDate.set(r.date, list);
    }

    const allDates = new Set<string>([
      ...betsByDate.keys(),
      ...txByDate.keys(),
      ...manualsByDate.keys(),
    ]);

    const result: ConsolidatedExpenseRow[] = [];
    for (const date of Array.from(allDates).sort()) {
      const testInfo = betsByDate.get(date) || { count: 0, montant: 0, gains: 0 };
      const txInfo = txByDate.get(date) || {
        depotCount: 0,
        depot: 0,
        retraitCount: 0,
        retrait: 0,
        fees: 0,
      };
      const manuals = manualsByDate.get(date) || [];

      let autoMontant = 0;
      let autoGains = 0;
      let autoGainsSource: "retraits" | "tests" | null = null;
      let autoCount = 0;

      if (sourceMode === "tests") {
        autoMontant = testInfo.montant;
        autoGains = testInfo.gains;
        autoGainsSource = testInfo.gains > 0 ? "tests" : null;
        autoCount = testInfo.count;
      } else if (sourceMode === "transactions") {
        autoMontant = txInfo.depot;
        autoGains = txInfo.retrait;
        autoGainsSource = txInfo.retrait > 0 ? "retraits" : null;
        autoCount = txInfo.depotCount;
      } else {
        // Circuit réel : Mises Tests (ou Dépôts D/R si aucun test saisi) + Retraits D/R (ou Gains Tests en secours)
        autoMontant = testInfo.montant > 0 ? testInfo.montant : txInfo.depot;
        autoCount = testInfo.count > 0 ? testInfo.count : txInfo.depotCount;
        if (txInfo.retrait > 0) {
          autoGains = txInfo.retrait;
          autoGainsSource = "retraits";
        } else if (testInfo.gains > 0) {
          autoGains = testInfo.gains;
          autoGainsSource = "tests";
        }
      }

      if (manuals.length === 0) {
        result.push({
          key: `auto-${date}`,
          date,
          designation: autoCount > 0 ? `Tests (${autoCount})` : "DEPOT",
          testCount: autoCount,
          retraitCount: txInfo.retraitCount,
          testMontant: autoMontant,
          testGains: autoGains,
          autoGainsSource,
          operatorFees: txInfo.fees,
          manualMontant: 0,
          manualDepenses: 0,
          manualGains: 0,
          montant_fcfa: autoMontant,
          depenses_fcfa: 0,
          gains_fcfa: autoGains,
          observations: null,
          financement_fcfa: 0,
          financement_source: "DIABY",
          soldes_fcfa: 0,
          computed_solde_fcfa: 0,
          manualEntry: null,
        });
      } else {
        manuals.forEach((m, idx) => {
          const isFirst = idx === 0;
          const tMontant = isFirst ? autoMontant : 0;
          const tGains = isFirst ? autoGains : 0;
          const tFees = isFirst ? txInfo.fees : 0;
          const tCount = isFirst ? autoCount : 0;
          const rCount = isFirst ? txInfo.retraitCount : 0;
          const mDep = Number(m.depenses_fcfa || 0);
          result.push({
            key: m.id,
            date,
            designation: m.designation || (tCount > 0 ? `Tests (${tCount})` : "DEPOT"),
            testCount: tCount,
            retraitCount: rCount,
            testMontant: tMontant,
            testGains: tGains,
            autoGainsSource: isFirst ? autoGainsSource : null,
            operatorFees: tFees,
            manualMontant: Number(m.montant_fcfa || 0),
            manualDepenses: mDep,
            manualGains: Number(m.gains_fcfa || 0),
            montant_fcfa: tMontant + Number(m.montant_fcfa || 0),
            depenses_fcfa: mDep,
            gains_fcfa: tGains + Number(m.gains_fcfa || 0),
            observations: m.observations,
            financement_fcfa: Number(m.financement_fcfa || 0),
            financement_source: m.financement_source,
            soldes_fcfa: Number(m.soldes_fcfa || 0),
            computed_solde_fcfa: 0,
            manualEntry: m,
          });
        });
      }
    }

    let runningBalance = 0;
    for (const item of result) {
      runningBalance +=
        item.financement_fcfa +
        item.gains_fcfa -
        item.montant_fcfa -
        item.depenses_fcfa -
        item.operatorFees;
      item.computed_solde_fcfa = runningBalance;
    }

    return result;
  }, [bets, transactions, rows, sourceMode, settings]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of consolidatedAll) {
      if (r.date && r.date.length >= 7) set.add(r.date.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [consolidatedAll]);

  const effectiveMonth =
    selectedMonth === "ALL" ? "ALL" : availableMonths.includes(selectedMonth) ? selectedMonth : "ALL";

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let base = consolidatedAll.filter((r) => {
      if (effectiveMonth !== "ALL" && !r.date?.startsWith(effectiveMonth)) {
        return false;
      }
      if (!showFullMonthCalendar) {
        const hasActivity =
          Boolean(r.manualEntry) ||
          r.montant_fcfa > 0 ||
          r.depenses_fcfa > 0 ||
          r.gains_fcfa > 0 ||
          r.financement_fcfa > 0 ||
          r.soldes_fcfa > 0;
        if (!hasActivity) return false;
      }
      return true;
    });

    // Lorsque un mois précis (YYYY-MM) est sélectionné et que la vue "Mois complet (1→31)" est active,
    // générer chaque jour du mois (comme DEPENSES DU MOI.xlsx) pour pouvoir compléter les jours manquants.
    if (effectiveMonth !== "ALL" && showFullMonthCalendar && !q) {
      const existingByDate = new Map<string, ConsolidatedExpenseRow[]>();
      for (const r of base) {
        const list = existingByDate.get(r.date) || [];
        list.push(r);
        existingByDate.set(r.date, list);
      }
      const daysInMonth = dayjs(`${effectiveMonth}-01`).daysInMonth();
      const filled: ConsolidatedExpenseRow[] = [];
      let running = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${effectiveMonth}-${String(d).padStart(2, "0")}`;
        const dayRows = existingByDate.get(iso);
        if (dayRows && dayRows.length > 0) {
          for (const item of dayRows) {
            running +=
              item.financement_fcfa +
              item.gains_fcfa -
              item.montant_fcfa -
              item.depenses_fcfa -
              item.operatorFees;
            filled.push({ ...item, computed_solde_fcfa: running });
          }
        } else {
          filled.push({
            key: `empty-${iso}`,
            date: iso,
            designation: "DEPOT",
            testCount: 0,
            retraitCount: 0,
            testMontant: 0,
            testGains: 0,
            autoGainsSource: null,
            operatorFees: 0,
            manualMontant: 0,
            manualDepenses: 0,
            manualGains: 0,
            montant_fcfa: 0,
            depenses_fcfa: 0,
            gains_fcfa: 0,
            observations: null,
            financement_fcfa: 0,
            financement_source: "DIABY",
            soldes_fcfa: 0,
            computed_solde_fcfa: running,
            manualEntry: null,
          });
        }
      }
      return filled;
    }

    if (!q) return base;
    return base.filter(
      (r) =>
        (r.designation || "").toLowerCase().includes(q) ||
        (r.observations || "").toLowerCase().includes(q) ||
        (r.financement_source || "").toLowerCase().includes(q) ||
        (r.date || "").includes(q),
    );
  }, [consolidatedAll, effectiveMonth, showFullMonthCalendar, searchQuery]);

  const totals = useMemo(() => {
    let montant = 0;
    let depenses = 0;
    let operatorFees = 0;
    let gains = 0;
    let financement = 0;
    for (const r of filteredRows) {
      montant += Number(r.montant_fcfa || 0);
      depenses += Number(r.depenses_fcfa || 0);
      operatorFees += Number(r.operatorFees || 0);
      gains += Number(r.gains_fcfa || 0);
      financement += Number(r.financement_fcfa || 0);
    }
    const net = gains - montant - depenses - operatorFees;
    const netWithFinancement = financement + gains - montant - depenses - operatorFees;
    const lastRow = filteredRows.length > 0 ? filteredRows[filteredRows.length - 1] : null;
    const latestSolde = lastRow
      ? lastRow.soldes_fcfa > 0
        ? lastRow.soldes_fcfa
        : lastRow.computed_solde_fcfa
      : 0;
    return {
      montant,
      depenses,
      operatorFees,
      gains,
      financement,
      net,
      netWithFinancement,
      latestSolde,
    };
  }, [filteredRows]);

  function openNewDialog(presetDate?: string) {
    setEditing(null);
    setEntryKind("depense");
    setForm({
      date: presetDate || dayjs().format("YYYY-MM-DD"),
      designation: "DEPENSE",
      montant_fcfa: 0,
      depenses_fcfa: 0,
      gains_fcfa: 0,
      observations: "",
      financement_fcfa: 0,
      financement_source: "DIABY",
      soldes_fcfa: 0,
    });
    setDialogOpen(true);
  }

  function openEditDialog(row: MonthlyExpense) {
    setEditing(row);
    const hasMontantOrGains =
      Number(row.montant_fcfa || 0) > 0 || Number(row.gains_fcfa || 0) > 0;
    if (hasMontantOrGains) {
      setEntryKind("complet");
    } else if (Number(row.financement_fcfa || 0) > 0 && Number(row.depenses_fcfa || 0) === 0) {
      setEntryKind("apport");
    } else {
      setEntryKind("depense");
    }
    setForm({
      date: row.date,
      designation: row.designation || "DEPOT",
      montant_fcfa: Number(row.montant_fcfa || 0),
      depenses_fcfa: Number(row.depenses_fcfa || 0),
      gains_fcfa: Number(row.gains_fcfa || 0),
      observations: row.observations || "",
      financement_fcfa: Number(row.financement_fcfa || 0),
      financement_source: row.financement_source || "DIABY",
      soldes_fcfa: Number(row.soldes_fcfa || 0),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.date) {
      toast.error("La date est obligatoire");
      return;
    }

    if (entryKind === "depense" && (Number(form.depenses_fcfa) || 0) <= 0) {
      toast.error("Veuillez saisir le montant de la dépense (> 0 FCFA)");
      return;
    }
    if (entryKind === "apport" && (Number(form.financement_fcfa) || 0) <= 0) {
      toast.error("Veuillez saisir le montant de l'apport (> 0 FCFA)");
      return;
    }
    if (entryKind === "complet" && !form.designation.trim()) {
      toast.error("La désignation est obligatoire");
      return;
    }

    setSaving(true);
    try {
      const sourceName = form.financement_source.trim() || "DIABY";
      const payload =
        entryKind === "depense"
          ? {
              date: form.date,
              designation: form.observations.trim() || form.designation.trim() || "DEPENSE",
              montant_fcfa: 0,
              depenses_fcfa: Number(form.depenses_fcfa) || 0,
              gains_fcfa: 0,
              observations: form.observations.trim() || null,
              financement_fcfa: 0,
              financement_source: sourceName,
              soldes_fcfa: Number(form.soldes_fcfa) || 0,
            }
          : entryKind === "apport"
            ? {
                date: form.date,
                designation: `APPORT ${sourceName}`,
                montant_fcfa: 0,
                depenses_fcfa: 0,
                gains_fcfa: 0,
                observations: form.observations.trim() || null,
                financement_fcfa: Number(form.financement_fcfa) || 0,
                financement_source: sourceName,
                soldes_fcfa: Number(form.soldes_fcfa) || 0,
              }
            : {
                date: form.date,
                designation: form.designation.trim(),
                montant_fcfa: Number(form.montant_fcfa) || 0,
                depenses_fcfa: Number(form.depenses_fcfa) || 0,
                gains_fcfa: Number(form.gains_fcfa) || 0,
                observations: form.observations.trim() || null,
                financement_fcfa: Number(form.financement_fcfa) || 0,
                financement_source: sourceName,
                soldes_fcfa: Number(form.soldes_fcfa) || 0,
              };
      if (editing) {
        const { error } = await supabase
          .from("monthly_expenses")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Ligne mise à jour");
      } else {
        const { error } = await supabase
          .from("monthly_expenses")
          .insert([{ ...payload, created_by: user?.id }]);
        if (error) throw error;
        toast.success("Ligne ajoutée");
      }
      invalidateRelatedQueries("expenses");
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: MonthlyExpense) {
    if (!confirm(`Supprimer l'entrée du ${dayjs(row.date).format("DD/MM/YYYY")} ?`)) {
      return;
    }
    try {
      const { error } = await supabase
        .from("monthly_expenses")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      invalidateRelatedQueries("expenses");
      toast.success("Entrée supprimée");
    } catch (err: any) {
      toast.error(err?.message || "Impossible de supprimer cette entrée");
    }
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("Aucune feuille trouvée dans le classeur");

      let headerRowNum = 1;
      const colMap: Record<string, number> = {};
      for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
        const found: Record<string, number> = {};
        ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
          const t = extractTextCell(cell).toLowerCase();
          if (t === "date") found.date = col;
          else if (t.includes("designation") || t.includes("désignation")) found.designation = col;
          else if (t === "montant") found.montant = col;
          else if (t.includes("depense") || t.includes("dépense")) found.depenses = col;
          else if (t.includes("gain")) found.gains = col;
          else if (t.includes("observation")) found.observations = col;
          else if (t.includes("solde")) found.soldes = col;
          else if (t && !found.financement) found.financement = col;
        });
        if (found.date && (found.montant || found.depenses || found.designation)) {
          headerRowNum = r;
          Object.assign(colMap, found);
          // Identifier la colonne d'apport (ex: DIABY) si présente
          ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
            const raw = extractTextCell(cell);
            const t = raw.toLowerCase();
            if (
              col !== found.date &&
              col !== found.designation &&
              col !== found.montant &&
              col !== found.depenses &&
              col !== found.gains &&
              col !== found.observations &&
              col !== found.soldes
            ) {
              colMap.financement = col;
              colMap._sourceName = raw as any;
            }
          });
          break;
        }
      }

      if (!colMap.date) {
        throw new Error("Colonnes DATE / MONTANT / DEPENSES introuvables");
      }

      const sourceLabel = String(colMap._sourceName || "DIABY");
      const toInsert: any[] = [];
      for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const desig = colMap.designation ? extractTextCell(row.getCell(colMap.designation)) : "";
        if (desig.toUpperCase() === "TOTAL") break;

        const dateVal = extractDateCell(row.getCell(colMap.date));
        if (!dateVal) continue;

        toInsert.push({
          date: dateVal,
          designation: desig || "DEPOT",
          montant_fcfa: colMap.montant ? extractNumericCell(row.getCell(colMap.montant)) : 0,
          depenses_fcfa: colMap.depenses ? extractNumericCell(row.getCell(colMap.depenses)) : 0,
          gains_fcfa: colMap.gains ? extractNumericCell(row.getCell(colMap.gains)) : 0,
          observations: colMap.observations ? extractTextCell(row.getCell(colMap.observations)) || null : null,
          financement_fcfa: colMap.financement ? extractNumericCell(row.getCell(colMap.financement)) : 0,
          financement_source: sourceLabel,
          soldes_fcfa: colMap.soldes ? extractNumericCell(row.getCell(colMap.soldes)) : 0,
          created_by: user?.id,
        });
      }

      if (toInsert.length === 0) {
        throw new Error("Aucune ligne exploitable détectée dans le fichier");
      }

      const { error } = await supabase.from("monthly_expenses").insert(toInsert);
      if (error) throw error;

      invalidateRelatedQueries("expenses");
      setSelectedMonth(toInsert[0].date.slice(0, 7));
      toast.success(`${toInsert.length} ligne(s) importée(s) avec succès`);
    } catch (err: any) {
      toast.error(err?.message || "Impossible d'importer le fichier Excel");
    } finally {
      setImporting(false);
    }
  }

  async function handleExportExcel() {
    if (filteredRows.length === 0) {
      toast.error("Aucune donnée à exporter");
      return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("DEPENSES");
    ws.columns = [
      { header: "DATE", key: "date", width: 14 },
      { header: "DESIGNATION", key: "designation", width: 18 },
      { header: "MONTANT", key: "montant", width: 15 },
      { header: "DEPENSES", key: "depenses", width: 15 },
      { header: "Gains", key: "gains", width: 15 },
      { header: "OBSERVATIONS", key: "observations", width: 24 },
      { header: "DIABY", key: "financement", width: 15 },
      { header: "SOLDES", key: "soldes", width: 15 },
    ];
    ws.getRow(1).font = { bold: true };
    filteredRows.forEach((r) => {
      const row = ws.addRow({
        date: dayjs(r.date).format("DD/MM/YYYY"),
        designation: r.designation,
        montant: Number(r.montant_fcfa || 0),
        depenses: Number(r.depenses_fcfa || 0),
        gains: Number(r.gains_fcfa || 0),
        observations: r.observations || "",
        financement: Number(r.financement_fcfa || 0),
        soldes:
          r.soldes_fcfa > 0
            ? Number(r.soldes_fcfa)
            : Number(r.computed_solde_fcfa || 0),
      });
      [3, 4, 5, 7, 8].forEach((c) => {
        row.getCell(c).numFmt = "#,##0";
      });
    });
    const lastData = filteredRows.length + 1;
    const totalRow = ws.addRow([
      "",
      "TOTAL",
      { formula: `SUM(C2:C${lastData})`, result: totals.montant },
      { formula: `SUM(D2:D${lastData})`, result: totals.depenses },
      { formula: `SUM(E2:E${lastData})`, result: totals.gains },
      { formula: `E${lastData + 1}-C${lastData + 1}-D${lastData + 1}`, result: totals.net },
      { formula: `SUM(G2:G${lastData})`, result: totals.financement },
      "",
    ]);
    totalRow.font = { bold: true };
    [3, 4, 5, 6, 7].forEach((c) => {
      totalRow.getCell(c).numFmt = "#,##0";
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DEPENSES_${effectiveMonth === "ALL" ? "TOUT" : effectiveMonth}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleExcelImport}
      />

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D8E6DB]">
        <div>
          <div className="flex items-center gap-2.5">
            <Wallet className="h-6 w-6 text-[#006B2D]" />
            <h1 className="text-2xl font-bold tracking-tight text-[#17251C]">
              Dépenses &amp; Trésorerie du Mois
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#556B5C] mt-1">
            Suivi journalier des mises engagées, dépenses annexes, gains, apports et soldes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetch();
              void refetchBets();
              void refetchTx();
            }}
            className="min-h-[40px] bg-white border-[#D8E6DB] text-[#17251C]"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching || betsFetching || txFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] bg-white border-[#B8DEC6] text-[#006B2D] hover:bg-[#E8F5EC]"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1.5" />
            )}
            Importer Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExportExcel()}
            className="min-h-[40px] bg-white border-[#D8E6DB] text-[#17251C]"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Exporter (.xlsx)
          </Button>
          <Button
            onClick={() => openNewDialog()}
            className="min-h-[40px] bg-[#006B2D] hover:bg-[#004D20] text-white font-semibold"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle ligne
          </Button>
        </div>
      </div>

      {/* KPI Bento Grid (4 cartes solides) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-[#556B5C]">
            <span>Montant engagé</span>
            <Coins className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-[#17251C] tabular-nums">
            {formatFCFA(totals.montant)}
          </div>
          <p className="text-[11px] text-[#556B5C]">{filteredRows.length} jour(s) / ligne(s)</p>
        </div>

        <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-[#556B5C]">
            <span>Dépenses annexes</span>
            <Receipt className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-[#17251C] tabular-nums">
            {formatFCFA(totals.depenses)}
          </div>
          <p className="text-[11px] text-[#556B5C]">
            Dont frais opérateurs : {formatFCFA(totals.operatorFees)}
          </p>
        </div>

        <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-[#556B5C]">
            <span>Gains récupérés</span>
            <TrendingUp className="h-4 w-4 text-[#006B2D]" />
          </div>
          <div className="text-xl font-bold text-[#006B2D] tabular-nums">
            {formatFCFA(totals.gains)}
          </div>
          <p className="text-[11px] text-[#556B5C]">
            Apports (DIABY) : {formatFCFA(totals.financement)}
          </p>
        </div>

        <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-[#556B5C]">
            <span>Bilan net (Gains − Engagé − Dép.)</span>
            <TrendingDown className={`h-4 w-4 ${totals.net >= 0 ? "text-[#006B2D]" : "text-rose-600"}`} />
          </div>
          <div
            className={`text-xl font-bold tabular-nums ${
              totals.net >= 0 ? "text-[#006B2D]" : "text-rose-700"
            }`}
          >
            {formatFCFA(totals.net)}
          </div>
          <p className="text-[11px] text-[#556B5C]">
            Trésorerie (+ DIABY) :{" "}
            <strong className="text-[#17251C]">{formatFCFA(totals.netWithFinancement)}</strong>
            {" · "}Solde : {formatFCFA(totals.latestSolde)}
          </p>
        </div>
      </div>

      {/* Filtres mois & recherche */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#D8E6DB] bg-white p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={effectiveMonth === "ALL" ? "default" : "outline"}
            onClick={() => setSelectedMonth("ALL")}
            className={
              effectiveMonth === "ALL"
                ? "h-8 text-xs bg-[#006B2D] text-white"
                : "h-8 text-xs border-[#D8E6DB]"
            }
          >
            Tous les mois
          </Button>
          {availableMonths.map((m) => (
            <Button
              key={m}
              size="sm"
              variant={effectiveMonth === m ? "default" : "outline"}
              onClick={() => setSelectedMonth(m)}
              className={
                effectiveMonth === m
                  ? "h-8 text-xs bg-[#006B2D] text-white"
                  : "h-8 text-xs border-[#D8E6DB]"
              }
            >
              {dayjs(`${m}-01`).format("MMMM YYYY")}
            </Button>
          ))}
          {effectiveMonth !== "ALL" && (
            <Button
              size="sm"
              variant={showFullMonthCalendar ? "secondary" : "outline"}
              onClick={() => setShowFullMonthCalendar((prev) => !prev)}
              className="h-8 text-xs border-[#D8E6DB]"
              title="Afficher tous les jours du mois (1 → 31) comme dans DEPENSES DU MOI.xlsx"
            >
              {showFullMonthCalendar ? "Mois complet (1→31)" : "Jours actifs uniquement"}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSourceMode("circuit")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                sourceMode === "circuit"
                  ? "bg-[#006B2D] text-white"
                  : "text-[#556B5C] hover:text-[#17251C]"
              }`}
              title="Mises des Tests + Retraits Dépôts & Retraits"
            >
              Circuit (Tests + Retraits)
            </button>
            <button
              type="button"
              onClick={() => setSourceMode("tests")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                sourceMode === "tests"
                  ? "bg-[#006B2D] text-white"
                  : "text-[#556B5C] hover:text-[#17251C]"
              }`}
            >
              Tests seuls
            </button>
            <button
              type="button"
              onClick={() => setSourceMode("transactions")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                sourceMode === "transactions"
                  ? "bg-[#006B2D] text-white"
                  : "text-[#556B5C] hover:text-[#17251C]"
              }`}
            >
              Dépôts &amp; Retraits
            </button>
          </div>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer par désignation ou observation..."
            className="h-9 sm:w-56 bg-[#F5F8F5] border-[#D8E6DB] text-xs"
          />
        </div>
      </div>

      {/* Tableau mensuel */}
      <div className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs overflow-x-auto">
        <Table>
          <TableHeader className="bg-[#F5F8F5] border-b border-[#D8E6DB]">
            <TableRow>
              <TableHead className="text-xs font-semibold text-[#556B5C]">DATE</TableHead>
              <TableHead className="text-xs font-semibold text-[#556B5C]">DESIGNATION</TableHead>
              <TableHead className="text-right text-xs font-semibold text-[#556B5C]">MONTANT</TableHead>
              <TableHead className="text-right text-xs font-semibold text-[#556B5C]">DEPENSES</TableHead>
              <TableHead className="text-right text-xs font-semibold text-[#556B5C]">FRAIS OP.</TableHead>
              <TableHead className="text-right text-xs font-semibold text-[#556B5C]">GAINS</TableHead>
              <TableHead className="text-xs font-semibold text-[#556B5C]">OBSERVATIONS</TableHead>
              <TableHead className="text-right text-xs font-semibold text-[#556B5C]">APPORT / DIABY</TableHead>
              <TableHead className="text-right text-xs font-semibold text-[#556B5C]">SOLDES</TableHead>
              <TableHead className="text-right text-xs font-semibold text-[#556B5C]">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading || betsLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-sm text-[#556B5C]">
                  Chargement des dépenses...
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-sm text-[#556B5C]">
                  Aucune dépense enregistrée. Les tests effectués s&apos;affichent automatiquement ici, ou cliquez sur{" "}
                  <strong>Importer Excel</strong> / <strong>Nouvelle ligne</strong>.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredRows.map((row) => (
                  <TableRow
                    key={row.key}
                    className="border-b border-[#E2ECE4] hover:bg-[#F5F8F5]/60"
                  >
                    <TableCell className="text-xs font-medium text-[#17251C] whitespace-nowrap">
                      {dayjs(row.date).format("DD/MM/YYYY")}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-[#17251C]">
                      <div className="flex items-center gap-1.5">
                        <span>{row.designation}</span>
                        {row.testCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {row.testCount} test(s)
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      <div>
                        {row.montant_fcfa > 0 ? row.montant_fcfa.toLocaleString("fr-FR") : "—"}
                      </div>
                      {row.testMontant > 0 && row.manualMontant > 0 && (
                        <div className="text-[10px] text-[#556B5C]">
                          Tests : {row.testMontant.toLocaleString("fr-FR")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-amber-800">
                      {row.depenses_fcfa > 0 ? row.depenses_fcfa.toLocaleString("fr-FR") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-slate-600">
                      {row.operatorFees > 0 ? row.operatorFees.toLocaleString("fr-FR") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-[#006B2D] font-semibold">
                      <div>
                        {row.gains_fcfa > 0 ? row.gains_fcfa.toLocaleString("fr-FR") : "—"}
                      </div>
                      {row.testGains > 0 && (
                        <div className="text-[10px] font-normal text-[#556B5C]">
                          {row.autoGainsSource === "retraits"
                            ? `Retraits D/R (${row.retraitCount}) : ${row.testGains.toLocaleString("fr-FR")}`
                            : `Tests : ${row.testGains.toLocaleString("fr-FR")}`}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-[#556B5C]">
                      {row.observations ? (
                        <Badge variant="outline" className="text-[11px] bg-amber-50 border-amber-200 text-amber-900">
                          {row.observations}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-blue-700">
                      {row.financement_fcfa > 0 ? row.financement_fcfa.toLocaleString("fr-FR") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums font-semibold text-[#17251C]">
                      {row.soldes_fcfa > 0 ? (
                        <span>{row.soldes_fcfa.toLocaleString("fr-FR")}</span>
                      ) : (
                        <span
                          className={
                            row.computed_solde_fcfa >= 0
                              ? "text-[#556B5C]"
                              : "text-rose-600"
                          }
                          title="Solde cumulé calculé automatiquement (Apport + Gains − Montant − Dépenses)"
                        >
                          {row.computed_solde_fcfa.toLocaleString("fr-FR")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.manualEntry ? (
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(row.manualEntry!)}
                            className="h-7 w-7 p-0 text-[#556B5C] hover:text-[#17251C]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDelete(row.manualEntry!)}
                            className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openNewDialog(row.date)}
                          className="h-7 px-2 text-[11px] border-[#B8DEC6] text-[#006B2D] hover:bg-[#E8F5EC]"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Compléter
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-[#F5F8F5] font-bold border-t-2 border-[#D8E6DB]">
                  <TableCell className="text-xs" />
                  <TableCell className="text-xs text-[#17251C]">TOTAL</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {totals.montant.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-amber-800">
                    {totals.depenses.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-slate-700">
                    {totals.operatorFees.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-[#006B2D]">
                    {totals.gains.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className={`text-xs font-mono ${totals.net >= 0 ? "text-[#006B2D]" : "text-rose-700"}`}>
                    Bilan : {totals.net.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-blue-700">
                    {totals.financement.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-[#17251C]">
                    {totals.latestSolde.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Ajout / Modification */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-white border border-[#D8E6DB]">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier la ligne" : "Nouvelle saisie — Dépense ou Apport"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#556B5C]">
              Choisissez s&apos;il s&apos;agit d&apos;une dépense annexe ou d&apos;un apport (DIABY).
            </DialogDescription>
          </DialogHeader>

          {/* Sélecteur intelligent : Dépense vs Apport (DIABY) */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] p-1 text-xs">
            <button
              type="button"
              onClick={() => setEntryKind("depense")}
              className={`py-2 px-2 rounded-lg font-semibold transition-colors ${
                entryKind === "depense"
                  ? "bg-amber-700 text-white"
                  : "text-[#556B5C] hover:text-[#17251C]"
              }`}
            >
              Dépense annexe
            </button>
            <button
              type="button"
              onClick={() => setEntryKind("apport")}
              className={`py-2 px-2 rounded-lg font-semibold transition-colors ${
                entryKind === "apport"
                  ? "bg-[#006B2D] text-white"
                  : "text-[#556B5C] hover:text-[#17251C]"
              }`}
            >
              Apport (DIABY)
            </button>
            <button
              type="button"
              onClick={() => setEntryKind("complet")}
              className={`py-2 px-2 rounded-lg font-semibold transition-colors ${
                entryKind === "complet"
                  ? "bg-[#17251C] text-white"
                  : "text-[#556B5C] hover:text-[#17251C]"
              }`}
            >
              Complet
            </button>
          </div>

          <div className="space-y-3 pt-1 text-xs">
            <div>
              <DatePickerCustom
                label="Date"
                required
                value={form.date}
                onChange={(val) => setForm({ ...form, date: val })}
              />
            </div>

            {entryKind === "depense" && (
              <div className="space-y-3">
                <div>
                  <label className="font-semibold block mb-1">
                    Nature / Libellé de la dépense *
                  </label>
                  <Input
                    value={form.observations}
                    onChange={(e) =>
                      setForm({ ...form, observations: e.target.value })
                    }
                    placeholder="Ex: CHARBON, RIZ, Carburant, Internet..."
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {["CHARBON", "RIZ", "Carburant", "Internet"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          setForm({ ...form, observations: preset })
                        }
                        className="px-2 py-0.5 rounded-md border border-[#D8E6DB] bg-[#F5F8F5] text-[11px] text-[#17251C] hover:bg-[#E8F5EC]"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">
                      Montant dépensé (FCFA) *
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={form.depenses_fcfa || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          depenses_fcfa: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="Ex: 4000"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">
                      Solde constaté (optionnel)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={form.soldes_fcfa || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          soldes_fcfa: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            )}

            {entryKind === "apport" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">
                      Source / Financeur *
                    </label>
                    <Input
                      value={form.financement_source}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          financement_source: e.target.value,
                        })
                      }
                      placeholder="DIABY"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">
                      Montant de l&apos;apport (FCFA) *
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={form.financement_fcfa || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          financement_fcfa: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="Ex: 20000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">
                      Observations (optionnel)
                    </label>
                    <Input
                      value={form.observations}
                      onChange={(e) =>
                        setForm({ ...form, observations: e.target.value })
                      }
                      placeholder="Ex: Apport caisse..."
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">
                      Solde constaté (optionnel)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={form.soldes_fcfa || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          soldes_fcfa: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            )}

            {entryKind === "complet" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Désignation *</label>
                  <Input
                    value={form.designation}
                    onChange={(e) =>
                      setForm({ ...form, designation: e.target.value })
                    }
                    placeholder="Ex: DEPOT"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Montant engagé (FCFA)</label>
                  <Input
                    type="number"
                    value={form.montant_fcfa}
                    onChange={(e) =>
                      setForm({ ...form, montant_fcfa: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Dépenses annexes (FCFA)</label>
                  <Input
                    type="number"
                    value={form.depenses_fcfa}
                    onChange={(e) =>
                      setForm({ ...form, depenses_fcfa: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Gains (FCFA)</label>
                  <Input
                    type="number"
                    value={form.gains_fcfa}
                    onChange={(e) =>
                      setForm({ ...form, gains_fcfa: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Apport / DIABY (FCFA)</label>
                  <Input
                    type="number"
                    value={form.financement_fcfa}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        financement_fcfa: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Soldes (FCFA)</label>
                  <Input
                    type="number"
                    value={form.soldes_fcfa}
                    onChange={(e) =>
                      setForm({ ...form, soldes_fcfa: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold block mb-1">Observations</label>
                  <Input
                    value={form.observations}
                    onChange={(e) =>
                      setForm({ ...form, observations: e.target.value })
                    }
                    placeholder="Ex: CHARBON, RIZ..."
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={saving}
              onClick={() => void handleSave()}
              className="bg-[#006B2D] hover:bg-[#004D20] text-white"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
