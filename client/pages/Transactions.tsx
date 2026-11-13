import { OpenReportButton } from "@/components/reports/OpenReportExport";
import { WeeklyReportSection } from "@/components/reports/WeeklyReportSection";
import { PeriodSelector, type PeriodMode } from "@/components/reports/PeriodSelector";
import {
  currentReportPeriod,
  reportPeriod,
  buildReportFilename,
  buildReportTitle,
  formatBamakoDateTime,
} from "@/lib/report-periods";
import { fetchOpenReport } from "@/lib/open-report-data";
import { buildCsv, downloadCsv } from "@/lib/csv";
import {
  readRecordReference,
  writeRecordReference,
} from "@/lib/record-reference";
import { RecordForm } from "@/components/common/RecordForm";
import {
  SmartFilterBar,
  SmartFilterState,
  INITIAL_SMART_FILTER,
  applySmartFilter,
} from "@/components/common/SmartFilterBar";
import { useFormDraft } from "@/hooks/use-form-draft";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequireAuth, useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Plus,
  FileText,
  BarChart3,
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { CreatableSelect } from "@/components/ui/creatable-select";
import {
  DatePickerCustom,
  TimePickerCustom,
} from "@/components/ui/date-picker-custom";
import { ProofUploader } from "@/components/ui/proof-uploader";
import { exportStyledExcel } from "@/lib/excel-export";
import { exportStyledPDF } from "@/lib/pdf-export";
import {
  useTransactions,
  useLookups,
  useVenues,
} from "@/hooks/use-data-queries";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { parsePaymentReference, ParsedPaymentRef } from "@/lib/smart-parser";

import { Badge } from "@/components/ui/badge";

interface Transaction {
  id: string;
  date: string;
  time?: string;
  type: string;
  operator: string;
  platform?: string;
  support?: string;
  amount_fcfa: number;
  payment_operator?: string;
  phone?: string;
  proof_status?: string;
  proof_attachment_url?: string;
  venue_id?: string;
  reference?: string | null;
  notes?: string;
  created_by?: string;
  validation_status?: string;
  created_at?: string;
  updated_at?: string;
}

export default function TransactionsPage() {
  return (
    <RequireAuth>
      <Transactions />
    </RequireAuth>
  );
}

function Transactions() {
  const { user } = useAuth();
  // Centralisation TanStack React Query pour fluidité instantanée
  const {
    data: transactions = [],
    isLoading,
    isFetching,
    refetch,
  } = useTransactions();
  const { data: lookupsData } = useLookups();
  const { data: venuesData = [] } = useVenues();

  const [smartFilter, setSmartFilter] =
    useState<SmartFilterState>(INITIAL_SMART_FILTER);
  const [activeView, setActiveView] = useState<"list" | "report">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const initialExportPeriod = useMemo(() => currentReportPeriod(), []);
  const [exportPeriodMode, setExportPeriodMode] = useState<PeriodMode>("fixed");
  const [exportYear, setExportYear] = useState(initialExportPeriod.year);
  const [exportMonth, setExportMonth] = useState(initialExportPeriod.month);
  const [exportTranche, setExportTranche] = useState<number>(initialExportPeriod.tranche);
  const [exportStartDate, setExportStartDate] = useState(initialExportPeriod.start);
  const [exportEndDate, setExportEndDate] = useState(initialExportPeriod.end);
  const [exportBusy, setExportBusy] = useState(false);

  const selectedExportPeriod = useMemo(() => {
    try {
      return reportPeriod(exportYear, exportMonth, exportTranche);
    } catch {
      return null;
    }
  }, [exportYear, exportMonth, exportTranche]);

  const activeExportBounds = useMemo(() => {
    if (exportPeriodMode === "fixed") {
      if (!selectedExportPeriod) return null;
      return {
        mode: "fixed" as const,
        period: selectedExportPeriod,
        start: selectedExportPeriod.start,
        end: selectedExportPeriod.end,
        label: selectedExportPeriod.label,
      };
    }
    if (!exportStartDate || !exportEndDate || exportStartDate > exportEndDate) {
      return null;
    }
    return {
      mode: "custom" as const,
      period: null,
      start: exportStartDate,
      end: exportEndDate,
      label: `Du ${new Date(`${exportStartDate}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "Africa/Bamako" })} au ${new Date(`${exportEndDate}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "Africa/Bamako" })}`,
    };
  }, [exportPeriodMode, selectedExportPeriod, exportStartDate, exportEndDate]);

  // Listes déroulantes synchronisées depuis le cache
  const operators =
    lookupsData?.activeOperatorNames && lookupsData.activeOperatorNames.length > 0
      ? lookupsData.activeOperatorNames
      : lookupsData?.operatorNames || [];
  const platforms = lookupsData?.platformNames || [];
  const supports = lookupsData?.supportNames || [];
  const paymentOperators = lookupsData?.paymentOperatorNames || [];
  const venues = venuesData;

  // Assistance intelligente
  const [ticketRef, setTicketRef] = useState<string>("");
  const [parsedRef, setParsedRef] = useState<ParsedPaymentRef | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");

  // Formulaire
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    type: "Dépôt",
    operator: "",
    platform: "",
    support: "",
    amount_fcfa: 0,
    phone: "",
    payment_operator: "",
    proof_status: "non_renseignee" as
      | "disponible"
      | "non_disponible"
      | "non_renseignee",
    proof_attachment_url: "",
    notes: "",
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
    entityType: "transactions",
    recordId: editingTransaction?.id || "new",
    serverUpdatedAt: editingTransaction?.updated_at || editingTransaction?.created_at || editingTransaction?.date,
  });

  function handleTicketRefChange(val: string) {
    setTicketRef(val);
    const parsed = parsePaymentReference(val);
    setParsedRef(parsed);
    if (parsed.isValid) {
      setFormData((prev) => ({
        ...prev,
        time: parsed.time || prev.time,
        date: parsed.date || prev.date,
        type: parsed.type || prev.type,
      }));
    }
  }

  function handleVenueSelect(venueId: string) {
    setSelectedVenueId(venueId);
    if (!venueId) return;
    const v = venues.find((item) => item.id === venueId);
    if (v) {
      setFormData((prev) => ({
        ...prev,
        operator: v.operator || prev.operator,
        platform: prev.platform || "Site de test",
        notes: prev.notes
          ? `${prev.notes} (Salle: ${v.quartier} - ${v.address})`
          : `Salle: ${v.quartier} - ${v.address}`,
      }));
    }
  }

  async function createOperator(name: string) {
    const { error } = await supabase.from("operators").insert([{ name }]);

    if (error) {
      if (error.code === "23505") {
        toast.error("Cet opérateur existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }

    invalidateRelatedQueries("lookups");
    toast.success(`Opérateur "${name}" créé avec succès`);
  }

  async function createPlatform(name: string) {
    const { error } = await supabase.from("platforms").insert([{ name }]);

    if (error) {
      if (error.code === "23505") {
        toast.error("Cette plateforme existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }

    invalidateRelatedQueries("lookups");
    toast.success(`Plateforme "${name}" créée avec succès`);
  }

  async function createSupport(name: string) {
    const { error } = await supabase.from("supports").insert([{ name }]);

    if (error) {
      if (error.code === "23505") {
        toast.error("Ce support existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }

    invalidateRelatedQueries("lookups");
    toast.success(`Support "${name}" créé avec succès`);
  }

  async function createPaymentOperator(name: string) {
    const { error } = await supabase
      .from("payment_operators")
      .insert([{ name }]);

    if (error) {
      if (error.code === "23505") {
        toast.error("Cet opérateur de paiement existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }

    invalidateRelatedQueries("lookups");
    toast.success(`Opérateur de paiement "${name}" créé avec succès`);
  }

  function openDialog() {
    setEditingTransaction(null);
    setTicketRef("");
    setParsedRef(null);
    setSelectedVenueId("");
    setFormData({
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      type: "Dépôt",
      operator: operators[0] || "",
      platform: platforms[0] || "",
      support: supports[0] || "",
      amount_fcfa: 0,
      phone: "",
      payment_operator: paymentOperators[0] || "",
      proof_status: "non_renseignee",
      proof_attachment_url: "",
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(transaction: Transaction) {
    setEditingTransaction(transaction);
    const savedReference = readRecordReference(transaction);
    setTicketRef(savedReference.reference);
    setParsedRef(null);
    setSelectedVenueId(transaction.venue_id || "");
    setFormData({
      date: transaction.date,
      time: transaction.time || "",
      type: transaction.type,
      operator: transaction.operator,
      platform: transaction.platform || transaction.support || "",
      support: transaction.support || "",
      amount_fcfa: transaction.amount_fcfa,
      phone: transaction.phone || "",
      payment_operator: transaction.payment_operator || "",
      proof_status: (transaction.proof_status as any) || "non_renseignee",
      proof_attachment_url: transaction.proof_attachment_url || "",
      notes: savedReference.notes,
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (
      !formData.date ||
      !formData.type ||
      !formData.operator ||
      !formData.amount_fcfa
    ) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      const transactionData = {
        date: formData.date,
        time: formData.time || null,
        type: formData.type,
        operator: formData.operator,
        platform: formData.platform || formData.support || null,
        amount_fcfa: formData.amount_fcfa,
        phone: formData.phone.trim() || null,
        payment_operator: formData.payment_operator || null,
        proof_status: formData.proof_status,
        proof_attachment_url: formData.proof_attachment_url || null,
        ...writeRecordReference(ticketRef, formData.notes),
      };

      if (editingTransaction) {
        // Mode édition
        const { error } = await supabase
          .from("transactions")
          .update(transactionData)
          .eq("id", editingTransaction.id)
          .select("id")
          .single();

        if (error) throw error;
        toast.success("Transaction modifiée avec succès");
      } else {
        // Mode création
        const isAdmin = user?.role === "ADMIN";
        const newTransactionData = {
          ...transactionData,
          created_by: user?.id,
          validation_status: isAdmin ? "valide" : "en_attente",
        };

        const { error } = await supabase
          .from("transactions")
          .insert([newTransactionData]);

        if (error) throw error;

        toast.success(
          !isAdmin
            ? "Transaction enregistrée avec succès. En attente de validation du contrôleur."
            : "Transaction créée avec succès",
        );
      }

      clearDraftOnSuccess();
      setDialogOpen(false);
      setEditingTransaction(null);
      await refetch();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  const filteredTransactions = applySmartFilter(
    transactions,
    smartFilter,
    "transactions",
  );

  const stats = {
    depots: filteredTransactions
      .filter((t) => t.type === "Dépôt")
      .reduce((sum, t) => sum + t.amount_fcfa, 0),
    retraits: filteredTransactions
      .filter((t) => t.type === "Retrait")
      .reduce((sum, t) => sum + t.amount_fcfa, 0),
    totalDepots: filteredTransactions.filter((t) => t.type === "Dépôt").length,
    totalRetraits: filteredTransactions.filter((t) => t.type === "Retrait")
      .length,
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("fr-FR").format(amount) + " F CFA";
  };

  const filterTxByPeriod = (txs: Transaction[]) => {
    if (!activeExportBounds) return [];
    const { start, end } = activeExportBounds;
    return txs.filter((tx) => {
      const d = (tx.date || "").slice(0, 10);
      return d >= start && d <= end;
    });
  };

  const resolvePaginatedExportTransactions = async (
    bounds: NonNullable<typeof activeExportBounds>,
  ): Promise<Transaction[]> => {
    if (bounds.mode === "fixed" && bounds.period) {
      const txType =
        smartFilter.secondaryType === "Dépôt" || smartFilter.secondaryType === "Retrait"
          ? smartFilter.secondaryType
          : undefined;
      const snapshot = await fetchOpenReport(supabase, {
        period: bounds.period,
        scope: "transactions",
        transactionType: txType,
      });
      return applySmartFilter(
        snapshot.transactions as unknown as Transaction[],
        smartFilter,
        "transactions",
      );
    }
    return filteredTransactions.filter((tx) => {
      const d = (tx.date || "").slice(0, 10);
      return d >= bounds.start && d <= bounds.end;
    });
  };

  const handleExportExcel = async () => {
    if (!activeExportBounds) {
      toast.error("Veuillez sélectionner une période valide");
      return;
    }
    const frozenBounds = structuredClone(activeExportBounds);
    setExportBusy(true);
    try {
      toast.loading("Lecture des données et génération Excel...", {
        id: "tx-excel",
      });
      const rows = await resolvePaginatedExportTransactions(frozenBounds);
      if (rows.length === 0) {
        toast.info("Aucune transaction à exporter pour cette période", {
          id: "tx-excel",
        });
        return;
      }
      const columns = [
        { header: "N°", key: "index", width: 7, align: "center" as const },
        { header: "DATE", key: "date", width: 14, align: "center" as const },
        {
          header: "Opérateur de jeux",
          key: "operator",
          width: 20,
          align: "left" as const,
        },
        {
          header: "Plateforme",
          key: "platform",
          width: 16,
          align: "center" as const,
        },
        {
          header: "Opérateur de paiement",
          key: "payment_operator",
          width: 18,
          align: "center" as const,
        },
        {
          header: "Type",
          key: "type",
          width: 14,
          align: "center" as const,
          isStatus: true,
        },
        {
          header: "Montant F CFA",
          key: "amount_fcfa",
          width: 18,
          align: "right" as const,
          isCurrency: true,
        },
        { header: "Heure", key: "time", width: 10, align: "center" as const },
        {
          header: "Numéro de téléphone",
          key: "phone",
          width: 18,
          align: "center" as const,
        },
        {
          header: "Référence",
          key: "reference",
          width: 26,
          align: "left" as const,
        },
        {
          header: "preuve",
          key: "proof_status",
          width: 14,
          align: "center" as const,
        },
        {
          header: "Statut",
          key: "validation_status",
          width: 14,
          align: "center" as const,
          isStatus: true,
        },
      ];

      const data = rows.map((tx, idx) => ({
        index: idx + 1,
        date: tx.date?.slice(0, 10) || "",
        operator: tx.operator,
        platform: tx.platform || tx.support || "—",
        payment_operator: tx.payment_operator || "—",
        type: tx.type,
        amount_fcfa: Number(tx.amount_fcfa) || 0,
        time: tx.time || "—",
        phone: tx.phone || "—",
        reference: readRecordReference(tx).reference || tx.notes || "—",
        proof_status: tx.proof_attachment_url
          ? "Oui"
          : tx.proof_status === "disponible"
            ? "Disponible"
            : tx.proof_status === "non_disponible"
              ? "Non dispo"
              : "Non renseig.",
        validation_status:
          tx.validation_status === "valide"
            ? "Validé"
            : tx.validation_status === "refuse"
              ? "Refusé"
              : "En attente",
      }));

      await exportStyledExcel({
        sheetName: "Transactions",
        title: buildReportTitle("Rapport des transactions", frozenBounds.label),
        subtitle: `Généré le ${formatBamakoDateTime()} (Africa/Bamako) • ${smartFilter.secondaryType ? `Type : ${smartFilter.secondaryType}` : "Dépôts & Retraits"}`,
        periodText: `${frozenBounds.label} (${frozenBounds.start} → ${frozenBounds.end})`,
        columns,
        data,
        filename: buildReportFilename(
          "transactions",
          frozenBounds.start,
          frozenBounds.end,
          "xlsx",
        ),
        showTotals: true,
      });
      toast.success(
        `${rows.length} transaction(s) exportée(s) en Excel`,
        { id: "tx-excel" },
      );
      setExportDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de l'export Excel",
        { id: "tx-excel" },
      );
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportPDF = async () => {
    if (!activeExportBounds) {
      toast.error("Veuillez sélectionner une période valide");
      return;
    }
    const frozenBounds = structuredClone(activeExportBounds);
    setExportBusy(true);
    try {
      toast.loading("Lecture des données et génération PDF...", { id: "tx-pdf" });
      const rows = await resolvePaginatedExportTransactions(frozenBounds);
      if (rows.length === 0) {
        toast.info("Aucune transaction à exporter pour cette période", {
          id: "tx-pdf",
        });
        return;
      }
      const columns = [
        { header: "N°", key: "index", align: "center" as const },
        { header: "DATE", key: "date", align: "center" as const },
        { header: "HEURE", key: "time", align: "center" as const },
        { header: "TYPE", key: "type", align: "center" as const, isStatus: true },
        { header: "OPÉRATEUR", key: "operator", align: "left" as const },
        { header: "PLATEFORME", key: "support", align: "center" as const },
        {
          header: "MONTANT",
          key: "amount_fcfa",
          align: "right" as const,
          isCurrency: true,
        },
        {
          header: "STATUT",
          key: "validation_status",
          align: "center" as const,
          isStatus: true,
        },
        { header: "RÉFÉRENCE", key: "notes", align: "left" as const },
      ];

      const data = rows.map((tx, idx) => ({
        index: idx + 1,
        date: tx.date?.slice(0, 10) || "",
        time: tx.time || "—",
        type: tx.type,
        operator: tx.operator,
        support: tx.platform || tx.support || "—",
        amount_fcfa: Number(tx.amount_fcfa) || 0,
        validation_status:
          tx.validation_status === "valide"
            ? "Validé"
            : tx.validation_status === "refuse"
              ? "Refusé"
              : "En attente",
        notes: readRecordReference(tx).reference || tx.notes || "—",
      }));

      await exportStyledPDF({
        title: buildReportTitle("Rapport des transactions", frozenBounds.label),
        subtitle: `Généré le ${formatBamakoDateTime()} (Africa/Bamako) • ${rows.length} transaction(s)`,
        periodText: `${frozenBounds.label} (${frozenBounds.start} → ${frozenBounds.end})`,
        columns,
        data,
        filename: buildReportFilename(
          "transactions",
          frozenBounds.start,
          frozenBounds.end,
          "pdf",
        ),
        showTotals: true,
        orientation: "landscape",
      });
      toast.success(
        `${rows.length} transaction(s) exportée(s) en PDF`,
        { id: "tx-pdf" },
      );
      setExportDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de l'export PDF",
        { id: "tx-pdf" },
      );
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportCSV = async () => {
    if (!activeExportBounds) {
      toast.error("Veuillez sélectionner une période valide");
      return;
    }
    const frozenBounds = structuredClone(activeExportBounds);
    setExportBusy(true);
    try {
      toast.loading("Lecture des données et génération CSV...", { id: "tx-csv" });
      const rows = await resolvePaginatedExportTransactions(frozenBounds);
      if (rows.length === 0) {
        toast.info("Aucune transaction à exporter pour cette période", {
          id: "tx-csv",
        });
        return;
      }
      const csvCols = [
        "Référence",
        "Date",
        "Heure",
        "Opérateur",
        "Plateforme",
        "Moyen de paiement",
        "Type",
        "Montant (F CFA)",
        "Téléphone",
        "Validation",
        "Notes",
      ];
      const csvRows = rows.map((tx) => ({
        Référence: readRecordReference(tx).reference || tx.id,
        Date: tx.date?.slice(0, 10) || "",
        Heure: tx.time || "",
        Opérateur: tx.operator || "",
        Plateforme: tx.platform || tx.support || "",
        "Moyen de paiement": tx.payment_operator || "",
        Type: tx.type || "",
        "Montant (F CFA)": Number(tx.amount_fcfa) || 0,
        Téléphone: tx.phone || "",
        Validation:
          tx.validation_status === "valide"
            ? "Validé"
            : tx.validation_status === "refuse"
              ? "Refusé"
              : "En attente",
        Notes: tx.notes || "",
      }));
      downloadCsv(
        buildReportFilename(
          "transactions",
          frozenBounds.start,
          frozenBounds.end,
          "csv",
        ),
        buildCsv(csvRows, csvCols),
      );
      toast.success(
        `${rows.length} transaction(s) exportée(s) en CSV`,
        { id: "tx-csv" },
      );
      setExportDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de l'export CSV",
        { id: "tx-csv" },
      );
    } finally {
      setExportBusy(false);
    }
  };

  if (isLoading && transactions.length === 0) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Chargement...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#D8E6DB]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#17251C]">
              Dépôts &amp; Retraits
            </h1>
            <p className="text-xs sm:text-sm text-[#556B5C] mt-1">
              Historique et pilotage des flux financiers de dépôts et retraits
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <div className="inline-flex rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] p-1">
              <button
                type="button"
                onClick={() => setActiveView("list")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeView === "list"
                    ? "bg-[#006B2D] text-white"
                    : "text-[#556B5C] hover:text-[#17251C]"
                }`}
              >
                Opérations
              </button>
              <button
                type="button"
                onClick={() => setActiveView("report")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeView === "report"
                    ? "bg-[#006B2D] text-white"
                    : "text-[#556B5C] hover:text-[#17251C]"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Rapport Hebdo &amp; Graphe</span>
              </button>
            </div>
            <Button
              onClick={openDialog}
              className="h-10 gap-2 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              <Plus className="h-4 w-4 text-[#FFD000]" />
              <span>Nouveau Dépôt / Retrait</span>
            </Button>
          </div>
        </div>

        {activeView === "report" ? (
          <WeeklyReportSection />
        ) : (
          <>

        {/* Barre de recherche et filtres intelligents */}
        <div className="p-4 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs space-y-3">
          <SmartFilterBar
            mode="transactions"
            filter={smartFilter}
            onChange={setSmartFilter}
            operators={operators}
            platformsOrSupports={platforms}
            paymentOperators={paymentOperators}
            secondaryOptions={["Dépôt", "Retrait"]}
            totalCount={transactions.length}
            filteredCount={filteredTransactions.length}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2ECE4]">
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="h-9 text-xs font-bold text-[#17251C] border-[#D8E6DB] hover:bg-[#F5F8F5] rounded-xl gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-[#006B2D]" : ""}`}
              />
              <span>Actualiser</span>
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <OpenReportButton />
              <Button
                onClick={() => setExportDialogOpen(true)}
                className="h-9 text-xs font-bold bg-[#006B2D] hover:bg-[#004D20] text-white rounded-xl gap-1.5 shadow-xs"
              >
                <Download className="h-4 w-4 text-[#FFD000]" />
                <span>Exporter</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Statistiques Bento KPIs synchronisées */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                Total Dépôts
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#EBF7EE] text-[#006B2D] flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-[#006B2D]">
                {formatAmount(stats.depots)}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] font-semibold text-[#556B5C]">
                  {stats.totalDepots} opération(s)
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                Total Retraits
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#FEECEB] text-[#E52329] flex items-center justify-center">
                <TrendingDown className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-[#E52329]">
                {formatAmount(stats.retraits)}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] font-semibold text-[#556B5C]">
                  {stats.totalRetraits} opération(s)
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                Solde Net
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#F5F8F5] text-[#17251C] flex items-center justify-center border border-[#D8E6DB]">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p
                className={`text-2xl font-extrabold ${
                  stats.depots - stats.retraits >= 0
                    ? "text-[#006B2D]"
                    : "text-[#E52329]"
                }`}
              >
                {formatAmount(stats.depots - stats.retraits)}
              </p>
              <span className="text-[11px] font-semibold text-[#556B5C]">
                Flux net conservé
              </span>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                Total Transactions
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#F5F8F5] text-[#17251C] flex items-center justify-center border border-[#D8E6DB]">
                <span className="text-xs font-bold font-mono">#</span>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-[#17251C]">
                {filteredTransactions.length}
              </p>
              <span className="text-[11px] font-semibold text-[#556B5C]">
                Sur la sélection
              </span>
            </div>
          </div>
        </div>

        {/* Vue Cartes Responsive (Mobile) */}
        <div className="block md:hidden space-y-3">
          {filteredTransactions.length > 0 ? (
            filteredTransactions.map((tx) => (
              <div
                key={tx.id}
                onClick={() => openEditDialog(tx)}
                className="p-4 rounded-xl border border-[#D8E6DB] bg-white shadow-xs active:bg-[#F5F8F5] transition-colors cursor-pointer space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                    style={{
                      backgroundColor:
                        tx.type === "Dépôt" ? "#EBF7EE" : "#FEECEB",
                      borderColor: tx.type === "Dépôt" ? "#86EFAC" : "#F87171",
                      color: tx.type === "Dépôt" ? "#006B2D" : "#E52329",
                    }}
                  >
                    {tx.type === "Dépôt" ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    <span>{tx.type}</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#556B5C]">
                    {new Date(tx.date).toLocaleDateString("fr-FR")}{" "}
                    {tx.time || ""}
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <div>
                    <h4 className="text-sm font-extrabold text-[#17251C]">
                      {tx.operator}
                    </h4>
                    <p className="text-xs text-[#556B5C]">
                      {tx.support || "Support non précisé"}
                    </p>
                  </div>
                  <div
                    className={`text-lg font-black font-mono ${
                      tx.type === "Dépôt" ? "text-[#006B2D]" : "text-[#E52329]"
                    }`}
                  >
                    {tx.type === "Dépôt" ? "+" : "-"}
                    {formatAmount(tx.amount_fcfa)}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E2ECE4] flex flex-wrap items-center justify-between gap-1.5 text-xs text-[#556B5C]">
                  <div className="flex items-center gap-2">
                    {tx.payment_operator && (
                      <span className="font-semibold text-[#17251C]">
                        {tx.payment_operator}
                      </span>
                    )}
                    {tx.phone && (
                      <span className="font-mono text-[11px] bg-[#F5F8F5] px-1.5 py-0.5 rounded border border-[#D8E6DB]">
                        {tx.phone}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {tx.proof_status === "disponible" ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-[#EBF7EE] text-[#006B2D] border-[#86EFAC]"
                      >
                        Preuve reçue
                      </Badge>
                    ) : tx.proof_status === "non_disponible" ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-[#FEECEB] text-[#E52329] border-[#F87171]"
                      >
                        Sans preuve
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold ${
                        tx.validation_status === "valide"
                          ? "bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30"
                          : tx.validation_status === "refuse"
                            ? "bg-[#E52329]/10 text-[#E52329] border-[#E52329]/30"
                            : "bg-[#FFD000]/20 text-[#004D20] border-[#FFD000]/50"
                      }`}
                    >
                      {tx.validation_status === "valide"
                        ? "Validé"
                        : tx.validation_status === "refuse"
                          ? "Refusé"
                          : "En attente"}
                    </Badge>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-[#556B5C] bg-white rounded-xl border border-[#D8E6DB]">
              Aucune transaction trouvée
            </div>
          )}
        </div>

        {/* Tableau (Desktop) */}
        <div className="hidden md:block rounded-2xl border border-[#D8E6DB] bg-white shadow-xs overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#F5F8F5] border-b border-[#D8E6DB]">
              <TableRow>
                <TableHead className="text-xs font-bold text-[#17251C] w-12 text-center">
                  N°
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  DATE
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Opérateur de jeux
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Plateforme
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Opérateur de paiement
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Type
                </TableHead>
                <TableHead className="text-right text-xs font-bold text-[#17251C]">
                  Montant F CFA
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Heure
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Numéro de téléphone
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Référence
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Preuve
                </TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">
                  Statut
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx, idx) => (
                  <TableRow
                    key={tx.id}
                    className="cursor-pointer hover:bg-[#F5F8F5] transition-colors border-b border-[#E2ECE4]"
                    onClick={() => openEditDialog(tx)}
                  >
                    <TableCell className="text-xs font-mono text-center text-[#556B5C]">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-[#17251C] whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-[#17251C]">
                      {tx.operator}
                    </TableCell>
                    <TableCell className="text-xs text-[#17251C]">
                      {tx.platform || tx.support || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-[#17251C]">
                      {tx.payment_operator || "—"}
                    </TableCell>
                    <TableCell>
                      <div
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                        style={{
                          backgroundColor:
                            tx.type === "Dépôt" ? "#EBF7EE" : "#FEECEB",
                          borderColor:
                            tx.type === "Dépôt" ? "#86EFAC" : "#F87171",
                          color: tx.type === "Dépôt" ? "#006B2D" : "#E52329",
                        }}
                      >
                        {tx.type === "Dépôt" ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span>{tx.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold whitespace-nowrap">
                      <span
                        className={
                          tx.type === "Dépôt"
                            ? "text-[#006B2D]"
                            : "text-[#E52329]"
                        }
                      >
                        {tx.type === "Dépôt" ? "+" : "-"}
                        {formatAmount(tx.amount_fcfa)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-[#556B5C] whitespace-nowrap">
                      {tx.time || "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-[#17251C] whitespace-nowrap">
                      {tx.phone || "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs font-mono text-[#556B5C]">
                      {readRecordReference(tx).reference || tx.notes || "—"}
                    </TableCell>
                    <TableCell>
                      {tx.proof_attachment_url ? (
                        <a
                          href={tx.proof_attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#EBF7EE] text-[#006B2D] border border-[#86EFAC] hover:bg-[#D1FAE5] transition-colors"
                          title="Consulter le fichier de preuve R2"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Preuve</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : tx.proof_status === "disponible" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EBF7EE] text-[#006B2D] border border-[#86EFAC]">
                          Dispo
                        </span>
                      ) : tx.proof_status === "non_disponible" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEECEB] text-[#E52329] border border-[#F87171]">
                          Non dispo
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#556B5C]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-bold ${
                          tx.validation_status === "valide"
                            ? "bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30"
                            : tx.validation_status === "refuse"
                              ? "bg-[#E52329]/10 text-[#E52329] border-[#E52329]/30"
                              : "bg-[#FFD000]/20 text-[#004D20] border-[#FFD000]/50"
                        }`}
                      >
                        {tx.validation_status === "valide"
                          ? "Validé"
                          : tx.validation_status === "refuse"
                            ? "Refusé"
                            : "En attente"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="text-center text-sm text-[#556B5C] py-12"
                  >
                    Aucun dépôt ou retrait trouvé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          Affichage de {filteredTransactions.length} opérations sur{" "}
          {transactions.length} au total
        </div>
          </>
        )}
      </div>

      {/* Dialog de création */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#17251C]">
              {editingTransaction
                ? "Consulter le dépôt / retrait"
                : "Nouveau dépôt ou retrait"}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#5C7363]">
              {editingTransaction
                ? "Détails et modifications de l'opération financière enregistrée."
                : "Saisie d'une nouvelle opération de dépôt ou de retrait."}
            </DialogDescription>
          </DialogHeader>

          <RecordForm
            key={`${dialogOpen}-${editingTransaction?.id || "new"}`}
            existing={!!editingTransaction}
            onSave={handleSubmit}
            onClose={() => setDialogOpen(false)}
            onRestore={() => openEditDialog(editingTransaction!)}
            createLabel="Enregistrer l'opération"
            hasDraft={hasDraft}
            draftTime={savedAtFormatted}
            hasConflict={hasConflict}
            onRestoreDraft={restoreDraft}
            onDiscardDraft={discardDraft}
            draftSaveStatus={saveStatus}
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-2 [&_input]:min-w-0 [&_select]:min-w-0">
              {/* 1. DATE & Opérateur de jeux */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DatePickerCustom
                  label="DATE"
                  required
                  value={formData.date}
                  onChange={(val) => setFormData({ ...formData, date: val })}
                />
                <CreatableSelect
                  label="Opérateur de jeux"
                  required
                  value={formData.operator}
                  onChange={(value) =>
                    setFormData({ ...formData, operator: value })
                  }
                  options={operators}
                  placeholder="Ex: 1XBET, BET223, PREMIERBET, MALIBET..."
                  onCreateNew={createOperator}
                />
              </div>

              {/* 2. Plateforme & Opérateur de paiement */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CreatableSelect
                  label="Plateforme"
                  value={formData.platform}
                  onChange={(value) =>
                    setFormData({ ...formData, platform: value })
                  }
                  options={platforms}
                  placeholder="App mobile, Web, USSD..."
                  onCreateNew={createPlatform}
                />
                <CreatableSelect
                  label="Opérateur de paiement"
                  value={formData.payment_operator}
                  onChange={(value) =>
                    setFormData({ ...formData, payment_operator: value })
                  }
                  options={paymentOperators}
                  placeholder="Orange Money, Moov, Wave, Espèces..."
                  onCreateNew={createPaymentOperator}
                />
              </div>

              {/* 3. Type & Montant F CFA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                    Type *
                  </label>
                  <select
                    className="w-full border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value })
                    }
                  >
                    <option value="Dépôt">Dépôt (Entrée)</option>
                    <option value="Retrait">Retrait (Sortie)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                    Montant F CFA *
                  </label>
                  <Input
                    type="number"
                    value={formData.amount_fcfa || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        amount_fcfa: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                    className="bg-white border-[#D8E6DB] font-semibold"
                  />
                </div>
              </div>

              {/* 4. Heure & Numéro de téléphone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TimePickerCustom
                  label="Heure"
                  value={formData.time}
                  onChange={(val) => setFormData({ ...formData, time: val })}
                />
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                    Numéro de téléphone
                  </label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="Ex: 70123456"
                    className="bg-white border-[#D8E6DB]"
                  />
                </div>
              </div>

              {/* 5. Référence (avec analyse intelligente SMS Mobile Money) */}
              <div className="p-3 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#17251C] flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#006B2D]" />
                    Référence (SMS Mobile Money)
                  </span>
                  <span className="text-[10px] text-[#556B5C]">
                    Orange Money / Wave / Moov
                  </span>
                </div>
                <Input
                  placeholder="Ex: MP250326.0415.A49647 ou CI250326.0438.B13742"
                  value={ticketRef}
                  onChange={(e) => handleTicketRefChange(e.target.value)}
                  className="h-9 text-xs bg-white border-[#D8E6DB] text-[#17251C]"
                />
                {parsedRef?.isValid && (
                  <div className="flex items-center gap-2 text-xs text-[#006B2D] font-bold bg-[#006B2D]/10 p-2 rounded-lg border border-[#006B2D]/20">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#006B2D]" />
                    <span>{parsedRef.message}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                    Disponibilité de la preuve
                  </label>
                  <select
                    className="w-full border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
                    value={formData.proof_status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        proof_status: e.target.value as any,
                      })
                    }
                  >
                    <option value="non_renseignee">Non renseignée</option>
                    <option value="disponible">
                      Preuve disponible (Reçu/SMS)
                    </option>
                    <option value="non_disponible">Preuve non disponible</option>
                  </select>
                </div>

                {(formData.proof_status === "disponible" || formData.proof_attachment_url) && (
                  <ProofUploader
                    value={formData.proof_attachment_url}
                    onChange={(url) =>
                      setFormData((prev) => ({
                        ...prev,
                        proof_attachment_url: url || "",
                        proof_status: url ? "disponible" : prev.proof_status,
                      }))
                    }
                    proofStatus={formData.proof_status}
                    onStatusChange={(status) =>
                      setFormData((prev) => ({ ...prev, proof_status: status }))
                    }
                    folder="preuves"
                  />
                )}
              </div>

              {/* SÉLECTEUR EN CASCADE DES SALLES DE JEUX PHYSIQUES */}
              {["Salle de jeux", "Site de test"].includes(formData.support) && venues.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                    Point de Vente Physique ({venues.length}  sites
                    répertoriées)
                  </label>
                  <select
                    className="w-full border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-xs text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
                    value={selectedVenueId}
                    onChange={(e) => handleVenueSelect(e.target.value)}
                  >
                    <option value="">

                      -- Choisir un site de test enregistrée --
                    </option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.quartier} • {v.operator} • {v.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                  Notes / Observations
                </label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Détails du paiement, guichet, motif..."
                  rows={2}
                  className="bg-white border-[#D8E6DB]"
                />
              </div>
            </div>
          </RecordForm>
        </DialogContent>
      </Dialog>

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(open) => {
          if (!exportBusy) setExportDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Exporter le Rapport des Transactions
            </DialogTitle>
            <DialogDescription>
              Sélectionnez une tranche mensuelle fixe ou une période personnalisée.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <PeriodSelector
              year={exportYear}
              month={exportMonth}
              tranche={exportTranche}
              onYearChange={setExportYear}
              onMonthChange={setExportMonth}
              onTrancheChange={setExportTranche}
              mode={exportPeriodMode}
              onModeChange={setExportPeriodMode}
              allowCustomMode
              customStart={exportStartDate}
              customEnd={exportEndDate}
              onCustomStartChange={setExportStartDate}
              onCustomEndChange={setExportEndDate}
              disabled={exportBusy}
            />

            <div className="bg-[#F5F8F5] p-3.5 rounded-xl border border-[#D8E6DB] text-xs space-y-1">
              <p className="font-semibold text-[#17251C]">
                Aperçu local (selon filtres actifs) :
              </p>
              <p className="text-[#556B5C]">
                <span className="font-bold text-[#17251C]">
                  {filterTxByPeriod(filteredTransactions).length}
                </span>{" "}
                transaction(s) affichées localement sur la période.
                {exportPeriodMode === "fixed" &&
                  " L’export interroge l’intégralité de la base paginée selon vos droits."}
              </p>
              {smartFilter.secondaryType && (
                <p className="text-[#556B5C]">
                  Filtre Type actif :{" "}
                  <span className="font-bold text-[#17251C]">
                    {smartFilter.secondaryType}
                  </span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                disabled={exportBusy}
                onClick={() => setExportDialogOpen(false)}
                className="min-h-11"
              >
                Annuler
              </Button>
              <Button
                variant="outline"
                disabled={exportBusy || !activeExportBounds}
                onClick={() => void handleExportCSV()}
                className="min-h-11 gap-1.5 border-[#D8E6DB] text-[#17251C] hover:bg-[#F5F8F5] font-semibold"
              >
                <FileText className="h-4 w-4 text-[#556B5C]" />
                CSV (.csv)
              </Button>
              <Button
                variant="outline"
                disabled={exportBusy || !activeExportBounds}
                onClick={() => void handleExportPDF()}
                className="min-h-11 gap-1.5 border-[#006B2D]/30 text-[#006B2D] hover:bg-[#E8F3EC] font-semibold"
              >
                <FileText className="h-4 w-4 text-[#006B2D]" />
                PDF (.pdf)
              </Button>
              <Button
                disabled={exportBusy || !activeExportBounds}
                onClick={() => void handleExportExcel()}
                className="min-h-11 gap-1.5 bg-[#006B2D] hover:bg-[#004D20] text-white font-semibold"
              >
                <Download className="h-4 w-4 text-[#FFD000]" />
                {exportBusy ? "Génération..." : "Excel (.xlsx)"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
