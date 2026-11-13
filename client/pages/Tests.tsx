import { OpenReportButton } from "@/components/reports/OpenReportExport";
import { useSearchParams } from "react-router-dom";
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
import { RecordForm, RecordConsultationSwitch } from "@/components/common/RecordForm";
import {
  SmartFilterBar,
  SmartFilterState,
  INITIAL_SMART_FILTER,
  applySmartFilter,
} from "@/components/common/SmartFilterBar";
import {
  TablePaginationFooter,
  paginateItems,
} from "@/components/common/TablePaginationFooter";
import { useFormDraft } from "@/hooks/use-form-draft";
import AppLayout from "@/components/layout/AppLayout";
import { cn, formatPhoneNumber, formatAmountInput, parseAmountInput } from "@/lib/utils";
import { OperationCommentsPanel } from "@/components/common/OperationCommentsPanel";
import { ProofPreview } from "@/components/common/ProofPreview";
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
import { useOptionalSettings } from "@/lib/settings";
import { canAgentEditRecord } from "@/lib/rbac";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  useRolePermissions,
} from "@/hooks/use-data-queries";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import {
  archiveOperationRecord,
  canUserTrashRecord,
  hardDeleteOperationRecord,
  submitDraftOperationsRecord,
  trashOperationRecord,
} from "@/lib/operation-archive";
import { DraftBatchToolbar } from "@/components/common/DraftBatchToolbar";
import { parsePaymentReference, ParsedPaymentRef } from "@/lib/smart-parser";
import { dispatchAppNotification } from "@/lib/notification-navigation";
import { Sparkles, Building, Zap, AlertTriangle } from "lucide-react";
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
  validation_notes?: string | null;
  edit_unlocked_until?: string | null;
  refusal_fields?: string[] | null;
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
  const { data: rolePerms } = useRolePermissions();
  const createBetMutation = useCreateBet();
  const updateBetMutation = useUpdateBet();

  const [smartFilter, setSmartFilter] =
    useState<SmartFilterState>(INITIAL_SMART_FILTER);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDraftsOnly, setShowDraftsOnly] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const listTopRef = useRef<HTMLDivElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBet, setEditingBet] = useState<Bet | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const prevUrlDatesRef = useRef<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  useEffect(() => {
    const isNew = searchParams.get("new") === "1";
    const startParam = searchParams.get("start") || "";
    const endParam = searchParams.get("end") || "";
    const refParam = searchParams.get("ref");
    const validationParam = searchParams.get("validation");
    const urlDatesChanged =
      startParam !== prevUrlDatesRef.current.start ||
      endParam !== prevUrlDatesRef.current.end;

    if (urlDatesChanged) {
      prevUrlDatesRef.current = { start: startParam, end: endParam };
    }

    if (urlDatesChanged || refParam || validationParam) {
      setSmartFilter((prev) => ({
        ...prev,
        ...(urlDatesChanged
          ? {
              datePreset: startParam || endParam ? "custom" : "all",
              startDate: startParam,
              endDate: endParam,
            }
          : {}),
        ...(refParam ? { search: refParam } : {}),
        ...(validationParam ? { validationStatus: validationParam } : {}),
      }));
      setCurrentPage(1);
    }

    if (isNew) {
      setEditingBet(null);
      setDialogOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const idParam = searchParams.get("id");
    if (!idParam || bets.length === 0) return;
    const match = bets.find((b) => b.id === idParam);
    if (match) {
      openEditDialog(match);
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, bets, setSearchParams]);
  const [activeOperator, setActiveOperator] = useState<string>("all");
  const [hiddenOperators, setHiddenOperators] = useState<Set<string>>(
    new Set(),
  );
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const settings = useOptionalSettings();
  const canExport = user?.role !== "AGENT" || settings.agentCanExport;
  const [unlockRequestSent, setUnlockRequestSent] = useState(false);
  useEffect(() => {
    setUnlockRequestSent(false);
  }, [editingBet?.id, dialogOpen]);

  const editPermission = editingBet
    ? canAgentEditRecord(
        user?.role,
        editingBet.validation_status,
        editingBet.created_at,
        settings.agentEditWindowMinutes,
        editingBet.edit_unlocked_until,
      )
    : { allowed: true };

  async function handleRequestUnlock() {
    if (!editingBet) return;
    setUnlockRequestSent(true);
    await dispatchAppNotification({
      eventType: "operation_created",
      operationType: "bets",
      operationId: editingBet.id,
      status: "modify",
      operator: editingBet.operator,
      amountFcfa: editingBet.amount_fcfa,
      reference: editingBet.reference || undefined,
      authorId: user?.id,
      notes: "Demande de prolongation du délai de modification par l'agent",
    });
    toast.success("Demande de prolongation envoyée aux contrôleurs");
  }
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

  const existingMatchingBet = useMemo(() => {
    const trimmed = ticketRef.trim().toLowerCase();
    if (!trimmed) return null;
    return (
      bets.find((b) => {
        if (editingBet && b.id === editingBet.id) return false;
        const ref = readRecordReference(b).reference.trim().toLowerCase();
        return ref === trimmed;
      }) || null
    );
  }, [bets, ticketRef, editingBet]);

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

  async function handleSubmit(asDraft = false) {
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
      const fallbackTime = formData.time || new Date().toTimeString().slice(0, 5);
      const betData = {
        ...formData,
        time: fallbackTime,
        support: formData.support || "App mobile",
        amount_won_fcfa: formData.amount_won_fcfa || null,
        ticket_url: formData.ticket_url || null,
        proof_attachment_url: formData.ticket_url || null,
        ...writeRecordReference(ticketRef, formData.notes),
      };

      if (editingBet) {
        const isResubmission = editingBet.validation_status === "refuse";
        const updatePayload = isResubmission
          ? { ...betData, validation_status: "en_attente" }
          : betData;
        const { error } = await supabase
          .from("bets")
          .update(updatePayload)
          .eq("id", editingBet.id)
          .select("id")
          .single();

        if (error) throw error;
        if (isResubmission) {
          void dispatchAppNotification({
            eventType: "operation_created",
            operationType: "bets",
            operationId: editingBet.id,
            status: "en_attente",
            operator: formData.operator,
            amountFcfa: Number(formData.amount_fcfa) || 0,
            reference: betData.reference || undefined,
            authorId: user?.id,
          });
          toast.success("Test corrigé et resoumis pour validation");
        } else {
          toast.success("Test modifié avec succès");
        }
      } else {
        const isAdmin = user?.role === "ADMIN";
        const newBetData = {
          ...betData,
          created_by: user?.id,
          validation_status: asDraft
            ? "brouillon"
            : isAdmin
              ? "valide"
              : "en_attente",
        };

        const insertQuery = supabase.from("bets").insert([newBetData]);
        const { data: insertedBet, error } =
          typeof (insertQuery as any)?.select === "function"
            ? await (insertQuery as any).select("id").single()
            : await insertQuery;
        if (error) throw error;

        if (!asDraft) {
          void dispatchAppNotification({
            eventType: "operation_created",
            operationType: "bets",
            operationId: insertedBet?.id,
            status: newBetData.validation_status as any,
            operator: formData.operator,
            amountFcfa: Number(formData.amount_fcfa) || 0,
            reference: newBetData.reference || undefined,
            authorId: user?.id,
          });
        }

        // AUTOMATISATION ANTI-DOUBLE SAISIE : Génération automatique du flux financier lié (uniquement si envoyé)
        if (!asDraft && autoCreateTransaction && formData.amount_fcfa > 0) {
          try {
            const transType = formData.status === "gagné" ? "Retrait" : "Dépôt";
            const transAmount =
              formData.status === "gagné" && formData.amount_won_fcfa
                ? formData.amount_won_fcfa
                : formData.amount_fcfa;

            const newTransaction = {
              date: formData.date,
              time: fallbackTime,
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
          asDraft
            ? "Test enregistré en brouillon (non envoyé au contrôle)"
            : !isAdmin
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
      const code = String(error?.code || "");
      const rawMsg =
        error?.message ||
        error?.details ||
        error?.hint ||
        "Une erreur inattendue est survenue";
      console.error("Erreur lors de l'enregistrement du test:", {
        code,
        message: rawMsg,
        details: error?.details,
        hint: error?.hint,
      });

      let friendly = "Erreur lors de l'enregistrement du test";
      if (code === "23505") {
        friendly =
          "Cette référence est déjà utilisée par un autre enregistrement. Modifiez-la ou utilisez Différencier (#2).";
      } else if (
        code === "42501" ||
        rawMsg.toLowerCase().includes("row-level security")
      ) {
        friendly =
          "Droits insuffisants ou session expirée. Reconnectez-vous puis réessayez.";
      } else if (code === "23514" || code === "23502") {
        friendly = `Valeur invalide ou champ obligatoire manquant (${rawMsg}).`;
      } else if (rawMsg && rawMsg !== "Une erreur inattendue est survenue") {
        friendly = `Erreur lors de l'enregistrement : ${rawMsg}`;
      }
      toast.error(friendly);
    }
  }

  const draftBets = useMemo(
    () =>
      bets.filter(
        (b) =>
          b.validation_status === "brouillon" &&
          (user?.role === "ADMIN" ||
            user?.role === "CONTROLEUR" ||
            b.created_by === user?.id),
      ),
    [bets, user?.role, user?.id],
  );

  // Filtered bets with multi-faceted smart criteria
  const filteredBets = useMemo(() => {
    const base = applySmartFilter(bets, smartFilter, "tests");
    return base.filter((bet) => {
      if (showDraftsOnly && bet.validation_status !== "brouillon") return false;
      if (statusFilter === "all") return true;
      const st = bet.status.toLowerCase();
      if (statusFilter === "won") return st.includes("gagn") || st === "won";
      if (statusFilter === "lost") return st === "perdu" || st === "lost";
      if (statusFilter === "pending")
        return st.includes("attente") || st === "pending";
      return true;
    });
  }, [bets, smartFilter, statusFilter, showDraftsOnly]);

  const visibleBets = useMemo(
    () => filteredBets.filter((b) => !hiddenOperators.has(b.operator)),
    [filteredBets, hiddenOperators],
  );

  // Compute High-Density KPI Metrics
  const statsSummary = useMemo(() => {
    let totalMise = 0;
    let totalGains = 0;
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;

    visibleBets.forEach((b) => {
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
      visibleBets.length > 0
        ? Math.round((wonCount / visibleBets.length) * 100)
        : 0;
    const avgBet =
      visibleBets.length > 0 ? Math.round(totalMise / visibleBets.length) : 0;

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
  }, [visibleBets]);

  // Grouper les paris par opérateur
  const groupedBets = useMemo(() => {
    const acc: Record<string, typeof filteredBets> = {};
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
      if (activeOperator === operator) {
        setActiveOperator("all");
      }
    }
    setHiddenOperators(newHidden);
    setCurrentPage(1);
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
    activeOperator === "all" ? visibleBets : groupedBets[activeOperator] || [];
  const paginatedBets = paginateItems(
    currentTabBets as Bet[],
    currentPage,
    pageSize,
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

            {canExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportDialogOpen(true)}
                className="h-9 gap-1.5 border-[#D8E6DB] bg-white hover:bg-[#F5F8F5] text-[#17251C] font-semibold"
              >
                <Download className="h-4 w-4" />
                <span>Exporter</span>
              </Button>
            )}

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
        <DraftBatchToolbar
          operationType="bets"
          draftCount={draftBets.length}
          showDraftsOnly={showDraftsOnly}
          onToggleDraftsOnly={() => {
            setShowDraftsOnly((v) => !v);
            setCurrentPage(1);
          }}
          selectedIds={selectedDraftIds}
          allDraftIds={draftBets.map((b) => b.id)}
          onSelectAllDrafts={() =>
            setSelectedDraftIds(draftBets.map((b) => b.id))
          }
          onClearSelection={() => setSelectedDraftIds([])}
        />
        <div ref={listTopRef} />
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
                {visibleBets.length}
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
                          (pageSize <= 0 ? 0 : (currentPage - 1) * pageSize) +
                          index +
                          1;
                        return (
                          <TableRow
                            key={bet.id}
                            className="hover:bg-muted/40 transition-colors cursor-pointer group"
                            onClick={() => openEditDialog(bet)}
                          >
                            <TableCell
                              className="text-center font-mono text-xs text-muted-foreground font-semibold"
                              onClick={(e) => {
                                if (bet.validation_status === "brouillon") {
                                  e.stopPropagation();
                                }
                              }}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                {bet.validation_status === "brouillon" && (
                                  <input
                                    type="checkbox"
                                    aria-label={`Sélectionner le brouillon ${bet.id}`}
                                    checked={selectedDraftIds.includes(bet.id)}
                                    onChange={(e) => {
                                      setSelectedDraftIds((prev) =>
                                        e.target.checked
                                          ? [...prev, bet.id]
                                          : prev.filter((id) => id !== bet.id),
                                      );
                                    }}
                                    className="h-3.5 w-3.5 accent-[#006B2D] cursor-pointer"
                                  />
                                )}
                                <span>#{globalIndex}</span>
                              </div>
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
                              ) : bet.validation_status === "brouillon" ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]"
                                >
                                  Brouillon
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-border text-[10px]"
                                >
                                  {bet.validation_status === "en_attente"
                                    ? "En attente"
                                    : bet.validation_status || "Standard"}
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
                                    title="Consulter le justificatif archivé"
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
                      (pageSize <= 0 ? 0 : (currentPage - 1) * pageSize) +
                      index +
                      1;
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
            <TablePaginationFooter
              totalItems={currentTabBets.length}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              itemLabel="tests"
              scrollAnchorRef={listTopRef}
            />
          </div>
        </Tabs>
      </div>

      {/* =========================================================================
          DIALOG DE CRÉATION / MODIFICATION DU PARI
          ========================================================================= */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="shrink-0 border-b border-[#E3ECE5] bg-[#F8FBF9] px-5 pt-5 pb-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
              <DialogTitle className="text-lg font-bold text-[#17251C]">
                {editingBet ? "Consulter le test" : "Nouveau test"}
              </DialogTitle>
              {editingBet && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-white border-[#D8E6DB] text-[#17251C] font-semibold">
                    {editingBet.operator}
                  </Badge>
                  <Badge className="bg-[#006B2D] text-white hover:bg-[#005925] tabular-nums">
                    {Number(editingBet.amount_fcfa || 0).toLocaleString("fr-FR")} FCFA
                  </Badge>
                </div>
              )}
            </div>
            <DialogDescription className="text-xs text-[#556B5C]">
              {HISTORICAL_RESULT_NOTICE}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-6">
            {editingBet?.validation_status === "refuse" && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 space-y-1.5">
                <p className="font-semibold">
                  Opération refusée — veuillez corriger puis resoumettre pour validation
                </p>
                {editingBet.validation_notes && (
                  <p className="text-rose-800 whitespace-pre-wrap">
                    Motif : {editingBet.validation_notes}
                  </p>
                )}
                {Array.isArray(editingBet.refusal_fields) && editingBet.refusal_fields.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="font-medium text-rose-800">Éléments signalés :</span>
                    {editingBet.refusal_fields.map((field) => (
                      <Badge
                        key={field}
                        variant="outline"
                        className="border-rose-300 bg-white text-rose-800 text-[11px]"
                      >
                        {field}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            <RecordForm
              key={`${dialogOpen}-${editingBet?.id || "new"}`}
              existing={!!editingBet}
              onSave={() => handleSubmit(false)}
              onSaveDraft={!editingBet ? () => handleSubmit(true) : undefined}
              onSubmitDraft={
                editingBet?.validation_status === "brouillon"
                  ? async () => {
                      const count = await submitDraftOperationsRecord("bets", [
                        editingBet.id,
                      ]);
                      if (count > 0) setDialogOpen(false);
                    }
                  : undefined
              }
              onClose={() => setDialogOpen(false)}
              onRestore={() => openEditDialog(editingBet!)}
              createLabel="Enregistrer et envoyer"
              saveLabel={
                editingBet?.validation_status === "refuse"
                  ? "Corriger et resoumettre"
                  : undefined
              }
              unlockedUntil={editPermission.unlockedUntil}
              onRequestUnlock={
                editingBet &&
                editingBet.validation_status !== "valide" &&
                !editPermission.allowed
                  ? handleRequestUnlock
                  : undefined
              }
              unlockRequestSent={unlockRequestSent}
              hasDraft={hasDraft}
              draftTime={savedAtFormatted}
              hasConflict={hasConflict}
              onRestoreDraft={restoreDraft}
              onDiscardDraft={discardDraft}
              draftSaveStatus={saveStatus}
              canEdit={editPermission.allowed}
              editBlockedReason={editPermission.reason}
              onArchive={
                editingBet &&
                (user?.role === "ADMIN" || user?.role === "CONTROLEUR")
                  ? async (reason) => {
                      const ok = await archiveOperationRecord(
                        "bets",
                        editingBet.id,
                        reason,
                      );
                      if (ok) setDialogOpen(false);
                    }
                  : undefined
              }
              onTrash={
                editingBet && canUserTrashRecord(user, rolePerms, editingBet)
                  ? async (reason) => {
                      const ok = await trashOperationRecord(
                        "bets",
                        editingBet.id,
                        reason,
                      );
                      if (ok) setDialogOpen(false);
                    }
                  : undefined
              }
              onHardDelete={
                editingBet && user?.role === "ADMIN"
                  ? async () => {
                      const ok = await hardDeleteOperationRecord(
                        "bets",
                        editingBet.id,
                      );
                      if (ok) setDialogOpen(false);
                    }
                  : undefined
              }
              footerClassName="-mx-5 -mb-4 px-5"
            >
              <RecordConsultationSwitch
                summary={
                  <div className="space-y-3 min-w-0">
                    {/* Champ masqué pour accessibilité/tests de cohérence en lecture seule */}
                    <div className="sr-only">
                      <Input
                        placeholder="Ex: MP250326.0415.A49647 ou CI250326.0438.B13742"
                        value={ticketRef}
                        readOnly
                      />
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              editingBet?.validation_status === "valide"
                                ? "default"
                                : editingBet?.validation_status === "refuse"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="gap-1"
                          >
                            {editingBet?.validation_status === "valide"
                              ? "Validé"
                              : editingBet?.validation_status === "refuse"
                                ? "Refusé"
                                : "En attente"}
                          </Badge>
                          <span className="font-semibold text-slate-900">
                            {formData.operator || editingBet?.operator || "Opérateur"}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {formData.date
                            ? new Date(`${formData.date}T00:00:00`).toLocaleDateString("fr-FR")
                            : ""}
                          {formData.time ? ` à ${formData.time.slice(0, 5)}` : ""}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-xs">
                        <div>
                          <span className="text-slate-500 block">Support / Plateforme</span>
                          <span className="font-semibold text-slate-900">
                            {formData.support || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Type</span>
                          <span className="font-semibold text-slate-900">
                            {formData.bet_type || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Montant</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {Number(formData.amount_fcfa || 0).toLocaleString("fr-FR")} FCFA
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Résultat / Statut</span>
                          <span className="font-semibold text-slate-900">
                            {testStatusLabel(formData.status)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Téléphone</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {formData.phone || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Référence</span>
                          <span className="font-semibold text-slate-900 break-all">
                            {ticketRef || "—"}
                          </span>
                        </div>
                        {Number(formData.amount_won_fcfa || 0) > 0 && (
                          <div>
                            <span className="text-slate-500 block">Montant retourné</span>
                            <span className="font-semibold text-emerald-700 tabular-nums">
                              {Number(formData.amount_won_fcfa).toLocaleString("fr-FR")} FCFA
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500 block">Preuve</span>
                          <span className="font-semibold text-slate-900">
                            {formData.proof_status === "disponible"
                              ? "disponible"
                              : formData.proof_status === "non_disponible"
                                ? "absente"
                                : "non renseignée"}
                          </span>
                        </div>
                      </div>

                      {formData.notes && (
                        <div className="pt-1.5 border-t border-slate-200 text-xs">
                          <span className="text-slate-500 block">Notes / Observations</span>
                          <p className="text-slate-800 whitespace-pre-wrap">{formData.notes}</p>
                        </div>
                      )}

                      {formData.ticket_url && (
                        <ProofPreview url={formData.ticket_url} title="Pièce justificative" />
                      )}
                    </div>
                  </div>
                }
              >
              <div className="grid min-w-0 [&>*]:min-w-0 gap-4">
                {/* Bandeau Référence & Horodatage */}
                <div className="rounded-xl border border-[#E3ECE5] bg-[#F5F8F5] p-3.5 space-y-3 min-w-0">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[11px] font-bold text-[#17251C] uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-[#006B2D]" />
                        Référence du test
                      </label>
                      <span className="text-[11px] font-medium text-[#556B5C]">
                        Orange Money • Wave • Moov
                      </span>
                    </div>
                    <Input
                      placeholder="Ex: MP250326.0415.A49647 ou CI250326.0438.B13742"
                      value={ticketRef}
                      onChange={(e) => handleTicketRefChange(e.target.value)}
                      className="h-10 text-sm bg-white border-[#D8E6DB] text-[#17251C]"
                    />
                    {parsedRef?.isValid && (
                      <div className="flex items-center gap-2 text-xs text-[#006B2D] font-semibold bg-white p-2 rounded-lg border border-[#B8DEC6]">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#006B2D]" />
                        <span>{parsedRef.message}</span>
                      </div>
                    )}
                    {existingMatchingBet && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#7A5B00] font-semibold bg-[#FFF8DF] p-2.5 rounded-lg border border-[#EFE0A8]">
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-[#9A7400]" />
                          <span>
                            Référence déjà présente sur un test du{" "}
                            {new Date(`${existingMatchingBet.date}T00:00:00`).toLocaleDateString("fr-FR")}{" "}
                            ({existingMatchingBet.operator}).
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] bg-white border-[#EFE0A8] text-[#7A5B00] hover:bg-[#FFFBEB]"
                          onClick={() =>
                            handleTicketRefChange(`${ticketRef.trim()} (#2)`)
                          }
                        >
                          Différencier (#2)
                        </Button>
                      </div>
                    )}
                  </div>

                  <DateTimeRow
                    date={formData.date}
                    time={formData.time}
                    onDateChange={(val) => setFormData({ ...formData, date: val })}
                    onTimeChange={(val) => setFormData({ ...formData, time: val })}
                  />
                </div>

                {/* Champs principaux en grille aérée 2 colonnes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5 [&>*]:min-w-0">
                  <CreatableSelect
                    label="Opérateur"
                    required
                    value={formData.operator}
                    onChange={(value) =>
                      setFormData({ ...formData, operator: value })
                    }
                    options={operators}
                    placeholder="Sélectionner ou saisir un opérateur..."
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

                  {["Salle de jeux", "Site de test"].includes(formData.support) && venues.length > 0 && (
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                        Point de vente physique
                      </label>
                      <select
                        className="w-full h-10 border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
                        value={selectedVenueId}
                        onChange={(e) => handleVenueSelect(e.target.value)}
                      >
                        <option value="">
                          -- Choisir un site de test enregistré --
                        </option>
                        {venues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.quartier} • {v.operator} • {v.address}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="sm:col-span-2">
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
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                      Montant misé (FCFA) *
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountInput(formData.amount_fcfa)}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          amount_fcfa: parseAmountInput(e.target.value),
                        })
                      }
                      placeholder="0"
                      className="h-10 bg-[#F8FBF9] border-[#D8E6DB] font-semibold text-[#17251C] tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                      Issue du test
                    </label>
                    <select
                      className="w-full h-10 border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
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

                  {formData.status === "gagné" && (
                    <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                      <label className="text-xs font-bold text-emerald-900 uppercase tracking-wider block mb-1">
                        Montant retourné (FCFA)
                      </label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatAmountInput(formData.amount_won_fcfa)}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            amount_won_fcfa: parseAmountInput(e.target.value),
                          })
                        }
                        placeholder="0"
                        className="h-10 bg-white border-emerald-200 font-semibold text-emerald-900 tabular-nums"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                      Téléphone du participant
                    </label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          phone: formatPhoneNumber(e.target.value),
                        })
                      }
                      placeholder="Ex: 70 00 00 00"
                      className="h-10 bg-white border-[#D8E6DB] tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                      Disponibilité de la preuve
                    </label>
                    <select
                      className="w-full h-10 border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
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

                {/* Justificatif & Observations */}
                {formData.ticket_url && (
                  <ProofPreview
                    url={formData.ticket_url}
                    title="Aperçu du justificatif"
                  />
                )}

                {(formData.proof_status === "disponible" || formData.ticket_url) && (
                  <ProofUploader
                    label="Justificatif ou Reçu du test"
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
                    folder="preuves/tests"
                  />
                )}

                {!editingBet && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E3ECE5] bg-[#F5F8F5]">
                    <Checkbox
                      id="auto-trans"
                      checked={autoCreateTransaction}
                      onCheckedChange={(checked) =>
                        setAutoCreateTransaction(Boolean(checked))
                      }
                    />
                    <label
                      htmlFor="auto-trans"
                      className="text-xs font-semibold text-[#17251C] cursor-pointer flex items-center gap-1.5"
                    >
                      <Zap className="h-4 w-4 shrink-0 text-[#006B2D]" />
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
              </RecordConsultationSwitch>
            </RecordForm>
            {editingBet && (
              <OperationCommentsPanel
                operationType="bets"
                operationId={editingBet.id}
                operator={editingBet.operator}
                amountFcfa={editingBet.amount_fcfa}
                reference={editingBet.reference}
                authorId={editingBet.created_by}
              />
            )}
          </div>
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
