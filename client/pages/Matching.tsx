import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { RequireAuth, RequireRole, useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { DatePickerCustom } from "@/components/ui/date-picker-custom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBets, useLookups, useTransactions } from "@/hooks/use-data-queries";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { useSettings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { readRecordReference } from "@/lib/record-reference";
import { testStatusLabel } from "@/lib/test-vocabulary";
import {
  canModifyBetMatch,
  cleanMatchingNotes,
  computeMatchingAnalysis,
  loadRejectedPairs,
  removeLinkedTxId,
  saveRejectedPairs,
  writeLinkedTxId,
  type MatchedPair,
  type MatchingSuggestion,
} from "@/lib/matching";
import type { Bet, Transaction } from "@/data/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeftRight,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Unlink,
  XCircle,
} from "lucide-react";

type PeriodPreset = "all" | "today" | "week" | "month" | "range";

function toIsoDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(amount: number | null | undefined): string {
  return `${new Intl.NumberFormat("fr-FR").format(Number(amount) || 0)} F CFA`;
}

function formatDateFr(date: string | null | undefined): string {
  if (!date) return "—";
  const parts = String(date).slice(0, 10).split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTimeShort(time: string | null | undefined): string {
  if (!time) return "—";
  return String(time).slice(0, 5);
}

function getDisplayRef(record: {
  reference?: string | null;
  notes?: string | null;
}): string {
  const cleanNotes = cleanMatchingNotes(record.notes);
  const parsed = readRecordReference({
    reference: record.reference,
    notes: cleanNotes,
  });
  return parsed.reference || "Sans référence";
}

function scoreBadgeClass(score: number): string {
  if (score >= 85) {
    return "bg-[#006B2D] text-white border-[#006B2D]";
  }
  if (score >= 60) {
    return "bg-amber-100 text-amber-900 border-amber-300";
  }
  return "bg-slate-100 text-slate-800 border-slate-300";
}

function confidenceLabel(score: number): string {
  if (score >= 85) return "Forte confiance";
  if (score >= 60) return "Confiance moyenne";
  return "À vérifier";
}

export function MatchingPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "CONTROLEUR", "AGENT"]}>
        <MatchingContent />
      </RequireRole>
    </RequireAuth>
  );
}

export default MatchingPage;

function MatchingContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [minScore, setMinScore] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "suggestions" | "matched" | "manual" | "rejected"
  >("suggestions");

  const [rejectedIds, setRejectedIds] = useState<Set<string>>(() =>
    loadRejectedPairs(user?.id),
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Sélection manuelle (onglet "Sans lien")
  const [selectedTxId, setSelectedTxId] = useState<string>("");
  const [selectedBetId, setSelectedBetId] = useState<string>("");

  // Modale de comparaison détaillée
  const [detailModal, setDetailModal] = useState<{
    mode: "suggestion" | "matched";
    id: string;
    tx: Transaction;
    bet: Bet;
    score: number;
    reasons: string[];
  } | null>(null);

  useEffect(() => {
    setRejectedIds(loadRejectedPairs(user?.id));
  }, [user?.id]);

  const {
    data: transactions = [],
    isLoading: loadingTx,
    isFetching: fetchingTx,
    refetch: refetchTx,
  } = useTransactions({ limit: 1000 });

  const {
    data: bets = [],
    isLoading: loadingBets,
    isFetching: fetchingBets,
    refetch: refetchBets,
  } = useBets();

  const { data: lookupsData } = useLookups();

  const operatorOptions = useMemo(() => {
    const set = new Set<string>(lookupsData?.operatorNames || []);
    for (const tx of transactions) {
      if (tx.operator?.trim()) set.add(tx.operator.trim());
    }
    for (const b of bets) {
      if (b.operator?.trim()) set.add(b.operator.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [lookupsData?.operatorNames, transactions, bets]);

  function applyPeriodPreset(next: PeriodPreset) {
    const now = new Date();
    setPeriod(next);
    setPage(1);

    if (next === "all") {
      setStartDate("");
      setEndDate("");
    } else if (next === "today") {
      const today = toIsoDateLocal(now);
      setStartDate(today);
      setEndDate(today);
    } else if (next === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setStartDate(toIsoDateLocal(start));
      setEndDate(toIsoDateLocal(now));
    } else if (next === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(toIsoDateLocal(first));
      setEndDate(toIsoDateLocal(last));
    }
  }

  function resetFilters() {
    setPeriod("all");
    setStartDate("");
    setEndDate("");
    setOperatorFilter("");
    setMinScore(0);
    setSearchQuery("");
    setPage(1);
  }

  const analysis = useMemo(
    () =>
      computeMatchingAnalysis(transactions, bets, {
        windowMinutes: settings?.matchingWindowMinutes ?? 30,
        amountTolerancePercent: settings?.amountTolerancePercent ?? 5,
        minScore,
        operatorFilter,
        query: searchQuery,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        rejectedIds,
      }),
    [
      transactions,
      bets,
      settings?.matchingWindowMinutes,
      settings?.amountTolerancePercent,
      minScore,
      operatorFilter,
      searchQuery,
      startDate,
      endDate,
      rejectedIds,
    ],
  );

  const highConfidenceCount = useMemo(
    () => analysis.suggestions.filter((s) => s.score >= 85).length,
    [analysis.suggestions],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(analysis.suggestions.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedSuggestions = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return analysis.suggestions.slice(startIdx, startIdx + pageSize);
  }, [analysis.suggestions, currentPage]);

  const selectedManualTx = useMemo(
    () =>
      analysis.unmatchedTransactions.find((tx) => tx.id === selectedTxId) ||
      null,
    [analysis.unmatchedTransactions, selectedTxId],
  );
  const selectedManualBet = useMemo(
    () => analysis.unmatchedBets.find((b) => b.id === selectedBetId) || null,
    [analysis.unmatchedBets, selectedBetId],
  );

  async function refreshAll() {
    await Promise.all([refetchTx(), refetchBets()]);
    toast.success("Données actualisées.");
  }

  async function linkBetToTransaction(bet: Bet, tx: Transaction, key: string) {
    if (!canModifyBetMatch(user?.role, bet.validation_status)) {
      toast.error(
        user?.role === "CONTROLEUR"
          ? "Ce test est déjà validé : seul un administrateur peut le rapprocher."
          : "Droits insuffisants pour enregistrer ce rapprochement.",
      );
      return;
    }

    setBusyKey(key);
    try {
      const nextNotes = writeLinkedTxId(bet.notes, tx.id);
      const { error } = await supabase
        .from("bets")
        .update({ notes: nextNotes })
        .eq("id", bet.id)
        .select("id, notes")
        .single();

      if (error) throw error;

      invalidateRelatedQueries("bets");
      await refetchBets();
      setSelectedTxId("");
      setSelectedBetId("");
      setDetailModal(null);
      toast.success("Rapprochement enregistré avec succès.");
    } catch (err: any) {
      console.error("Erreur validation rapprochement:", err);
      toast.error(
        err?.message || "Impossible d'enregistrer le rapprochement.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function unlinkBet(pair: MatchedPair) {
    if (!canModifyBetMatch(user?.role, pair.bet.validation_status)) {
      toast.error(
        user?.role === "CONTROLEUR"
          ? "Ce test est déjà validé : seul un administrateur peut le dissocier."
          : "Droits insuffisants pour dissocier ce rapprochement.",
      );
      return;
    }

    setBusyKey(`unlink-${pair.id}`);
    try {
      const nextNotes = removeLinkedTxId(pair.bet.notes);
      const { error } = await supabase
        .from("bets")
        .update({ notes: nextNotes })
        .eq("id", pair.bet.id)
        .select("id, notes")
        .single();

      if (error) throw error;

      invalidateRelatedQueries("bets");
      await refetchBets();
      setDetailModal(null);
      toast.success("Rapprochement dissocié.");
    } catch (err: any) {
      console.error("Erreur dissociation rapprochement:", err);
      toast.error(err?.message || "Impossible de dissocier ce rapprochement.");
    } finally {
      setBusyKey(null);
    }
  }

  function dismissSuggestion(suggestionId: string) {
    const next = new Set(rejectedIds);
    next.add(suggestionId);
    setRejectedIds(next);
    saveRejectedPairs(user?.id, next);
    toast.success("Suggestion écartée.");
  }

  function restoreSuggestion(suggestionId: string) {
    const next = new Set(rejectedIds);
    next.delete(suggestionId);
    setRejectedIds(next);
    saveRejectedPairs(user?.id, next);
    toast.success("Suggestion restaurée.");
  }

  function restoreAllRejected() {
    const empty = new Set<string>();
    setRejectedIds(empty);
    saveRejectedPairs(user?.id, empty);
    toast.success("Toutes les suggestions écartées ont été restaurées.");
  }

  function goToOperation(target: "tx" | "bet", record: { reference?: string | null; notes?: string | null }) {
    const ref = getDisplayRef(record);
    const base = target === "tx" ? "/transactions" : "/tests";
    if (ref && ref !== "Sans référence") {
      navigate(`${base}?ref=${encodeURIComponent(ref)}`);
    } else {
      navigate(base);
    }
  }

  const isLoading = loadingTx || loadingBets;
  const isFetching = fetchingTx || fetchingBets;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* En-tête pédagogique */}
        <div className="border-b border-[#D8E6DB] pb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#006B2D] text-white shrink-0">
              <Link2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#17251C]">
                Rapprochement Transactions ↔ Tests
              </h1>
              <p className="text-xs sm:text-sm text-[#556B5C] mt-0.5">
                Associez chaque dépôt ou retrait au test de pari correspondant pour vérifier la cohérence des montants, des dates et des opérateurs.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowHelp((prev) => !prev)}
              className="min-h-11 bg-white border-[#D8E6DB] text-[#17251C] hover:bg-[#F5F8F5] gap-2"
            >
              <HelpCircle className="h-4 w-4 text-[#006B2D]" />
              <span>{showHelp ? "Masquer l'aide" : "Comment ça marche ?"}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={refreshAll}
              disabled={isFetching}
              className="min-h-11 bg-white border-[#D8E6DB] text-[#17251C] hover:bg-[#F5F8F5] gap-2"
            >
              <RefreshCw
                className={cn("h-4 w-4 text-[#006B2D]", isFetching && "animate-spin")}
              />
              <span>Actualiser</span>
            </Button>
          </div>
        </div>

        {/* Encadré d'aide repliable */}
        {showHelp && (
          <div className="rounded-xl border border-[#C2DEC9] bg-[#F5F8F5] p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#17251C]">
              <Sparkles className="h-4 w-4 text-[#006B2D]" />
              <span>Comprendre le rapprochement en 3 étapes simples</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[#344A3D]">
              <div className="rounded-lg border border-[#D8E6DB] bg-white p-3 space-y-1">
                <p className="font-bold text-[#17251C]">
                  1. Calcul du score sur 100
                </p>
                <p>
                  Seules les opérations du <strong>même jour</strong> et du{" "}
                  <strong>même opérateur</strong> sont comparées (40 pts), puis
                  l’heure proche (±{settings?.matchingWindowMinutes ?? 30} min :
                  jusqu’à 30 pts), le montant (±{settings?.amountTolerancePercent ?? 5}% :
                  jusqu’à 20 pts) et le téléphone ou l’agent (10 pts).
                </p>
              </div>
              <div className="rounded-lg border border-[#D8E6DB] bg-white p-3 space-y-1">
                <p className="font-bold text-[#17251C]">
                  2. Valider ou écarter
                </p>
                <p>
                  Sur chaque suggestion, comparez la transaction (à gauche) et le
                  test (à droite). Cliquez sur{" "}
                  <strong>Valider le rapprochement</strong> pour enregistrer le lien
                  en base, ou <strong>Écarter</strong> si la paire ne correspond pas.
                </p>
              </div>
              <div className="rounded-lg border border-[#D8E6DB] bg-white p-3 space-y-1">
                <p className="font-bold text-[#17251C]">
                  3. Liaison manuelle des orphelins
                </p>
                <p>
                  L’onglet <strong>Sans lien</strong> regroupe les opérations non
                  encore rapprochées. Sélectionnez-en une dans chaque colonne pour les
                  associer manuellement, même si la date ou le montant diffèrent.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4 Cartes KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#D8E6DB] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#556B5C]">
                À rapprocher
              </span>
              <Sparkles className="h-4 w-4 text-[#006B2D]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#17251C]">
                {analysis.suggestions.length}
              </span>
              {highConfidenceCount > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-[#006B2D]">
                  {highConfidenceCount} forte(s)
                </span>
              )}
            </div>
            <p className="text-xs text-[#556B5C] mt-1">
              Suggestions automatiques prêtes
            </p>
          </div>

          <div className="rounded-xl border border-[#D8E6DB] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#556B5C]">
                Rapprochés
              </span>
              <CheckCircle2 className="h-4 w-4 text-[#006B2D]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#006B2D]">
              {analysis.matchedPairs.length}
            </div>
            <p className="text-xs text-[#556B5C] mt-1">
              Couples déjà liés et enregistrés
            </p>
          </div>

          <div className="rounded-xl border border-[#D8E6DB] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#556B5C]">
                Sans lien
              </span>
              <Unlink className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#17251C]">
              {analysis.unmatchedTransactions.length +
                analysis.unmatchedBets.length}
            </div>
            <p className="text-xs text-[#556B5C] mt-1">
              {analysis.unmatchedTransactions.length} trans. •{" "}
              {analysis.unmatchedBets.length} tests orphelins
            </p>
          </div>

          <div className="rounded-xl border border-[#D8E6DB] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#556B5C]">
                Écartées
              </span>
              <EyeOff className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-700">
              {analysis.rejectedSuggestions.length}
            </div>
            <p className="text-xs text-[#556B5C] mt-1">
              Suggestions masquées manuellement
            </p>
          </div>
        </div>

        {/* Barre de filtres responsive */}
        <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                Recherche rapide
              </label>
              <div className="relative">
                <Search className="h-4 w-4 text-[#556B5C] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Référence, téléphone, montant, opérateur…"
                  className="pl-9 min-h-11 bg-white border-[#D8E6DB]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                Période
              </label>
              <select
                value={period}
                onChange={(e) =>
                  applyPeriodPreset(e.target.value as PeriodPreset)
                }
                className="w-full min-h-11 rounded-md border border-[#D8E6DB] bg-white px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
              >
                <option value="all">Toutes les dates</option>
                <option value="today">Aujourd’hui</option>
                <option value="week">7 derniers jours</option>
                <option value="month">Ce mois</option>
                <option value="range">Intervalle personnalisé</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                Opérateur
              </label>
              <select
                value={operatorFilter || "all"}
                onChange={(e) => {
                  setOperatorFilter(
                    e.target.value === "all" ? "" : e.target.value,
                  );
                  setPage(1);
                }}
                className="w-full min-h-11 rounded-md border border-[#D8E6DB] bg-white px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
              >
                <option value="all">Tous les opérateurs</option>
                {operatorOptions.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                Niveau de confiance
              </label>
              <select
                value={String(minScore)}
                onChange={(e) => {
                  setMinScore(Number(e.target.value) || 0);
                  setPage(1);
                }}
                className="w-full min-h-11 rounded-md border border-[#D8E6DB] bg-white px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
              >
                <option value="0">Toutes (≥ 40 pts)</option>
                <option value="60">Moyenne et forte (≥ 60 pts)</option>
                <option value="85">Forte uniquement (≥ 85 pts)</option>
              </select>
            </div>
          </div>

          {(period === "range" || startDate || endDate || operatorFilter || minScore > 0 || searchQuery) && (
            <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-[#EEF4EF]">
              {period === "range" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:w-auto sm:min-w-[440px]">
                  <DatePickerCustom
                    label="Du"
                    value={startDate}
                    onChange={(val) => {
                      setStartDate(val);
                      setPage(1);
                    }}
                    showPresets={false}
                  />
                  <DatePickerCustom
                    label="Au"
                    value={endDate}
                    onChange={(val) => {
                      setEndDate(val);
                      setPage(1);
                    }}
                    showPresets={false}
                  />
                </div>
              ) : (
                <div className="text-xs text-[#556B5C]">
                  {startDate || endDate ? (
                    <span>
                      Période active :{" "}
                      <strong className="text-[#17251C]">
                        {formatDateFr(startDate)} → {formatDateFr(endDate)}
                      </strong>
                    </span>
                  ) : (
                    <span>Filtres actifs appliqués</span>
                  )}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={resetFilters}
                className="min-h-11 border-[#D8E6DB] text-[#17251C] hover:bg-[#F5F8F5] gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Réinitialiser les filtres</span>
              </Button>
            </div>
          )}
        </div>

        {/* Onglets principaux */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto gap-1 rounded-xl bg-[#EEF4EF] p-1 border border-[#D8E6DB]">
            <TabsTrigger
              value="suggestions"
              className="min-h-10 rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#006B2D]"
            >
              À rapprocher ({analysis.suggestions.length})
            </TabsTrigger>
            <TabsTrigger
              value="matched"
              className="min-h-10 rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#006B2D]"
            >
              Rapprochés ({analysis.matchedPairs.length})
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              className="min-h-10 rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#006B2D]"
            >
              Sans lien ({analysis.unmatchedTransactions.length + analysis.unmatchedBets.length})
            </TabsTrigger>
            <TabsTrigger
              value="rejected"
              className="min-h-10 rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#006B2D]"
            >
              Écartées ({analysis.rejectedSuggestions.length})
            </TabsTrigger>
          </TabsList>

          {/* ONGLET 1 : SUGGESTIONS */}
          <TabsContent value="suggestions" className="space-y-3 mt-0">
            {isLoading ? (
              <div className="rounded-xl border border-[#D8E6DB] bg-white p-8 flex items-center justify-center gap-2 text-sm text-[#556B5C]">
                <Loader2 className="h-4 w-4 animate-spin text-[#006B2D]" />
                <span>Analyse des transactions et des tests en cours…</span>
              </div>
            ) : paginatedSuggestions.length === 0 ? (
              <div className="rounded-xl border border-[#D8E6DB] bg-white p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-[#17251C]">
                  Aucune suggestion automatique trouvée pour ces critères.
                </p>
                <p className="text-xs text-[#556B5C] max-w-md mx-auto">
                  Vous pouvez élargir la période à « Toutes les dates », abaisser le niveau de confiance, ou utiliser l’onglet « Sans lien » pour associer manuellement deux opérations.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetFilters}
                    className="min-h-11 border-[#D8E6DB]"
                  >
                    Tout afficher
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setActiveTab("manual")}
                    className="min-h-11 bg-[#006B2D] hover:bg-[#005222] text-white"
                  >
                    Ouvrir « Sans lien »
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedSuggestions.map((s) => {
                    const canWrite = canModifyBetMatch(
                      user?.role,
                      s.bet.validation_status,
                    );
                    const isSaving = busyKey === `link-${s.id}`;
                    return (
                      <div
                        key={s.id}
                        className="rounded-xl border border-[#D8E6DB] bg-white p-4 space-y-4"
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px_1fr] gap-4 items-stretch">
                          {/* Bloc Transaction */}
                          <div className="rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-3 space-y-2 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#006B2D]">
                                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                                Transaction ({s.tx.type})
                              </span>
                              <button
                                type="button"
                                onClick={() => goToOperation("tx", s.tx)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#006B2D] hover:underline"
                              >
                                <span>Ouvrir</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <span className="text-base font-bold text-[#17251C]">
                                {formatMoney(s.tx.amount_fcfa)}
                              </span>
                              <span className="text-xs font-medium text-[#556B5C]">
                                {formatDateFr(s.tx.date)} • {formatTimeShort(s.tx.time)}
                              </span>
                            </div>
                            <div className="text-xs text-[#344A3D] space-y-0.5">
                              <p className="truncate">
                                <strong>Opérateur :</strong> {s.tx.operator || "—"} •{" "}
                                {s.tx.payment_operator || "—"}
                              </p>
                              <p className="break-all">
                                <strong>Référence :</strong> {getDisplayRef(s.tx)}
                              </p>
                              {s.tx.phone && (
                                <p>
                                  <strong>Tél :</strong> {s.tx.phone}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Bloc Score & Critères */}
                          <div className="rounded-lg border border-[#D8E6DB] bg-white p-3 flex flex-col items-center justify-center text-center space-y-2">
                            <div
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-bold",
                                scoreBadgeClass(s.score),
                              )}
                            >
                              <span>{s.score} / 100</span>
                            </div>
                            <span className="text-xs font-bold text-[#17251C]">
                              {confidenceLabel(s.score)}
                            </span>
                            <div className="flex flex-wrap justify-center gap-1">
                              {s.reasons.map((reason) => (
                                <span
                                  key={reason}
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-[#EEF4EF] text-[#173B28] font-medium"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Bloc Test */}
                          <div className="rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-3 space-y-2 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#17251C]">
                                <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-[#006B2D]" />
                                Test ({testStatusLabel(s.bet.status)})
                              </span>
                              <button
                                type="button"
                                onClick={() => goToOperation("bet", s.bet)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#006B2D] hover:underline"
                              >
                                <span>Ouvrir</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <span className="text-base font-bold text-[#17251C]">
                                {formatMoney(s.bet.amount_fcfa)}
                              </span>
                              <span className="text-xs font-medium text-[#556B5C]">
                                {formatDateFr(s.bet.date)} • {formatTimeShort(s.bet.time)}
                              </span>
                            </div>
                            <div className="text-xs text-[#344A3D] space-y-0.5">
                              <p className="truncate">
                                <strong>Opérateur :</strong> {s.bet.operator || "—"} •{" "}
                                {s.bet.bet_type || "—"}
                              </p>
                              <p className="break-all">
                                <strong>Référence :</strong> {getDisplayRef(s.bet)}
                              </p>
                              {s.bet.phone && (
                                <p>
                                  <strong>Tél :</strong> {s.bet.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#EEF4EF]">
                          <div className="text-xs text-[#556B5C]">
                            {!canWrite && (
                              <span>
                                {user?.role === "CONTROLEUR"
                                  ? "Test déjà validé — validation réservée à l’administrateur."
                                  : "Mode consultation — validation réservée au contrôleur ou à l’administrateur."}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                setDetailModal({
                                  mode: "suggestion",
                                  id: s.id,
                                  tx: s.tx,
                                  bet: s.bet,
                                  score: s.score,
                                  reasons: s.reasons,
                                })
                              }
                              className="min-h-11 border-[#D8E6DB] text-[#17251C] gap-1.5"
                            >
                              <Eye className="h-4 w-4" />
                              <span>Comparer</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => dismissSuggestion(s.id)}
                              className="min-h-11 border-[#D8E6DB] text-[#C43636] hover:bg-red-50 gap-1.5"
                            >
                              <XCircle className="h-4 w-4" />
                              <span>Écarter</span>
                            </Button>
                            <Button
                              type="button"
                              disabled={!canWrite || isSaving}
                              onClick={() =>
                                linkBetToTransaction(
                                  s.bet,
                                  s.tx,
                                  `link-${s.id}`,
                                )
                              }
                              className="min-h-11 bg-[#006B2D] hover:bg-[#005222] text-white gap-1.5"
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              <span>Valider le rapprochement</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 rounded-xl border border-[#D8E6DB] bg-white px-4 py-3 text-sm">
                  <span className="text-xs text-[#556B5C]">
                    {analysis.suggestions.length} suggestion(s) • Page{" "}
                    <strong>{currentPage}</strong> sur <strong>{totalPages}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="min-h-11 border-[#D8E6DB]"
                    >
                      Précédent
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="min-h-11 border-[#D8E6DB]"
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* ONGLET 2 : RAPPROCHÉS */}
          <TabsContent value="matched" className="space-y-3 mt-0">
            {analysis.matchedPairs.length === 0 ? (
              <div className="rounded-xl border border-[#D8E6DB] bg-white p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-[#17251C]">
                  Aucun couple rapproché pour ces filtres.
                </p>
                <p className="text-xs text-[#556B5C]">
                  Validez une proposition dans l’onglet « À rapprocher » ou créez un lien dans « Sans lien ».
                </p>
              </div>
            ) : (
              analysis.matchedPairs.map((pair) => {
                const canWrite = canModifyBetMatch(
                  user?.role,
                  pair.bet.validation_status,
                );
                const isUnlinking = busyKey === `unlink-${pair.id}`;
                return (
                  <div
                    key={pair.id}
                    className="rounded-xl border border-[#D8E6DB] bg-white p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-100 text-[#006B2D] border border-emerald-300 hover:bg-emerald-100">
                          Rapproché
                        </Badge>
                        <span className="text-xs font-semibold text-[#17251C]">
                          {pair.tx.operator || pair.bet.operator} •{" "}
                          {formatDateFr(pair.tx.date)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {pair.reasons.map((r) => (
                          <span
                            key={r}
                            className="text-[11px] px-2 py-0.5 rounded bg-[#EEF4EF] text-[#173B28]"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-3 text-xs space-y-1">
                        <div className="font-bold text-[#006B2D]">
                          Transaction ({pair.tx.type}) —{" "}
                          {formatMoney(pair.tx.amount_fcfa)}
                        </div>
                        <div>
                          Heure : {formatTimeShort(pair.tx.time)} • Réf :{" "}
                          <span className="font-medium break-all">
                            {getDisplayRef(pair.tx)}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-3 text-xs space-y-1">
                        <div className="font-bold text-[#17251C]">
                          Test ({testStatusLabel(pair.bet.status)}) —{" "}
                          {formatMoney(pair.bet.amount_fcfa)}
                        </div>
                        <div>
                          Heure : {formatTimeShort(pair.bet.time)} • Réf :{" "}
                          <span className="font-medium break-all">
                            {getDisplayRef(pair.bet)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#EEF4EF]">
                      <span className="text-xs text-[#556B5C]">
                        {!canWrite &&
                          (user?.role === "CONTROLEUR"
                            ? "Test déjà validé — dissociation réservée à l’administrateur."
                            : "Lecture seule.")}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setDetailModal({
                              mode: "matched",
                              id: pair.id,
                              tx: pair.tx,
                              bet: pair.bet,
                              score: pair.score,
                              reasons: pair.reasons,
                            })
                          }
                          className="min-h-11 border-[#D8E6DB] gap-1.5"
                        >
                          <Eye className="h-4 w-4" />
                          <span>Comparer</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!canWrite || isUnlinking}
                          onClick={() => unlinkBet(pair)}
                          className="min-h-11 border-[#D8E6DB] text-[#C43636] hover:bg-red-50 gap-1.5"
                        >
                          {isUnlinking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link2Off className="h-4 w-4" />
                          )}
                          <span>Dissocier</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* ONGLET 3 : LIAISON MANUELLE (SANS LIEN) */}
          <TabsContent value="manual" className="space-y-4 mt-0">
            <div className="rounded-xl border border-[#C2DEC9] bg-[#F5F8F5] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1 text-xs text-[#344A3D]">
                <p className="text-sm font-bold text-[#17251C] flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-[#006B2D]" />
                  Association manuelle
                </p>
                {selectedManualTx && selectedManualBet ? (
                  <p>
                    Sélection prête :{" "}
                    <strong>
                      {selectedManualTx.operator} ({formatMoney(selectedManualTx.amount_fcfa)})
                    </strong>{" "}
                    ↔{" "}
                    <strong>
                      {selectedManualBet.operator} ({formatMoney(selectedManualBet.amount_fcfa)})
                    </strong>
                  </p>
                ) : (
                  <p>
                    Sélectionnez une transaction à gauche et un test à droite pour les relier manuellement.
                  </p>
                )}
              </div>

              <Button
                type="button"
                disabled={
                  !selectedManualTx ||
                  !selectedManualBet ||
                  !canModifyBetMatch(
                    user?.role,
                    selectedManualBet?.validation_status,
                  ) ||
                  busyKey === "manual-link"
                }
                onClick={() => {
                  if (selectedManualTx && selectedManualBet) {
                    void linkBetToTransaction(
                      selectedManualBet,
                      selectedManualTx,
                      "manual-link",
                    );
                  }
                }}
                className="min-h-11 bg-[#006B2D] hover:bg-[#005222] text-white shrink-0 gap-2"
              >
                {busyKey === "manual-link" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                <span>Lier manuellement ces 2 opérations</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Colonne gauche : Transactions sans lien */}
              <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#EEF4EF] pb-2">
                  <h2 className="text-sm font-bold text-[#17251C]">
                    Transactions sans lien ({analysis.unmatchedTransactions.length})
                  </h2>
                  {selectedTxId && (
                    <button
                      type="button"
                      onClick={() => setSelectedTxId("")}
                      className="text-xs text-[#006B2D] hover:underline"
                    >
                      Désélectionner
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {analysis.unmatchedTransactions.length === 0 ? (
                    <p className="text-xs text-[#556B5C] py-6 text-center">
                      Toutes les transactions de la période sont déjà rapprochées.
                    </p>
                  ) : (
                    analysis.unmatchedTransactions.slice(0, 60).map((tx) => {
                      const active = selectedTxId === tx.id;
                      return (
                        <button
                          key={tx.id}
                          type="button"
                          onClick={() => setSelectedTxId(active ? "" : tx.id)}
                          className={cn(
                            "w-full text-left rounded-lg border p-3 transition-colors space-y-1",
                            active
                              ? "border-[#006B2D] bg-[#EEF4EF]"
                              : "border-[#D8E6DB] bg-white hover:bg-[#F5F8F5]",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#17251C]">
                              {tx.operator} • {tx.type}
                            </span>
                            <span className="text-sm font-bold text-[#006B2D]">
                              {formatMoney(tx.amount_fcfa)}
                            </span>
                          </div>
                          <div className="text-xs text-[#556B5C] flex flex-wrap justify-between gap-1">
                            <span>
                              {formatDateFr(tx.date)} • {formatTimeShort(tx.time)}
                            </span>
                            <span className="break-all">{getDisplayRef(tx)}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Colonne droite : Tests sans lien */}
              <div className="rounded-xl border border-[#D8E6DB] bg-white p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#EEF4EF] pb-2">
                  <h2 className="text-sm font-bold text-[#17251C]">
                    Tests sans lien ({analysis.unmatchedBets.length})
                  </h2>
                  {selectedBetId && (
                    <button
                      type="button"
                      onClick={() => setSelectedBetId("")}
                      className="text-xs text-[#006B2D] hover:underline"
                    >
                      Désélectionner
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {analysis.unmatchedBets.length === 0 ? (
                    <p className="text-xs text-[#556B5C] py-6 text-center">
                      Tous les tests de la période sont déjà rapprochés.
                    </p>
                  ) : (
                    analysis.unmatchedBets.slice(0, 60).map((bet) => {
                      const active = selectedBetId === bet.id;
                      const writable = canModifyBetMatch(
                        user?.role,
                        bet.validation_status,
                      );
                      return (
                        <button
                          key={bet.id}
                          type="button"
                          onClick={() => setSelectedBetId(active ? "" : bet.id)}
                          className={cn(
                            "w-full text-left rounded-lg border p-3 transition-colors space-y-1",
                            active
                              ? "border-[#006B2D] bg-[#EEF4EF]"
                              : "border-[#D8E6DB] bg-white hover:bg-[#F5F8F5]",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#17251C]">
                              {bet.operator} • {testStatusLabel(bet.status)}
                            </span>
                            <span className="text-sm font-bold text-[#17251C]">
                              {formatMoney(bet.amount_fcfa)}
                            </span>
                          </div>
                          <div className="text-xs text-[#556B5C] flex flex-wrap justify-between gap-1">
                            <span>
                              {formatDateFr(bet.date)} • {formatTimeShort(bet.time)}
                            </span>
                            <span className="break-all">{getDisplayRef(bet)}</span>
                          </div>
                          {!writable && user?.role === "CONTROLEUR" && (
                            <div className="text-[11px] text-amber-800">
                              Déjà validé (modification réservée à l’administrateur)
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ONGLET 4 : SUGGESTIONS ÉCARTÉES */}
          <TabsContent value="rejected" className="space-y-3 mt-0">
            {analysis.rejectedSuggestions.length === 0 ? (
              <div className="rounded-xl border border-[#D8E6DB] bg-white p-8 text-center text-sm text-[#556B5C]">
                Aucune suggestion écartée pour ces filtres.
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={restoreAllRejected}
                    className="min-h-11 border-[#D8E6DB] gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Tout restaurer</span>
                  </Button>
                </div>
                {analysis.rejectedSuggestions.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[#D8E6DB] bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 text-xs min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full border font-bold",
                            scoreBadgeClass(s.score),
                          )}
                        >
                          {s.score} / 100
                        </span>
                        <span className="font-bold text-[#17251C]">
                          {s.operator} • {formatDateFr(s.tx.date)}
                        </span>
                      </div>
                      <p className="text-[#344A3D] break-all">
                        Transaction : {formatMoney(s.tx.amount_fcfa)} ({getDisplayRef(s.tx)}) ↔ Test : {formatMoney(s.bet.amount_fcfa)} ({getDisplayRef(s.bet)})
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => restoreSuggestion(s.id)}
                      className="min-h-11 border-[#D8E6DB] text-[#006B2D] shrink-0 gap-1.5"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Restaurer</span>
                    </Button>
                  </div>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Modale de comparaison détaillée */}
        <Dialog
          open={!!detailModal}
          onOpenChange={(open) => !open && setDetailModal(null)}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#17251C]">
                Comparaison détaillée du couple
              </DialogTitle>
              <DialogDescription className="text-sm text-[#556B5C]">
                Vérifiez côte à côte la transaction financière et le test de pari avant de valider ou dissocier.
              </DialogDescription>
            </DialogHeader>

            {detailModal && (
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-2.5 py-0.5 rounded-full border text-xs font-bold",
                        scoreBadgeClass(detailModal.score),
                      )}
                    >
                      Score : {detailModal.score} / 100
                    </span>
                    <span className="text-xs font-semibold text-[#17251C]">
                      {confidenceLabel(detailModal.score)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {detailModal.reasons.map((r) => (
                      <span
                        key={r}
                        className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#D8E6DB] text-[#173B28]"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-[#D8E6DB] bg-white p-3 space-y-2">
                    <div className="font-bold text-sm text-[#006B2D] border-b border-[#EEF4EF] pb-1.5">
                      Transaction ({detailModal.tx.type})
                    </div>
                    <p><strong>Date :</strong> {formatDateFr(detailModal.tx.date)}</p>
                    <p><strong>Heure :</strong> {formatTimeShort(detailModal.tx.time)}</p>
                    <p><strong>Opérateur :</strong> {detailModal.tx.operator || "—"}</p>
                    <p><strong>Plateforme :</strong> {detailModal.tx.platform || "—"}</p>
                    <p><strong>Paiement :</strong> {detailModal.tx.payment_operator || "—"}</p>
                    <p><strong>Montant :</strong> {formatMoney(detailModal.tx.amount_fcfa)}</p>
                    <p><strong>Téléphone :</strong> {detailModal.tx.phone || "—"}</p>
                    <p className="break-all"><strong>Référence :</strong> {getDisplayRef(detailModal.tx)}</p>
                    {cleanMatchingNotes(detailModal.tx.notes) && (
                      <p><strong>Notes :</strong> {cleanMatchingNotes(detailModal.tx.notes)}</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-[#D8E6DB] bg-white p-3 space-y-2">
                    <div className="font-bold text-sm text-[#17251C] border-b border-[#EEF4EF] pb-1.5">
                      Test ({testStatusLabel(detailModal.bet.status)})
                    </div>
                    <p><strong>Date :</strong> {formatDateFr(detailModal.bet.date)}</p>
                    <p><strong>Heure :</strong> {formatTimeShort(detailModal.bet.time)}</p>
                    <p><strong>Opérateur :</strong> {detailModal.bet.operator || "—"}</p>
                    <p><strong>Support :</strong> {detailModal.bet.support || "—"}</p>
                    <p><strong>Type de pari :</strong> {detailModal.bet.bet_type || "—"}</p>
                    <p><strong>Montant :</strong> {formatMoney(detailModal.bet.amount_fcfa)}</p>
                    <p><strong>Téléphone :</strong> {detailModal.bet.phone || "—"}</p>
                    <p className="break-all"><strong>Référence :</strong> {getDisplayRef(detailModal.bet)}</p>
                    {cleanMatchingNotes(detailModal.bet.notes) && (
                      <p><strong>Notes :</strong> {cleanMatchingNotes(detailModal.bet.notes)}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-[#EEF4EF] pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDetailModal(null)}
                    className="min-h-11 border-[#D8E6DB]"
                  >
                    Fermer
                  </Button>
                  {detailModal.mode === "suggestion" ? (
                    <Button
                      type="button"
                      disabled={
                        !canModifyBetMatch(
                          user?.role,
                          detailModal.bet.validation_status,
                        ) || busyKey === `modal-${detailModal.id}`
                      }
                      onClick={() =>
                        linkBetToTransaction(
                          detailModal.bet,
                          detailModal.tx,
                          `modal-${detailModal.id}`,
                        )
                      }
                      className="min-h-11 bg-[#006B2D] hover:bg-[#005222] text-white gap-1.5"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Valider le rapprochement</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !canModifyBetMatch(
                          user?.role,
                          detailModal.bet.validation_status,
                        ) || busyKey === `unlink-${detailModal.id}`
                      }
                      onClick={() =>
                        unlinkBet({
                          id: detailModal.id,
                          tx: detailModal.tx,
                          bet: detailModal.bet,
                          score: detailModal.score,
                          reasons: detailModal.reasons,
                        })
                      }
                      className="min-h-11 border-[#D8E6DB] text-[#C43636] hover:bg-red-50 gap-1.5"
                    >
                      <Link2Off className="h-4 w-4" />
                      <span>Dissocier</span>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
