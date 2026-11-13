import { OpenReportButton } from "@/components/reports/OpenReportExport";
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
import { HISTORICAL_RESULT_NOTICE } from "@/lib/test-vocabulary";
import { testStatusLabel, testCatalogLabel } from "@/lib/test-vocabulary";
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Plus,
  Download,
  Settings,
  RefreshCw,
  ClipboardCheck,
  Coins,
  ArrowUpRight,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  LayoutGrid,
  List,
  Eye,
  ChevronLeft,
  ChevronRight,
  Filter,
  FileText,
  ExternalLink,
} from "lucide-react";
import { exportStyledExcel } from "@/lib/excel-export";
import { exportStyledPDF } from "@/lib/pdf-export";
import {
  useBets,
  useCreateBet,
  useUpdateBet,
  useLookups,
  useVenues,
} from "@/hooks/use-data-queries";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { parsePaymentReference, ParsedPaymentRef } from "@/lib/smart-parser";
import { Sparkles, Building, Zap } from "lucide-react";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DateTimeRow, DatePickerCustom } from "@/components/ui/date-picker-custom";
import { ProofUploader } from "@/components/ui/proof-uploader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface Bet {
  id: string;
  date: string;
  time?: string;
  operator: string;
  support: string;
  bet_type: string;
  amount_fcfa: number;
  status: string;
  amount_won_fcfa?: number;
  phone?: string;
  proof_status?: string;
  ticket_url?: string;
  proof_attachment_url?: string;
  venue_id?: string;
  reference?: string | null;
  notes?: string;
  created_by?: string;
  validation_status?: string;
  created_at?: string;
  updated_at?: string;
}

export default function TestsPage() {
  return (
    <RequireAuth>
      <Tests />
    </RequireAuth>
  );
}

function Tests() {
  const { user } = useAuth();
  // Centralisation TanStack React Query pour navigation instantanée
  const { data: bets = [], isLoading, isFetching, refetch } = useBets();
  const { data: lookupsData } = useLookups();
  const { data: venuesData = [] } = useVenues();
  const createBetMutation = useCreateBet();
  const updateBetMutation = useUpdateBet();

  const [smartFilter, setSmartFilter] =
    useState<SmartFilterState>(INITIAL_SMART_FILTER);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBet, setEditingBet] = useState<Bet | null>(null);
  const [activeOperator, setActiveOperator] = useState<string>("all");
  const [hiddenOperators, setHiddenOperators] = useState<Set<string>>(
    new Set(),
  );
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

  // Listes déroulantes synchronisées depuis le cache React Query
  const operators =
    lookupsData?.activeOperatorNames && lookupsData.activeOperatorNames.length > 0
      ? lookupsData.activeOperatorNames
      : lookupsData?.operatorNames || [];
  const supports = lookupsData?.supportNames || [];
  const betTypes = lookupsData?.betTypeNames || [];
  const venues = venuesData;

  // Assistance intelligente & Rapprochement
  const [ticketRef, setTicketRef] = useState<string>("");
  const [parsedRef, setParsedRef] = useState<ParsedPaymentRef | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [autoCreateTransaction, setAutoCreateTransaction] = useState(true);

  // Formulaire
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    operator: "",
    support: "",
    bet_type: "",
    amount_fcfa: 0,
    phone: "",
    proof_status: "non_renseignee" as string,
    ticket_url: "",
    status: "en attente",
    amount_won_fcfa: 0,
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
    entityType: "bets",
    recordId: editingBet?.id || "new",
    serverUpdatedAt: editingBet?.updated_at || editingBet?.created_at || editingBet?.date,
  });

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

  async function createBetType(name: string) {
    const { error } = await supabase.from("bet_types").insert([{ name }]);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce type de test existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }
    invalidateRelatedQueries("lookups");
    toast.success(`Type de test "${name}" créé avec succès`);
  }

  function handleTicketRefChange(val: string) {
    setTicketRef(val);
    const parsed = parsePaymentReference(val);
    setParsedRef(parsed);
    if (parsed.isValid) {
      setFormData((prev) => ({
        ...prev,
        time: parsed.time || prev.time,
        date: parsed.date || prev.date,
        status: parsed.type === "Retrait" ? "gagné" : prev.status,
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
        support: "Site de test",
        notes: prev.notes
          ? `${prev.notes} (Salle: ${v.quartier} - ${v.address})`
          : `Salle: ${v.quartier} - ${v.address}`,
      }));
    }
  }

  function openDialog() {
    setEditingBet(null);
    setTicketRef("");
    setParsedRef(null);
    setSelectedVenueId("");
    setAutoCreateTransaction(true);
    setFormData({
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      operator: operators[0] || "",
      support: supports[0] || "",
      bet_type: betTypes[0] || "",
      amount_fcfa: 0,
      phone: "",
      proof_status: "non_renseignee",
      ticket_url: "",
      status: "en attente",
      amount_won_fcfa: 0,
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(bet: Bet) {
    setEditingBet(bet);
    const savedReference = readRecordReference(bet);
    setTicketRef(savedReference.reference);
    setParsedRef(null);
    setSelectedVenueId(bet.venue_id || "");
    setAutoCreateTransaction(false);
    setFormData({
      date: bet.date,
      time: bet.time || "",
      operator: bet.operator,
      support: bet.support,
      bet_type: bet.bet_type,
      amount_fcfa: bet.amount_fcfa,
      phone: bet.phone || "",
      proof_status:
        (bet.proof_status as
          | "disponible"
          | "non_disponible"
          | "non_renseignee") || (bet.ticket_url ? "disponible" : "non_renseignee"),
      ticket_url: bet.ticket_url || bet.proof_attachment_url || "",
      status: bet.status,
      amount_won_fcfa: bet.amount_won_fcfa || 0,
      notes: savedReference.notes,
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (
      !formData.date ||
      !formData.operator ||
      !formData.bet_type ||
      !formData.amount_fcfa
    ) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      const betData = {
        ...formData,
        amount_won_fcfa: formData.amount_won_fcfa || null,
        ticket_url: formData.ticket_url || null,
        proof_attachment_url: formData.ticket_url || null,
        ...writeRecordReference(ticketRef, formData.notes),
      };

      if (editingBet) {
        const { error } = await supabase
          .from("bets")
          .update(betData)
          .eq("id", editingBet.id)
          .select("id")
          .single();

        if (error) throw error;
        toast.success("Test modifié avec succès");
      } else {
        const isAdmin = user?.role === "ADMIN";
        const newBetData = {
          ...betData,
          created_by: user?.id,
          validation_status: isAdmin ? "valide" : "en_attente",
        };

        const { error } = await supabase.from("bets").insert([newBetData]);
        if (error) throw error;

        // AUTOMATISATION ANTI-DOUBLE SAISIE : Génération automatique du flux financier lié
        if (autoCreateTransaction && formData.amount_fcfa > 0) {
          try {
            const transType = formData.status === "gagné" ? "Retrait" : "Dépôt";
            const transAmount =
              formData.status === "gagné" && formData.amount_won_fcfa
                ? formData.amount_won_fcfa
                : formData.amount_fcfa;

            const newTransaction = {
              date: formData.date,
              time: formData.time || null,
              type: transType,
              operator: formData.operator,
              platform: formData.support || "App mobile",
              payment_operator: "Orange",
              amount_fcfa: transAmount,
              notes: ticketRef
                ? `Flux lié au justificatif [${ticketRef.trim()}] (${formData.bet_type})`
                : `Flux généré automatiquement depuis le test (${formData.bet_type})`,
              created_by: user?.id,
              validation_status: isAdmin ? "valide" : "en_attente",
            };

            await supabase.from("transactions").insert([newTransaction]);
          } catch (transErr) {
            console.warn("Création automatique transaction liée:", transErr);
          }
        }

        toast.success(
          !isAdmin
            ? "Test enregistré avec succès. Transmis au contrôleur en attente de validation."
            : autoCreateTransaction
              ? "Test et transaction financière liée créés avec succès."
              : "Test créé avec succès.",
        );
      }

      clearDraftOnSuccess();
      setDialogOpen(false);
      setEditingBet(null);
      await refetch();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  // Filtered bets with multi-faceted smart criteria
  const filteredBets = useMemo(() => {
    const base = applySmartFilter(bets, smartFilter, "tests");
    if (statusFilter === "all") return base;
    return base.filter((bet) => {
      const st = bet.status.toLowerCase();
      if (statusFilter === "won") return st.includes("gagn") || st === "won";
      if (statusFilter === "lost") return st === "perdu" || st === "lost";
      if (statusFilter === "pending")
        return st.includes("attente") || st === "pending";
      return true;
    });
  }, [bets, smartFilter, statusFilter]);

  // Compute High-Density KPI Metrics
  const statsSummary = useMemo(() => {
    let totalMise = 0;
    let totalGains = 0;
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;

    filteredBets.forEach((b) => {
      totalMise += Number(b.amount_fcfa) || 0;
      const st = (b.status || "").toLowerCase();
      if (st.includes("gagn") || st === "won") {
        wonCount++;
        totalGains += Number(b.amount_won_fcfa) || 0;
      } else if (st === "perdu" || st === "lost") {
        lostCount++;
      } else {
        pendingCount++;
      }
    });

    const netPlatformMargin = totalMise - totalGains;
    const winRate =
      filteredBets.length > 0
        ? Math.round((wonCount / filteredBets.length) * 100)
        : 0;
    const avgBet =
      filteredBets.length > 0 ? Math.round(totalMise / filteredBets.length) : 0;

    return {
      totalMise,
      totalGains,
      wonCount,
      lostCount,
      pendingCount,
      netPlatformMargin,
      winRate,
      avgBet,
    };
  }, [filteredBets]);

  // Grouper les paris par opérateur
  const groupedBets = useMemo(() => {
    const acc: Record<string, Bet[]> = {};
    filteredBets.forEach((bet) => {
      if (!acc[bet.operator]) {
        acc[bet.operator] = [];
      }
      acc[bet.operator].push(bet);
    });

    // Trier chaque groupe par date & heure
    Object.keys(acc).forEach((operator) => {
      acc[operator].sort((a, b) => {
        const dateCompare =
          new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return (b.time || "").localeCompare(a.time || "");
      });
    });

    return acc;
  }, [filteredBets]);

  const toggleOperatorVisibility = (operator: string) => {
    const newHidden = new Set(hiddenOperators);
    if (newHidden.has(operator)) {
      newHidden.delete(operator);
    } else {
      newHidden.add(operator);
    }
    setHiddenOperators(newHidden);
  };

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

  const filterBetsByPeriod = (betsToFilter: Bet[]) => {
    if (!activeExportBounds) return [];
    const { start, end } = activeExportBounds;
    return betsToFilter.filter((bet) => {
      const d = (bet.date || "").slice(0, 10);
      return d >= start && d <= end;
    });
  };

  const resolvePaginatedExportBets = async (
    bounds: NonNullable<typeof activeExportBounds>,
    operatorName: string,
    fallbackBets: Bet[],
  ): Promise<Bet[]> => {
    if (bounds.mode === "fixed" && bounds.period) {
      const isAllOp = !operatorName || operatorName === "all" || operatorName === "tous";
      const snapshot = await fetchOpenReport(supabase, {
        period: bounds.period,
        scope: "bets",
        operator: isAllOp ? undefined : operatorName,
      });
      const fetched = snapshot.tests as unknown as Bet[];
      const smartFiltered = applySmartFilter(fetched, smartFilter, "tests");
      return smartFiltered.filter((b) => !hiddenOperators.has(b.operator));
    }
    return fallbackBets.filter((bet) => {
      const d = (bet.date || "").slice(0, 10);
      return d >= bounds.start && d <= bounds.end;
    });
  };

  const exportToExcel = async (
    betsToExport: Bet[] = filteredBets,
    operatorName: string = "tous",
  ) => {
    if (!activeExportBounds) {
      toast.error("Veuillez sélectionner une période valide");
      return;
    }
    const frozenBounds = structuredClone(activeExportBounds);
    const frozenOperator = operatorName;
    setExportBusy(true);
    try {
      toast.loading("Lecture des données et génération Excel...", {
        id: "excel-export",
      });
      const filteredByPeriod = await resolvePaginatedExportBets(
        frozenBounds,
        frozenOperator,
        betsToExport,
      );

      if (filteredByPeriod.length === 0) {
        toast.info("Aucun test à exporter pour cette période", {
          id: "excel-export",
        });
        return;
      }

      const periodText = `${frozenBounds.label} (${frozenBounds.start} → ${frozenBounds.end})`;

    const columns = [
      { header: "N°", key: "index", width: 7, align: "center" as const },
      { header: "DATE", key: "date", width: 13, align: "center" as const },
      { header: "HEURE", key: "time", width: 10, align: "center" as const },
      {
        header: "OPÉRATEUR DE JEUX",
        key: "operator",
        width: 22,
        align: "left" as const,
      },
      {
        header: "SUPPORT",
        key: "support",
        width: 14,
        align: "center" as const,
      },
      {
        header: "TYPE DE TEST",
        key: "bet_type",
        width: 18,
        align: "left" as const,
      },
      {
        header: "MONTANT ENGAGÉ",
        key: "amount_fcfa",
        width: 20,
        align: "right" as const,
        isCurrency: true,
      },
      {
        header: "MONTANTS RETOURNÉS",
        key: "amount_won_fcfa",
        width: 20,
        align: "right" as const,
        isCurrency: true,
      },
      {
        header: "STATUT DU TEST",
        key: "status",
        width: 16,
        align: "center" as const,
        isStatus: true,
      },
      {
        header: "VALIDATION",
        key: "validation_status",
        width: 16,
        align: "center" as const,
      },
      {
        header: "RÉFÉRENCE DU TEST",
        key: "reference",
        width: 18,
        align: "center" as const,
      },
    ];

    const data = filteredByPeriod.map((bet, index) => ({
      index: index + 1,
      date: new Date(bet.date).toLocaleDateString("fr-FR"),
      time: bet.time || "—",
      operator: bet.operator,
      support: bet.support || "—",
      bet_type: bet.bet_type || "—",
      amount_fcfa: Number(bet.amount_fcfa) || 0,
      amount_won_fcfa: Number(bet.amount_won_fcfa) || 0,
      status:
        (bet.status || "").toLowerCase().includes("gagn") ||
        bet.status === "won"
          ? "Issue favorable"
          : (bet.status || "").toLowerCase().includes("perd") ||
              bet.status === "lost"
            ? "Issue défavorable"
            : "En attente",
      validation_status:
        bet.validation_status === "valide"
          ? "Validé"
          : bet.validation_status === "refuse"
            ? "Refusé"
            : "En attente",
      reference: bet.id.substring(0, 12).toUpperCase(),
    }));

      const isAll =
        !frozenOperator || frozenOperator === "all" || frozenOperator === "tous";
      const opDisplay = isAll ? "Tous les opérateurs" : frozenOperator;
      const fileName = buildReportFilename(
        "tests",
        frozenBounds.start,
        frozenBounds.end,
        "xlsx",
        isAll ? undefined : frozenOperator,
      );

      await exportStyledExcel({
        sheetName: "Tests",
        title: buildReportTitle("Rapport des tests", frozenBounds.label),
        subtitle: `Généré le ${formatBamakoDateTime()} (Africa/Bamako) • Récapitulatif des tests`,
        operator: opDisplay,
        periodText,
        columns,
        data,
        filename: fileName,
        showTotals: true,
      });
      toast.success(
        `Export réussi: ${filteredByPeriod.length} test(s) exporté(s)`,
        { id: "excel-export" },
      );
      setExportDialogOpen(false);
    } catch (err: any) {
      console.error("Erreur export:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erreur lors de la génération du fichier Excel",
        { id: "excel-export" },
      );
    } finally {
      setExportBusy(false);
    }
  };

  const exportToPDF = async (
    betsToExport: Bet[] = filteredBets,
    operatorName: string = "tous",
  ) => {
    if (!activeExportBounds) {
      toast.error("Veuillez sélectionner une période valide");
      return;
    }
    const frozenBounds = structuredClone(activeExportBounds);
    const frozenOperator = operatorName;
    setExportBusy(true);
    try {
      toast.loading("Lecture des données et génération PDF...", {
        id: "pdf-export",
      });
      const filteredByPeriod = await resolvePaginatedExportBets(
        frozenBounds,
        frozenOperator,
        betsToExport,
      );

      if (filteredByPeriod.length === 0) {
        toast.info("Aucun test à exporter pour cette période", {
          id: "pdf-export",
        });
        return;
      }

      const periodText = `${frozenBounds.label} (${frozenBounds.start} → ${frozenBounds.end})`;

      const columns = [
        { header: "N°", key: "index", align: "center" as const },
        { header: "DATE", key: "date", align: "center" as const },
        { header: "HEURE", key: "time", align: "center" as const },
        { header: "OPÉRATEUR", key: "operator", align: "left" as const },
        { header: "SUPPORT", key: "support", align: "center" as const },
        { header: "TYPE", key: "bet_type", align: "left" as const },
        {
          header: "MONTANT ENGAGÉ",
          key: "amount_fcfa",
          align: "right" as const,
          isCurrency: true,
        },
        {
          header: "MONTANTS RETOURNÉS",
          key: "amount_won_fcfa",
          align: "right" as const,
          isCurrency: true,
        },
        {
          header: "STATUT",
          key: "status",
          align: "center" as const,
          isStatus: true,
        },
        {
          header: "VALIDATION",
          key: "validation_status",
          align: "center" as const,
        },
        { header: "RÉFÉRENCE", key: "reference", align: "center" as const },
      ];

      const data = filteredByPeriod.map((bet, index) => ({
        index: index + 1,
        date: bet.date?.slice(0, 10) || "",
        time: bet.time || "—",
        operator: bet.operator,
        support: bet.support || "—",
        bet_type: bet.bet_type || "—",
        amount_fcfa: Number(bet.amount_fcfa) || 0,
        amount_won_fcfa: Number(bet.amount_won_fcfa) || 0,
        status:
          (bet.status || "").toLowerCase().includes("gagn") ||
          bet.status === "won"
            ? "Issue favorable"
            : (bet.status || "").toLowerCase().includes("perd") ||
                bet.status === "lost"
              ? "Issue défavorable"
              : "En attente",
        validation_status:
          bet.validation_status === "valide"
            ? "Validé"
            : bet.validation_status === "refuse"
              ? "Refusé"
              : "En attente",
        reference: readRecordReference(bet).reference || bet.id.substring(0, 12).toUpperCase(),
      }));

      const isAll =
        !frozenOperator || frozenOperator === "all" || frozenOperator === "tous";
      const opDisplay = isAll ? "Tous les opérateurs" : frozenOperator;
      const fileName = buildReportFilename(
        "tests",
        frozenBounds.start,
        frozenBounds.end,
        "pdf",
        isAll ? undefined : frozenOperator,
      );

      await exportStyledPDF({
        title: buildReportTitle("Rapport des tests", frozenBounds.label),
        subtitle: `Généré le ${formatBamakoDateTime()} (Africa/Bamako) • ${filteredByPeriod.length} test(s)`,
        operator: opDisplay,
        periodText,
        columns,
        data,
        filename: fileName,
        showTotals: true,
        orientation: "landscape",
      });
      toast.success(
        `Export PDF réussi: ${filteredByPeriod.length} test(s) exporté(s)`,
        { id: "pdf-export" },
      );
      setExportDialogOpen(false);
    } catch (err: any) {
      console.error("Erreur export PDF:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erreur lors de la génération du fichier PDF",
        { id: "pdf-export" },
      );
    } finally {
      setExportBusy(false);
    }
  };

  const exportToCSV = async (
    betsToExport: Bet[] = filteredBets,
    operatorName: string = "tous",
  ) => {
    if (!activeExportBounds) {
      toast.error("Veuillez sélectionner une période valide");
      return;
    }
    const frozenBounds = structuredClone(activeExportBounds);
    const frozenOperator = operatorName;
    setExportBusy(true);
    try {
      toast.loading("Lecture des données et génération CSV...", {
        id: "csv-export",
      });
      const filteredByPeriod = await resolvePaginatedExportBets(
        frozenBounds,
        frozenOperator,
        betsToExport,
      );

      if (filteredByPeriod.length === 0) {
        toast.info("Aucun test à exporter pour cette période", {
          id: "csv-export",
        });
        return;
      }

      const csvCols = [
        "Référence",
        "Date",
        "Heure",
        "Opérateur",
        "Support",
        "Type de test",
        "Montant engagé (F CFA)",
        "Montant retourné (F CFA)",
        "Issue",
        "Validation",
        "Notes",
      ];
      const csvRows = filteredByPeriod.map((bet) => ({
        Référence: readRecordReference(bet).reference || bet.id,
        Date: bet.date?.slice(0, 10) || "",
        Heure: bet.time || "",
        Opérateur: bet.operator || "",
        Support: bet.support || "",
        "Type de test": bet.bet_type || "",
        "Montant engagé (F CFA)": Number(bet.amount_fcfa) || 0,
        "Montant retourné (F CFA)":
          bet.amount_won_fcfa === null || bet.amount_won_fcfa === undefined
            ? ""
            : Number(bet.amount_won_fcfa),
        Issue: testStatusLabel(bet.status),
        Validation:
          bet.validation_status === "valide"
            ? "Validé"
            : bet.validation_status === "refuse"
              ? "Refusé"
              : "En attente",
        Notes: bet.notes || "",
      }));

      const isAll =
        !frozenOperator || frozenOperator === "all" || frozenOperator === "tous";
      const fileName = buildReportFilename(
        "tests",
        frozenBounds.start,
        frozenBounds.end,
        "csv",
        isAll ? undefined : frozenOperator,
      );
      downloadCsv(fileName, buildCsv(csvRows, csvCols));
      toast.success(
        `Export CSV réussi: ${filteredByPeriod.length} test(s) exporté(s)`,
        { id: "csv-export" },
      );
      setExportDialogOpen(false);
    } catch (err: any) {
      console.error("Erreur export CSV:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erreur lors de la génération du fichier CSV",
        { id: "csv-export" },
      );
    } finally {
      setExportBusy(false);
    }
  };

  const formatFCFA = (val: number) => {
    return new Intl.NumberFormat("fr-FR").format(Math.round(val)) + " FCFA";
  };

  // Pagination helper for the current active tab
  const currentTabBets =
    activeOperator === "all" ? filteredBets : groupedBets[activeOperator] || [];
  const totalPages = Math.max(1, Math.ceil(currentTabBets.length / pageSize));
  const paginatedBets = currentTabBets.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("gagn") || s === "won") {
      return (
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/60 font-semibold text-[11px] px-2 py-0.5 gap-1"
        >
          <CheckCircle2 className="h-3 w-3" />

          Issue favorable
        </Badge>
      );
    }
    if (s === "perdu" || s === "lost") {
      return (
        <Badge
          variant="outline"
          className="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200/60 font-semibold text-[11px] px-2 py-0.5 gap-1"
        >
          <XCircle className="h-3 w-3" />

          Issue défavorable
        </Badge>
      );
    }
    if (s.includes("attente") || s === "pending") {
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200/60 font-semibold text-[11px] px-2 py-0.5 gap-1"
        >
          <Clock className="h-3 w-3" />
          En attente
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[11px] px-2 py-0.5">
        {status}
      </Badge>
    );
  };

  if (isLoading && bets.length === 0) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="h-10 w-1/4 bg-muted animate-pulse rounded-lg" />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
          <div className="h-96 bg-muted animate-pulse rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* =========================================================================
            1. HEADER & ACTION BAR
            ========================================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#D8E6DB]">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#17251C]">

              Gestion des Tests
            </h1>
            <p className="text-sm text-[#556B5C] mt-0.5 font-medium">
              Journal des tests, suivi des opérations et de leur validation
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-9 gap-1.5 border-[#D8E6DB] bg-white hover:bg-[#F5F8F5] text-[#17251C] font-semibold"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-[#006B2D]" : ""}`}
              />
              <span>Actualiser</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDialogOpen(true)}
              className="h-9 gap-1.5 border-[#D8E6DB] bg-white hover:bg-[#F5F8F5] text-[#17251C] font-semibold"
            >
              <Download className="h-4 w-4" />
              <span>Exporter</span>
            </Button>

            <OpenReportButton initialOperator={activeOperator === "all" ? "" : activeOperator} />
            <Button
              onClick={openDialog}
              size="sm"
              className="h-9 gap-1.5 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Créer un test</span>
            </Button>
          </div>
        </div>

        {/* =========================================================================
            2. HIGH-DENSITY KPI BENTO GRID (Standard dashboard-designer)
            ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {/* KPI 1: Volume des Mises */}
          <div className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">

                Volume Engagé
              </span>
              <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black tracking-tight text-[#17251C] font-mono">
                {formatFCFA(statsSummary.totalMise)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge
                  variant="outline"
                  className="bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30 text-[11px] font-bold px-1.5 py-0"
                >
                  {filteredBets.length}  tests
                </Badge>
                <span className="text-xs text-[#556B5C]">
                  Panier moy. {formatFCFA(statsSummary.avgBet)}
                </span>
              </div>
            </div>
          </div>

          {/* KPI 2: Gains Distribués */}
          <div className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">

                Montants retournés
              </span>
              <div className="h-9 w-9 rounded-lg bg-[#FFD000]/20 text-[#004D20] flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black tracking-tight text-[#17251C] font-mono">
                {formatFCFA(statsSummary.totalGains)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge
                  variant="outline"
                  className="bg-[#FFD000]/20 text-[#004D20] border-[#FFD000]/50 text-[11px] font-bold px-1.5 py-0"
                >
                  {statsSummary.wonCount}  issues favorables
                </Badge>
                <span className="text-xs text-[#556B5C]">
                  Taux joueur: {statsSummary.winRate}%
                </span>
              </div>
            </div>
          </div>

          {/* KPI 3: Marge Nette Plateforme */}
          <div className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">
                Marge / Rétention
              </span>
              <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black tracking-tight text-[#17251C] font-mono">
                {formatFCFA(statsSummary.netPlatformMargin)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge
                  variant="outline"
                  className="bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30 text-[11px] font-bold px-1.5 py-0"
                >
                  {statsSummary.lostCount}  issues défavorables
                </Badge>
                <span className="text-xs text-[#556B5C]">marge conservée</span>
              </div>
            </div>
          </div>

          {/* KPI 4: Tickets en Attente */}
          <div className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">

                Tests en Cours
              </span>
              <div className="h-9 w-9 rounded-lg bg-[#FFD000]/20 text-[#8A7100] flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black tracking-tight text-[#17251C] font-mono">
                {statsSummary.pendingCount}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge
                  variant="outline"
                  className="bg-[#FFD000]/20 text-[#8A7100] border-[#FFD000]/40 text-[11px] font-bold px-1.5 py-0"
                >
                  En attente
                </Badge>
                <span className="text-xs text-[#556B5C]">non dénoués</span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. FACETED FILTER TOOLBAR & VIEW CONTROLS
            ========================================================================= */}
        <div className="p-4 rounded-xl border border-[#D8E6DB] bg-white shadow-xs space-y-3">
          <SmartFilterBar
            mode="tests"
            filter={smartFilter}
            onChange={(next) => {
              setSmartFilter(next);
              setCurrentPage(1);
            }}
            operators={operators}
            platformsOrSupports={supports}
            secondaryOptions={betTypes}
            totalCount={bets.length}
            filteredCount={filteredBets.length}
            placeholder="Recherche intelligente (ex: 1xBet Live Sport 1500, téléphone, référence...)"
          />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            {/* Faceted Status Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <span className="text-xs font-bold text-[#556B5C] mr-1 hidden lg:inline">
                Statut:
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-8 text-xs px-2.5 font-bold rounded-lg transition-all",
                  statusFilter === "all"
                    ? "bg-[#006B2D] text-white hover:bg-[#004D20] border-[#006B2D]"
                    : "border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white",
                )}
              >
                Tous ({bets.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("won");
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-8 text-xs px-2.5 font-bold rounded-lg transition-all",
                  statusFilter === "won"
                    ? "bg-[#006B2D] text-white hover:bg-[#004D20] border-[#006B2D]"
                    : "border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white",
                )}
              >

                Issues favorables
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("lost");
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-8 text-xs px-2.5 font-bold rounded-lg transition-all",
                  statusFilter === "lost"
                    ? "bg-[#E52329] text-white hover:bg-[#C01B20] border-[#E52329]"
                    : "border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white",
                )}
              >

                Issues défavorables
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("pending");
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-8 text-xs px-2.5 font-bold rounded-lg transition-all",
                  statusFilter === "pending"
                    ? "bg-[#FFD000] text-[#004D20] hover:bg-[#E6BC00] border-[#FFD000]"
                    : "border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white",
                )}
              >
                En attente
              </Button>
            </div>

            {/* View Switcher & Operators Settings */}
            <div className="flex items-center gap-2">
              <div className="flex items-center border border-[#D8E6DB] rounded-lg p-0.5 bg-[#F5F8F5]">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "h-7 px-2 text-xs gap-1 font-bold",
                    viewMode === "table"
                      ? "bg-white text-[#17251C] shadow-xs"
                      : "text-[#556B5C]",
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("cards")}
                  className={cn(
                    "h-7 px-2 text-xs gap-1 font-bold",
                    viewMode === "cards"
                      ? "bg-white text-[#17251C] shadow-xs"
                      : "text-[#556B5C]",
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cartes</span>
                </Button>
              </div>

              {/* Operator visibility selector */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white font-semibold"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Opérateurs</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-white border-[#D8E6DB]">
                  <div className="space-y-3">
                    <h4 className="font-bold text-xs text-[#17251C] uppercase tracking-wider">
                      Opérateurs visibles
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {Object.keys(groupedBets)
                        .sort()
                        .map((operator) => (
                          <div
                            key={operator}
                            className="flex items-center gap-2"
                          >
                            <Checkbox
                              id={`op-${operator}`}
                              checked={!hiddenOperators.has(operator)}
                              onCheckedChange={() =>
                                toggleOperatorVisibility(operator)
                              }
                            />
                            <label
                              htmlFor={`op-${operator}`}
                              className="text-xs cursor-pointer flex-1 text-[#17251C] font-medium"
                            >
                              {operator} ({groupedBets[operator].length})
                            </label>
                          </div>
                        ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* =========================================================================
            4. TABS BY OPERATOR & DATA VIEW (TABLE / CARDS)
            ========================================================================= */}
        <Tabs
          value={activeOperator}
          onValueChange={(val) => {
            setActiveOperator(val);
            setCurrentPage(1);
          }}
          className="w-full"
        >
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 bg-white border border-[#D8E6DB] rounded-xl shadow-xs">
            <TabsTrigger
              value="all"
              className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-[#006B2D] data-[state=active]:text-white font-bold rounded-lg"
            >
              <span>Tous</span>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 bg-[#F5F8F5] text-[#17251C]"
              >
                {filteredBets.length}
              </Badge>
            </TabsTrigger>
            {Object.keys(groupedBets)
              .filter((op) => !hiddenOperators.has(op))
              .sort()
              .map((operator) => (
                <TabsTrigger
                  key={operator}
                  value={operator}
                  className="text-xs px-3 py-1.5 gap-1.5 whitespace-nowrap data-[state=active]:bg-[#006B2D] data-[state=active]:text-white font-bold rounded-lg"
                >
                  <span>{operator}</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4 bg-[#F5F8F5] text-[#17251C]"
                  >
                    {groupedBets[operator].length}
                  </Badge>
                </TabsTrigger>
              ))}
          </TabsList>

          {/* Table Container */}
          <div className="mt-4 rounded-xl border border-[#D8E6DB] bg-white shadow-xs overflow-hidden">
            {currentTabBets.length > 0 ? (
              viewMode === "table" ? (
                /* === HIGH DENSITY TANSTACK STYLE TABLE === */
                <div className="relative w-full overflow-auto">
                  <Table>
                    <TableHeader className="bg-[#F5F8F5]">
                      <TableRow className="border-b border-[#D8E6DB]">
                        <TableHead className="w-14 text-center font-bold text-xs text-[#556B5C]">
                          N°
                        </TableHead>
                        <TableHead className="font-bold text-xs text-[#556B5C]">
                          Date & Heure
                        </TableHead>
                        <TableHead className="font-bold text-xs text-[#556B5C]">
                          Opérateur
                        </TableHead>
                        <TableHead className="font-bold text-xs text-[#556B5C]">
                          Support
                        </TableHead>
                        <TableHead className="font-bold text-xs text-[#556B5C]">

                          Type de Test
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs text-[#556B5C]">

                          Montant Engagé
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs text-[#556B5C]">

                          Montants retournés
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs text-[#556B5C]">
                          Statut
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs text-[#556B5C]">
                          Validation
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs text-[#556B5C]">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-[#D8E6DB]">
                      {paginatedBets.map((bet, index) => {
                        const globalIndex =
                          (currentPage - 1) * pageSize + index + 1;
                        return (
                          <TableRow
                            key={bet.id}
                            className="hover:bg-muted/40 transition-colors cursor-pointer group"
                            onClick={() => openEditDialog(bet)}
                          >
                            <TableCell className="text-center font-mono text-xs text-muted-foreground font-semibold">
                              #{globalIndex}
                            </TableCell>

                            <TableCell className="text-xs">
                              <div className="font-medium text-foreground">
                                {new Date(bet.date).toLocaleDateString("fr-FR")}
                              </div>
                              {bet.time && (
                                <div className="text-[11px] text-muted-foreground font-mono">
                                  {bet.time}
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="text-xs font-semibold text-foreground">
                              {bet.operator}
                            </TableCell>

                            <TableCell className="text-xs">
                              <span className="px-2 py-0.5 rounded bg-muted text-foreground text-[11px] font-medium border border-border/50">
                                {bet.support || "—"}
                              </span>
                            </TableCell>

                            <TableCell className="text-xs text-muted-foreground font-medium">
                              {testCatalogLabel(bet.bet_type)}
                            </TableCell>

                            <TableCell className="text-right font-mono font-semibold text-xs text-foreground">
                              {formatFCFA(bet.amount_fcfa)}
                            </TableCell>

                            <TableCell className="text-right font-mono text-xs">
                              {bet.amount_won_fcfa &&
                              bet.amount_won_fcfa > 0 ? (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  {formatFCFA(bet.amount_won_fcfa)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            <TableCell className="text-center">
                              {getStatusBadge(bet.status)}
                            </TableCell>

                            <TableCell className="text-center">
                              {bet.validation_status === "valide" ? (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/50 text-[10px]"
                                >
                                  Validé
                                </Badge>
                              ) : bet.validation_status === "refuse" ? (
                                <Badge
                                  variant="outline"
                                  className="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200/50 text-[10px]"
                                >
                                  Refusé
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-border text-[10px]"
                                >
                                  {bet.validation_status || "Standard"}
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell
                              className="text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1">
                                {bet.ticket_url && (
                                  <a
                                    href={bet.ticket_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-[11px] font-bold bg-[#EBF7EE] text-[#006B2D] border border-[#86EFAC] hover:bg-[#D1FAE5] transition-colors"
                                    title="Consulter le justificatif archivé sur Cloudflare R2"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span className="hidden sm:inline">Justificatif</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Consulter le test"
                                  onClick={() => openEditDialog(bet)}
                                  className="h-8 px-2 text-xs gap-1"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">
                                    Détails
                                  </span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                /* === CARDS / TILES VIEW === */
                <div className="p-4 grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {paginatedBets.map((bet, index) => {
                    const globalIndex =
                      (currentPage - 1) * pageSize + index + 1;
                    return (
                      <div
                        key={bet.id}
                        className="p-4 rounded-xl border border-border bg-card shadow-xs hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between space-y-3"
                        onClick={() => openEditDialog(bet)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center font-mono font-bold text-xs">
                              #{globalIndex}
                            </span>
                            <div>
                              <h4 className="font-semibold text-sm text-foreground">
                                {bet.operator}
                              </h4>
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(bet.date).toLocaleDateString("fr-FR")}{" "}
                                {bet.time ? `• ${bet.time}` : ""}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(bet.status)}
                        </div>

                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[11px]">
                            {testCatalogLabel(bet.support)}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[11px]">
                            {testCatalogLabel(bet.bet_type)}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                          <div>
                            <span className="text-muted-foreground">

                              Engagé:{" "}
                            </span>
                            <span className="font-mono font-semibold text-foreground">
                              {formatFCFA(bet.amount_fcfa)}
                            </span>
                          </div>
                          {bet.amount_won_fcfa && bet.amount_won_fcfa > 0 ? (
                            <div>
                              <span className="text-muted-foreground">

                                Montants retournés:{" "}
                              </span>
                              <span className="font-mono font-semibold text-emerald-600">
                                {formatFCFA(bet.amount_won_fcfa)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="py-16 text-center">
                <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-semibold text-sm text-foreground">

                  Aucun test trouvé
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Aucun résultat ne correspond à vos critères de recherche ou à
                  cet opérateur.
                </p>
                <Button
                  onClick={openDialog}
                  size="sm"
                  variant="outline"
                  className="mt-4"
                >
                  <Plus className="h-4 w-4 mr-1.5" />

                  Créer un test
                </Button>
              </div>
            )}

            {/* Pagination Controls Footer */}
            {currentTabBets.length > 0 && (
              <div className="p-3 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>
                    Affichage de{" "}
                    <span className="font-medium text-foreground">
                      {(currentPage - 1) * pageSize + 1}
                    </span>{" "}
                    à{" "}
                    <span className="font-medium text-foreground">
                      {Math.min(currentPage * pageSize, currentTabBets.length)}
                    </span>{" "}
                    sur{" "}
                    <span className="font-medium text-foreground">
                      {currentTabBets.length}
                    </span>{" "}

                    tests
                  </span>

                  <span className="text-border">|</span>

                  <label className="flex items-center gap-1.5">
                    <span>Lignes:</span>
                    <select
                      className="border border-border rounded px-1.5 py-0.5 bg-background text-foreground text-xs"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Précédent</span>
                  </Button>

                  <span className="px-2 font-mono text-xs font-medium text-foreground">
                    Page {currentPage} / {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <span>Suivant</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Tabs>
      </div>

      {/* =========================================================================
          DIALOG DE CRÉATION / MODIFICATION DU PARI
          ========================================================================= */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingBet ? "Consulter le test" : "Créer un test"}
            </DialogTitle>
            <DialogDescription>{HISTORICAL_RESULT_NOTICE}</DialogDescription>
          </DialogHeader>
          <RecordForm
            key={`${dialogOpen}-${editingBet?.id || "new"}`}
            existing={!!editingBet}
            onSave={handleSubmit}
            onClose={() => setDialogOpen(false)}
            onRestore={() => openEditDialog(editingBet!)}
            createLabel="Créer le test"
            hasDraft={hasDraft}
            draftTime={savedAtFormatted}
            hasConflict={hasConflict}
            onRestoreDraft={restoreDraft}
            onDiscardDraft={discardDraft}
            draftSaveStatus={saveStatus}
          >
            <div className="grid gap-4 pt-2">
              {/* ASSISTANCE INTELLIGENTE DE SAISIE PAR ANALYSE AUTOMATIQUE DE RÉFÉRENCE */}
              <div className="p-3 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#17251C] flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#006B2D]" />

                    Référence du test
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

              <DateTimeRow
                date={formData.date}
                time={formData.time}
                onDateChange={(val) => setFormData({ ...formData, date: val })}
                onTimeChange={(val) => setFormData({ ...formData, time: val })}
              />

              <CreatableSelect
                label="Opérateur"
                required
                value={formData.operator}
                onChange={(value) =>
                  setFormData({ ...formData, operator: value })
                }
                options={operators}
                placeholder="Sélectionner ou saisir un nouvel opérateur..."
                onCreateNew={createOperator}
              />

              <CreatableSelect
                label="Support"
                required
                value={formData.support}
                onChange={(value) =>
                  setFormData({ ...formData, support: value })
                }
                options={supports}
                placeholder="Sélectionner ou saisir un support..."
                onCreateNew={createSupport}
              />

              {/* SÉLECTEUR EN CASCADE DES SALLES DE JEUX PHYSIQUES */}
              {["Salle de jeux", "Site de test"].includes(formData.support) && venues.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                    Point de vente physique
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

              <CreatableSelect
                label="Type de test"
                required
                value={formData.bet_type}
                onChange={(value) =>
                  setFormData({ ...formData, bet_type: value })
                }
                options={betTypes}
                placeholder="Sélectionner ou saisir un type..."
                onCreateNew={createBetType}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                    Montant misé (FCFA) *
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
                    className="bg-white border-[#D8E6DB]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">

                    Issue du test
                  </label>
                  <select
                    className="w-full border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                  >
                    <option value="en attente">En attente</option>
                    <option value="gagné">Issue favorable</option>
                    <option value="perdu">Issue défavorable</option>
                    <option value="annulé">Annulé</option>
                  </select>
                </div>
              </div>

              {formData.status === "gagné" && (
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                    Montant retourné (FCFA)
                  </label>
                  <Input
                    type="number"
                    value={formData.amount_won_fcfa || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        amount_won_fcfa: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                    className="bg-white border-[#D8E6DB]"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">

                    Téléphone du participant
                  </label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="Ex: 0701020304"
                    className="bg-white border-[#D8E6DB]"
                  />
                </div>
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
                        proof_status: e.target.value as
                          | "disponible"
                          | "non_disponible"
                          | "non_renseignee",
                      })
                    }
                  >
                    <option value="non_renseignee">Non renseignée</option>
                    <option value="disponible">Preuve disponible</option>
                    <option value="non_disponible">Preuve absente</option>
                  </select>
                </div>
              </div>

              {(formData.proof_status === "disponible" || formData.ticket_url) && (
                <ProofUploader
                  label="Justificatif ou Reçu du test (Stockage R2)"
                  value={formData.ticket_url}
                  onChange={(url) =>
                    setFormData((prev) => ({
                      ...prev,
                      ticket_url: url || "",
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

              {/* AUTOMATISATION ANTI-DOUBLE SAISIE */}
              {!editingBet && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5]">
                  <Checkbox
                    id="auto-trans"
                    checked={autoCreateTransaction}
                    onCheckedChange={(checked) =>
                      setAutoCreateTransaction(Boolean(checked))
                    }
                  />
                  <label
                    htmlFor="auto-trans"
                    className="text-xs font-bold text-[#17251C] cursor-pointer flex items-center gap-1.5"
                  >
                    <Zap className="h-4 w-4 text-[#006B2D]" />
                    <span>
                      Enregistrer automatiquement le flux financier
                      correspondant dans Transactions (Anti-double saisie)
                    </span>
                  </label>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">

                  Observations et références complémentaires
                </label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Détails du justificatif, identifiant externe, match..."
                  rows={2}
                  className="bg-white border-[#D8E6DB]"
                />
              </div>
            </div>
          </RecordForm>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DIALOG D'EXPORT EXCEL AVANCÉ
          ========================================================================= */}
      <Dialog open={exportDialogOpen} onOpenChange={(open) => { if (!exportBusy) setExportDialogOpen(open); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Exporter le Rapport des Tests
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
                Aperçu local (onglet actif) :
              </p>
              <p className="text-[#556B5C]">
                <span className="font-bold text-[#17251C]">
                  {
                    filterBetsByPeriod(
                      activeOperator === "all"
                        ? filteredBets
                        : groupedBets[activeOperator] || [],
                    ).length
                  }
                </span>{" "}
                test(s) affichés localement sur la période.
                {exportPeriodMode === "fixed" &&
                  " L’export interroge l’intégralité de la base paginée selon vos droits."}
              </p>
              <p className="text-[#556B5C]">
                Filtre opérateur actif :{" "}
                <span className="font-bold text-[#17251C]">
                  {activeOperator === "all"
                    ? "Tous les opérateurs"
                    : activeOperator}
                </span>
              </p>
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
                onClick={() => {
                  const betsToExport =
                    activeOperator === "all"
                      ? filteredBets
                      : groupedBets[activeOperator] || [];
                  void exportToCSV(betsToExport, activeOperator);
                }}
                className="min-h-11 gap-1.5 border-[#D8E6DB] text-[#17251C] hover:bg-[#F5F8F5] font-semibold"
              >
                <FileText className="h-4 w-4 text-[#556B5C]" />
                CSV (.csv)
              </Button>
              <Button
                variant="outline"
                disabled={exportBusy || !activeExportBounds}
                onClick={() => {
                  const betsToExport =
                    activeOperator === "all"
                      ? filteredBets
                      : groupedBets[activeOperator] || [];
                  void exportToPDF(betsToExport, activeOperator);
                }}
                className="min-h-11 gap-1.5 border-[#006B2D]/30 text-[#006B2D] hover:bg-[#E8F3EC] font-semibold"
              >
                <FileText className="h-4 w-4 text-[#006B2D]" />
                PDF (.pdf)
              </Button>
              <Button
                disabled={exportBusy || !activeExportBounds}
                onClick={() => {
                  const betsToExport =
                    activeOperator === "all"
                      ? filteredBets
                      : groupedBets[activeOperator] || [];
                  void exportToExcel(betsToExport, activeOperator);
                }}
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
