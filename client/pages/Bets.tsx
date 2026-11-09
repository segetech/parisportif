import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Trophy,
  Coins,
  ArrowUpRight,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  LayoutGrid,
  List,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { exportStyledExcel } from "@/lib/excel-export";
import { CreatableSelect } from "@/components/ui/creatable-select";
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
  venue_id?: string;
  notes?: string;
  created_by?: string;
  validation_status?: string;
}

export default function BetsPage() {
  return (
    <RequireAuth>
      <Bets />
    </RequireAuth>
  );
}

function Bets() {
  const { user } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBet, setEditingBet] = useState<Bet | null>(null);
  const [activeOperator, setActiveOperator] = useState<string>("all");
  const [hiddenOperators, setHiddenOperators] = useState<Set<string>>(new Set());
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<string>("all");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  // Listes déroulantes
  const [operators, setOperators] = useState<string[]>([]);
  const [supports, setSupports] = useState<string[]>([]);
  const [betTypes, setBetTypes] = useState<string[]>([]);

  // Formulaire
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    operator: "",
    support: "",
    bet_type: "",
    amount_fcfa: 0,
    status: "en attente",
    amount_won_fcfa: 0,
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    await Promise.all([loadBets(), loadOperators(), loadSupports(), loadBetTypes()]);
  }

  async function loadBets() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bets")
        .select("*")
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(300);

      if (error) throw error;
      if (data) setBets(data);
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement des paris");
    } finally {
      setLoading(false);
    }
  }

  async function loadOperators() {
    const { data, error } = await supabase
      .from("operators")
      .select("name")
      .eq("active", true)
      .order("name");

    if (error) throw error;
    if (data) setOperators(data.map((o) => o.name));
  }

  async function loadSupports() {
    const { data, error } = await supabase
      .from("supports")
      .select("name")
      .eq("active", true)
      .order("name");

    if (error) throw error;
    if (data) setSupports(data.map((s) => s.name));
  }

  async function loadBetTypes() {
    const { data, error } = await supabase
      .from("bet_types")
      .select("name")
      .eq("active", true)
      .order("name");

    if (error) throw error;
    if (data) setBetTypes(data.map((b) => b.name));
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
    await loadOperators();
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
    await loadSupports();
    toast.success(`Support "${name}" créé avec succès`);
  }

  async function createBetType(name: string) {
    const { error } = await supabase.from("bet_types").insert([{ name }]);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce type de pari existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }
    await loadBetTypes();
    toast.success(`Type de pari "${name}" créé avec succès`);
  }

  function openDialog() {
    setEditingBet(null);
    setFormData({
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      operator: operators[0] || "",
      support: supports[0] || "",
      bet_type: betTypes[0] || "",
      amount_fcfa: 0,
      status: "en attente",
      amount_won_fcfa: 0,
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(bet: Bet) {
    setEditingBet(bet);
    setFormData({
      date: bet.date,
      time: bet.time || "",
      operator: bet.operator,
      support: bet.support,
      bet_type: bet.bet_type,
      amount_fcfa: bet.amount_fcfa,
      status: bet.status,
      amount_won_fcfa: bet.amount_won_fcfa || 0,
      notes: bet.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!formData.date || !formData.operator || !formData.bet_type || !formData.amount_fcfa) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      const betData = {
        ...formData,
        amount_won_fcfa: formData.amount_won_fcfa || null,
        notes: formData.notes || null,
      };

      if (editingBet) {
        const { error } = await supabase
          .from("bets")
          .update(betData)
          .eq("id", editingBet.id);

        if (error) throw error;
        toast.success("Pari modifié avec succès");
      } else {
        const isAgent = user?.role === "AGENT";
        const newBetData = {
          ...betData,
          created_by: user?.id,
          validation_status: isAgent ? "en_attente" : "valide",
        };

        const { error } = await supabase.from("bets").insert([newBetData]);
        if (error) throw error;

        toast.success(
          isAgent
            ? "Pari créé avec succès. En attente de validation."
            : "Pari créé avec succès"
        );
      }

      setDialogOpen(false);
      setEditingBet(null);
      await loadBets();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  // Filtered bets with multi-faceted criteria
  const filteredBets = useMemo(() => {
    return bets.filter((bet) => {
      // 1. Text search
      if (search) {
        const s = search.toLowerCase();
        const matches =
          bet.operator.toLowerCase().includes(s) ||
          bet.bet_type.toLowerCase().includes(s) ||
          bet.support?.toLowerCase().includes(s) ||
          bet.status.toLowerCase().includes(s) ||
          bet.id.toLowerCase().includes(s) ||
          bet.notes?.toLowerCase().includes(s);
        if (!matches) return false;
      }

      // 2. Status facet
      if (statusFilter !== "all") {
        const st = bet.status.toLowerCase();
        if (statusFilter === "won" && !(st.includes("gagn") || st === "won")) return false;
        if (statusFilter === "lost" && st !== "perdu" && st !== "lost") return false;
        if (statusFilter === "pending" && !st.includes("attente") && st !== "pending") return false;
      }

      return true;
    });
  }, [bets, search, statusFilter]);

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
    const winRate = filteredBets.length > 0 ? Math.round((wonCount / filteredBets.length) * 100) : 0;
    const avgBet = filteredBets.length > 0 ? Math.round(totalMise / filteredBets.length) : 0;

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
        const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
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

  const filterBetsByPeriod = (betsToFilter: Bet[]) => {
    if (exportPeriod === "all") return betsToFilter;

    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (exportPeriod) {
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "custom":
        if (!exportStartDate || !exportEndDate) return betsToFilter;
        startDate = new Date(exportStartDate);
        endDate = new Date(exportEndDate);
        break;
      default:
        return betsToFilter;
    }

    return betsToFilter.filter((bet) => {
      const betDate = new Date(bet.date);
      return betDate >= startDate && betDate <= endDate;
    });
  };

  const exportToExcel = async (betsToExport: Bet[] = filteredBets, operatorName: string = "tous") => {
    const filteredByPeriod = filterBetsByPeriod(betsToExport);

    if (filteredByPeriod.length === 0) {
      toast.error("Aucun pari à exporter pour cette période");
      return;
    }

    const periodText =
      exportPeriod === "week"
        ? "Dernière semaine (7 jours)"
        : exportPeriod === "month"
        ? "Dernier mois (30 jours)"
        : exportPeriod === "custom"
        ? `Du ${new Date(exportStartDate).toLocaleDateString("fr-FR")} au ${new Date(
            exportEndDate
          ).toLocaleDateString("fr-FR")}`
        : "Toutes les dates";

    const columns = [
      { header: "N°", key: "index", width: 7, align: "center" as const },
      { header: "DATE", key: "date", width: 13, align: "center" as const },
      { header: "HEURE", key: "time", width: 10, align: "center" as const },
      { header: "OPÉRATEUR DE JEUX", key: "operator", width: 22, align: "left" as const },
      { header: "SUPPORT", key: "support", width: 14, align: "center" as const },
      { header: "TYPE DE PARI", key: "bet_type", width: 18, align: "left" as const },
      { header: "MONTANT MISÉ", key: "amount_fcfa", width: 20, align: "right" as const, isCurrency: true },
      { header: "GAINS REMPORTÉS", key: "amount_won_fcfa", width: 20, align: "right" as const, isCurrency: true },
      { header: "STATUT DU PARI", key: "status", width: 16, align: "center" as const, isStatus: true },
      { header: "VALIDATION", key: "validation_status", width: 16, align: "center" as const },
      { header: "RÉFÉRENCE TICKET", key: "reference", width: 18, align: "center" as const },
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
      status: bet.status,
      validation_status:
        bet.validation_status === "valide"
          ? "Validé"
          : bet.validation_status === "refuse"
          ? "Refusé"
          : "En attente",
      reference: bet.id.substring(0, 12).toUpperCase(),
    }));

    const fileName =
      operatorName === "tous"
        ? `rapport_paris_tous_${new Date().toISOString().split("T")[0]}.xlsx`
        : `rapport_paris_${operatorName}_${new Date().toISOString().split("T")[0]}.xlsx`;

    try {
      toast.loading("Génération du rapport Excel stylisé en cours...", { id: "excel-export" });
      await exportStyledExcel({
        sheetName: "Paris Sportifs",
        title: "Rapport Officiel des Paris sur les Plateformes",
        subtitle: "État certifié des mises, gains et statuts d'arbitrage",
        operator: operatorName,
        periodText,
        columns,
        data,
        filename: fileName,
        showTotals: true,
      });
      toast.success(`Export réussi: ${filteredByPeriod.length} pari(s) exporté(s)`, { id: "excel-export" });
      setExportDialogOpen(false);
    } catch (err: any) {
      console.error("Erreur export:", err);
      toast.error("Erreur lors de la génération du fichier Excel", { id: "excel-export" });
    }
  };

  const formatFCFA = (val: number) => {
    return new Intl.NumberFormat("fr-FR").format(Math.round(val)) + " FCFA";
  };

  // Pagination helper for the current active tab
  const currentTabBets = activeOperator === "all" ? filteredBets : groupedBets[activeOperator] || [];
  const totalPages = Math.max(1, Math.ceil(currentTabBets.length / pageSize));
  const paginatedBets = currentTabBets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("gagn") || s === "won") {
      return (
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/60 font-semibold text-[11px] px-2 py-0.5 gap-1"
        >
          <CheckCircle2 className="h-3 w-3" />
          Gagné
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
          Perdu
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

  if (loading) {
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Gestion des Paris
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Journal des enjeux, suivi des cotes et résultats par opérateur
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={loadBets}
              className="h-9 gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Actualiser</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDialogOpen(true)}
              className="h-9 gap-1.5"
            >
              <Download className="h-4 w-4" />
              <span>Exporter</span>
            </Button>

            <Button onClick={openDialog} size="sm" className="h-9 gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Nouveau pari</span>
            </Button>
          </div>
        </div>

        {/* =========================================================================
            2. HIGH-DENSITY KPI BENTO GRID (Standard dashboard-designer)
            ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {/* KPI 1: Volume des Mises */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Volume Misé
              </span>
              <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatFCFA(statsSummary.totalMise)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/60 text-[11px] font-semibold px-1.5 py-0">
                  {filteredBets.length} tickets
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Panier moy. {formatFCFA(statsSummary.avgBet)}
                </span>
              </div>
            </div>
          </div>

          {/* KPI 2: Gains Distribués */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Gains Distribués
              </span>
              <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Trophy className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatFCFA(statsSummary.totalGains)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200/60 text-[11px] font-semibold px-1.5 py-0">
                  {statsSummary.wonCount} gagnés
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Taux joueur: {statsSummary.winRate}%
                </span>
              </div>
            </div>
          </div>

          {/* KPI 3: Marge Nette Plateforme */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Marge / Rétention
              </span>
              <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatFCFA(statsSummary.netPlatformMargin)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 border-indigo-200/60 text-[11px] font-semibold px-1.5 py-0">
                  {statsSummary.lostCount} perdus
                </Badge>
                <span className="text-xs text-muted-foreground">marge conservée</span>
              </div>
            </div>
          </div>

          {/* KPI 4: Tickets en Attente */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Paris en Cours
              </span>
              <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {statsSummary.pendingCount}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200/60 text-[11px] font-semibold px-1.5 py-0">
                  En attente
                </Badge>
                <span className="text-xs text-muted-foreground">non dénoués</span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. FACETED FILTER TOOLBAR & VIEW CONTROLS
            ========================================================================= */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Global Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par opérateur, ticket, type, statut..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 h-9 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Faceted Status Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <span className="text-xs text-muted-foreground mr-1 hidden lg:inline">Statut:</span>
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
                className="h-8 text-xs px-2.5"
              >
                Tous ({bets.length})
              </Button>
              <Button
                variant={statusFilter === "won" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter("won");
                  setCurrentPage(1);
                }}
                className="h-8 text-xs px-2.5"
              >
                Gagnés
              </Button>
              <Button
                variant={statusFilter === "lost" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter("lost");
                  setCurrentPage(1);
                }}
                className="h-8 text-xs px-2.5"
              >
                Perdus
              </Button>
              <Button
                variant={statusFilter === "pending" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter("pending");
                  setCurrentPage(1);
                }}
                className="h-8 text-xs px-2.5"
              >
                En attente
              </Button>
            </div>

            {/* View Switcher & Operators Settings */}
            <div className="flex items-center gap-2">
              <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted/40">
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </Button>
                <Button
                  variant={viewMode === "cards" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("cards")}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cartes</span>
                </Button>
              </div>

              {/* Operator visibility selector */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <Settings className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Opérateurs</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                      Opérateurs visibles
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {Object.keys(groupedBets)
                        .sort()
                        .map((operator) => (
                          <div key={operator} className="flex items-center gap-2">
                            <Checkbox
                              id={`op-${operator}`}
                              checked={!hiddenOperators.has(operator)}
                              onCheckedChange={() => toggleOperatorVisibility(operator)}
                            />
                            <label
                              htmlFor={`op-${operator}`}
                              className="text-xs cursor-pointer flex-1 text-foreground"
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
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 bg-muted/50 border border-border rounded-xl">
            <TabsTrigger value="all" className="text-xs px-3 py-1.5 gap-1.5">
              <span>Tous</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
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
                  className="text-xs px-3 py-1.5 gap-1.5 whitespace-nowrap"
                >
                  <span>{operator}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    {groupedBets[operator].length}
                  </Badge>
                </TabsTrigger>
              ))}
          </TabsList>

          {/* Table Container */}
          <div className="mt-4 rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            {currentTabBets.length > 0 ? (
              viewMode === "table" ? (
                /* === HIGH DENSITY TANSTACK STYLE TABLE === */
                <div className="relative w-full overflow-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="border-b border-border">
                        <TableHead className="w-14 text-center font-semibold text-xs">N°</TableHead>
                        <TableHead className="font-semibold text-xs">Date & Heure</TableHead>
                        <TableHead className="font-semibold text-xs">Opérateur</TableHead>
                        <TableHead className="font-semibold text-xs">Support</TableHead>
                        <TableHead className="font-semibold text-xs">Type de Pari</TableHead>
                        <TableHead className="text-right font-semibold text-xs">Montant Misé</TableHead>
                        <TableHead className="text-right font-semibold text-xs">Gains</TableHead>
                        <TableHead className="text-center font-semibold text-xs">Statut</TableHead>
                        <TableHead className="text-center font-semibold text-xs">Validation</TableHead>
                        <TableHead className="text-right font-semibold text-xs">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border">
                      {paginatedBets.map((bet, index) => {
                        const globalIndex = (currentPage - 1) * pageSize + index + 1;
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
                              {bet.bet_type}
                            </TableCell>

                            <TableCell className="text-right font-mono font-semibold text-xs text-foreground">
                              {formatFCFA(bet.amount_fcfa)}
                            </TableCell>

                            <TableCell className="text-right font-mono text-xs">
                              {bet.amount_won_fcfa && bet.amount_won_fcfa > 0 ? (
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
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/50 text-[10px]">
                                  Validé
                                </Badge>
                              ) : bet.validation_status === "refuse" ? (
                                <Badge variant="outline" className="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200/50 text-[10px]">
                                  Refusé
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-border text-[10px]">
                                  {bet.validation_status || "Standard"}
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(bet)}
                                className="h-8 px-2 text-xs gap-1"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Détails</span>
                              </Button>
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
                    const globalIndex = (currentPage - 1) * pageSize + index + 1;
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
                                {new Date(bet.date).toLocaleDateString("fr-FR")} {bet.time ? `• ${bet.time}` : ""}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(bet.status)}
                        </div>

                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[11px]">
                            {bet.support}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[11px]">
                            {bet.bet_type}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                          <div>
                            <span className="text-muted-foreground">Misé: </span>
                            <span className="font-mono font-semibold text-foreground">
                              {formatFCFA(bet.amount_fcfa)}
                            </span>
                          </div>
                          {bet.amount_won_fcfa && bet.amount_won_fcfa > 0 ? (
                            <div>
                              <span className="text-muted-foreground">Gains: </span>
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
                <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-semibold text-sm text-foreground">Aucun pari trouvé</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Aucun résultat ne correspond à vos critères de recherche ou à cet opérateur.
                </p>
                <Button onClick={openDialog} size="sm" variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nouveau pari
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
                    paris
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
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
              {editingBet ? "Modifier le pari" : "Nouveau pari"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Date *
                </label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Heure
                </label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                />
              </div>
            </div>

            <CreatableSelect
              label="Opérateur"
              required
              value={formData.operator}
              onChange={(value) => setFormData({ ...formData, operator: value })}
              options={operators}
              placeholder="Sélectionner ou saisir un nouvel opérateur..."
              onCreateNew={createOperator}
            />

            <CreatableSelect
              label="Support"
              required
              value={formData.support}
              onChange={(value) => setFormData({ ...formData, support: value })}
              options={supports}
              placeholder="Sélectionner ou saisir un support..."
              onCreateNew={createSupport}
            />

            <CreatableSelect
              label="Type de pari"
              required
              value={formData.bet_type}
              onChange={(value) => setFormData({ ...formData, bet_type: value })}
              options={betTypes}
              placeholder="Sélectionner ou saisir un type..."
              onCreateNew={createBetType}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Montant misé (FCFA) *
                </label>
                <Input
                  type="number"
                  value={formData.amount_fcfa || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, amount_fcfa: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Statut du pari
                </label>
                <select
                  className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="en attente">En attente</option>
                  <option value="gagné">Gagné</option>
                  <option value="perdu">Perdu</option>
                  <option value="annulé">Annulé</option>
                </select>
              </div>
            </div>

            {formData.status === "gagné" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Montant gagné (FCFA)
                </label>
                <Input
                  type="number"
                  value={formData.amount_won_fcfa || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, amount_won_fcfa: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Notes & Références
              </label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Détails du ticket, identifiant externe, match..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSubmit}>
                {editingBet ? "Mettre à jour" : "Créer le pari"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DIALOG D'EXPORT EXCEL AVANCÉ
          ========================================================================= */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              📥 Exporter le Rapport des Paris
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Période d'export
              </label>
              <select
                className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={exportPeriod}
                onChange={(e) => setExportPeriod(e.target.value)}
              >
                <option value="all">Tous les paris enregistrés</option>
                <option value="week">Dernière semaine (7 jours)</option>
                <option value="month">Dernier mois (30 jours)</option>
                <option value="custom">Période personnalisée</option>
              </select>
            </div>

            {exportPeriod === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1">Date début</label>
                  <Input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Date fin</label>
                  <Input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="bg-muted/40 p-3.5 rounded-xl border border-border text-xs space-y-1">
              <p className="font-semibold text-foreground">Aperçu du jeu de données :</p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">
                  {filterBetsByPeriod(activeOperator === "all" ? filteredBets : groupedBets[activeOperator] || []).length}
                </span>{" "}
                pari(s) seront inclus dans le tableur.
              </p>
              <p className="text-muted-foreground">
                Filtre opérateur actif:{" "}
                <span className="font-medium text-foreground">
                  {activeOperator === "all" ? "Tous les opérateurs" : activeOperator}
                </span>
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => {
                  const betsToExport =
                    activeOperator === "all"
                      ? filteredBets
                      : groupedBets[activeOperator] || [];
                  exportToExcel(betsToExport, activeOperator);
                }}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                Générer Excel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
