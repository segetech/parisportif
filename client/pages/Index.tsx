import { testStatusLabel, testCatalogLabel } from "@/lib/test-vocabulary";
import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequireAuth, useAuth } from "@/context/AuthContext";
import { useDashboardData, DashboardStats } from "@/hooks/use-data-queries";
import {
  TrendingUp,
  Building2,
  AlertTriangle,
  ClipboardCheck,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Coins,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowRight,
  FileCheck,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  Legend,
} from "recharts";
import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import gsap from "gsap";

// Composant de compteur animé avec GSAP
function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const nodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!nodeRef.current) return;
    const targets = { val: 0 };
    const tween = gsap.to(targets, {
      val: value,
      duration: 0.9,
      ease: "power2.out",
      onUpdate: () => {
        if (nodeRef.current) {
          nodeRef.current.textContent =
            new Intl.NumberFormat("fr-FR").format(Math.round(targets.val)) +
            (suffix ? ` ${suffix}` : "");
        }
      },
    });

    return () => {
      tween.kill();
    };
  }, [value, suffix]);

  return (
    <span ref={nodeRef}>
      {new Intl.NumberFormat("fr-FR").format(value)}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

// Variantes d'animation Framer Motion
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.03,
    },
  },
};

const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

export default function IndexPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <Dashboard />
      </AppLayout>
    </RequireAuth>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const heroRef = useRef<HTMLDivElement>(null);

  const role = user?.role || "AGENT";
  const isAdmin = role === "ADMIN";
  const isController = role === "CONTROLEUR";
  const isAgent = role === "AGENT";

  const { data: dashboardData, isLoading, isError, error, isFetching, refetch } = useDashboardData();

  // Animation d'entrée GSAP
  useEffect(() => {
    if (heroRef.current) {
      gsap.fromTo(
        heroRef.current,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
      );
    }
  }, []);

  if (isError && !dashboardData) {
    return (
      <div className="p-8 rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 text-center space-y-4 max-w-xl mx-auto my-12 shadow-xs">
        <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#17251C]">Échec de synchronisation des indicateurs</h2>
          <p className="text-xs text-rose-800 mt-1">
            {(error as any)?.message || "Impossible de récupérer les statistiques du tableau de bord. Vérifiez vos autorisations."}
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          className="min-h-[44px] bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs px-5 shadow-xs"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Réessayer la synchronisation
        </Button>
      </div>
    );
  }

  const stats: DashboardStats = dashboardData || {
    totalVenues: 0,
    totalBets: 0,
    totalBetsAmount: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalKnownWinnings: 0,
    pendingValidationsCount: 0,
    wonBetsCount: 0,
    lostBetsCount: 0,
    pendingBetsCount: 0,
    totalIllegalBets: 0,
    totalIllegalTransactions: 0,
    recentBets: [],
    operatorsCount: 0,
    venuesByOperator: [],
    illegalActivityTrend: [],
  };

  const venuesByOperator = stats.venuesByOperator || [];
  const illegalActivityTrend = stats.illegalActivityTrend || [];
  const totalAnomalies = stats.totalIllegalBets + stats.totalIllegalTransactions;
  const CHART_COLORS = ["#006B2D", "#004D20", "#FFD000", "#E52329", "#008739", "#3b82f6"];

  if (isLoading && !dashboardData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-[#006B2D]" />
        <p className="text-xs font-semibold text-[#556B5C]">
          Chargement des indicateurs en temps réel...
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* =========================================================================
          1. HEADER DU TABLEAU DE BORD ADAPTÉ AU RÔLE
          ========================================================================= */}
      <motion.div
        ref={heroRef}
        variants={fadeUpItem}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#D8E6DB]"
      >
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#17251C]">
              {isAdmin && "Supervision Générale & Gouvernance"}
              {isController && "Espace Contrôle & Conformité"}
              {isAgent && "Espace Agent de Saisie"}
            </h1>
            <Badge
              variant="outline"
              className="bg-white text-[#004D20] font-bold px-2.5 py-0.5 text-xs rounded-full border-[#D8E6DB] shadow-xs"
            >
              {isAdmin && "ADMINISTRATEUR"}
              {isController && "CONTRÔLEUR"}
              {isAgent && "AGENT DE SAISIE"}
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-[#556B5C] mt-1 font-medium">
            {isAdmin && "Pilotage exécutif des flux financiers, réseau de distribution et conformité"}
            {isController && "Supervision des flux saisis par les agents, file d'approbation et détection des fraudes"}
            {isAgent && "Enregistrement de vos opérations de tests, transactions et suivi des validations"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden md:flex items-center gap-2 text-xs text-[#556B5C] px-3 py-1.5 rounded-lg border border-[#D8E6DB] bg-white font-medium">
            <span className="h-2 w-2 rounded-full bg-[#006B2D] animate-pulse" />
            <span>Connecté : {user?.nom} {user?.prenom || ""}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="min-h-[44px] sm:min-h-0 h-9 gap-1.5 border-[#D8E6DB] bg-white hover:bg-[#F5F8F5] text-[#17251C] font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-[#006B2D]" : ""}`} />
            <span>Actualiser</span>
          </Button>

          {isAgent && (
            <Button asChild size="sm" className="min-h-[44px] sm:min-h-0 h-9 gap-1.5 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold shadow-xs">
              <Link to="/tests">
                <Plus className="h-4 w-4" />
                <span>Créer un test</span>
              </Link>
            </Button>
          )}

          {isController && (
            <Button asChild size="sm" className="min-h-[44px] sm:min-h-0 h-9 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs">
              <Link to="/validation">
                <FileCheck className="h-4 w-4" />
                <span>File de validation ({stats.pendingValidationsCount})</span>
              </Link>
            </Button>
          )}

          {isAdmin && (
            <Button asChild size="sm" className="min-h-[44px] sm:min-h-0 h-9 gap-1.5 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold shadow-xs">
              <Link to="/tests">
                <Plus className="h-4 w-4" />
                <span>Créer un test</span>
              </Link>
            </Button>
          )}
        </div>
      </motion.div>

      {/* =========================================================================
          2. BENTO CARDS SPÉCIFIQUES PAR RÔLE
          ========================================================================= */}
      {/* VUE 1 : AGENT DE SAISIE */}
      {isAgent && (
        <div className="space-y-6">
          <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Mes Paris Enregistrés */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Mes Tests Saisis</span>
                <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                  <ClipboardCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.totalBets} />
                </div>
                <p className="text-xs text-[#556B5C] mt-1">tests enregistrés par votre compte</p>
              </div>
            </motion.div>

            {/* Volume Financier Saisi */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Volume Engagé Saisi</span>
                <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                  <Coins className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.totalBetsAmount} suffix="FCFA" />
                </div>
                <p className="text-xs text-[#556B5C] mt-1">valeur cumulée de vos saisies</p>
              </div>
            </motion.div>

            {/* Mes Validations en Attente */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">En Attente de Contrôle</span>
                <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.pendingValidationsCount} />
                </div>
                <p className="text-xs text-amber-700 mt-1 font-medium">dossiers soumis au contrôleur</p>
              </div>
            </motion.div>

            {/* Tickets Gagnants Saisis */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Issues favorables</span>
                <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.wonBetsCount} />
                </div>
                <p className="text-xs text-[#556B5C] mt-1">sur {stats.totalBets}  tests saisis</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Actions Rapides pour l'Agent */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              to="/tests"
              className="p-4 rounded-xl border border-[#D8E6DB] bg-white hover:border-[#006B2D] transition-all flex items-center justify-between group shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#006B2D] text-white flex items-center justify-center shrink-0">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#17251C]">Enregistrer un Test</div>
                  <div className="text-xs text-[#556B5C]">Saisie avec contrôle des justificatifs</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#006B2D] group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              to="/transactions"
              className="p-4 rounded-xl border border-[#D8E6DB] bg-white hover:border-[#006B2D] transition-all flex items-center justify-between group shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#004D20] text-white flex items-center justify-center shrink-0">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#17251C]">Saisir une Transaction</div>
                  <div className="text-xs text-[#556B5C]">Flux de dépôts et retraits caisse</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#006B2D] group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              to="/venues"
              className="p-4 rounded-xl border border-[#D8E6DB] bg-white hover:border-[#006B2D] transition-all flex items-center justify-between group shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#FFD000] text-[#17251C] flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#17251C]">Consulter les Sites</div>
                  <div className="text-xs text-[#556B5C]">Points de vente et opérateurs agréés</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#006B2D] group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      )}

      {/* VUE 2 : CONTRÔLEUR DE CONFORMITÉ */}
      {isController && (
        <div className="space-y-6">
          <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Opérations en Attente de Contrôle */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-amber-300 bg-amber-50/60 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">File de Validation</span>
                <div className="h-9 w-9 rounded-lg bg-amber-600 text-white flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-amber-950 font-mono">
                  <AnimatedNumber value={stats.pendingValidationsCount} />
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[11px] font-bold">
                    Action requise
                  </Badge>
                  <span className="text-xs text-amber-800">dossiers à examiner</span>
                </div>
              </div>
            </motion.div>

            {/* Vigilance Fraudes */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Alertes Fraudes</span>
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                  totalAnomalies > 0 ? "bg-[#E52329]/10 text-[#E52329]" : "bg-[#006B2D]/10 text-[#006B2D]"
                }`}>
                  <ShieldAlert className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={totalAnomalies} />
                </div>
                <p className="text-xs text-[#556B5C] mt-1">
                  {stats.totalIllegalBets}  tests • {stats.totalIllegalTransactions} trans.
                </p>
              </div>
            </motion.div>

            {/* Volume Contrôlé */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Volume Engagé Global</span>
                <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                  <Coins className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.totalBetsAmount} suffix="FCFA" />
                </div>
                <p className="text-xs text-[#556B5C] mt-1">{stats.totalBets}  tests sur le réseau</p>
              </div>
            </motion.div>

            {/* Établissements Supervisés */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Sites Physiques</span>
                <div className="h-9 w-9 rounded-lg bg-[#004D20]/10 text-[#004D20] flex items-center justify-center">
                  <Building2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.totalVenues} />
                </div>
                <p className="text-xs text-[#556B5C] mt-1">points de vente répertoriés</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Raccourcis de Contrôle */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-amber-950">
                  File d'attente prioritaire de validation
                </p>
                <p className="text-xs text-amber-800">
                  {stats.pendingValidationsCount} dossier(s) en attente d'approbation ou de rejet motivé
                </p>
              </div>
            </div>
            <Button asChild className="min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs">
              <Link to="/validation">
                Accéder à la validation
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* VUE 3 : ADMINISTRATEUR SYSTÈME */}
      {isAdmin && (
        <div className="space-y-6">
          {/* Bento Grid Financier Exécutif */}
          <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Volume des Mises */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Volume des Montants engagés</span>
                <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                  <Coins className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.totalBetsAmount} suffix="FCFA" />
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant="outline" className="bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30 text-[11px] font-bold px-1.5 py-0">
                    <ArrowUpRight className="h-3 w-3" />

                    Montants engagés engagées
                  </Badge>
                  <span className="text-xs text-[#556B5C]">{stats.totalBets}  tests</span>
                </div>
              </div>
            </motion.div>

            {/* Total Dépôts */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Total Dépôts</span>
                <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                  <ArrowDownRight className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.totalDeposits} suffix="FCFA" />
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[11px] font-bold px-1.5 py-0">
                    Entrées Mobile Money
                  </Badge>
                  <span className="text-xs text-[#556B5C]">recharges</span>
                </div>
              </div>
            </motion.div>

            {/* Total Retraits */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Total Retraits</span>
                <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.totalWithdrawals} suffix="FCFA" />
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[11px] font-bold px-1.5 py-0">
                    Sorties Mobile Money
                  </Badge>
                  <span className="text-xs text-[#556B5C]">retraits</span>
                </div>
              </div>
            </motion.div>

            {/* Gains Connus Distribués */}
            <motion.div variants={fadeUpItem} className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">Montants retournés renseignés</span>
                <div className="h-9 w-9 rounded-lg bg-[#FFD000]/20 text-[#004D20] flex items-center justify-center">
                  <ClipboardCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-[#17251C] font-mono">
                  <AnimatedNumber value={stats.totalKnownWinnings} suffix="FCFA" />
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant="outline" className="bg-[#FFD000]/20 text-[#004D20] border-[#FFD000]/50 text-[11px] font-bold px-1.5 py-0">
                    {stats.wonBetsCount}  issues favorables
                  </Badge>
                  <span className="text-xs text-[#556B5C]">retour brut</span>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Ligne Gouvernance et Réseau */}
          <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-[#D8E6DB] bg-white flex items-center justify-between shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">Sites Répertoriées</span>
                <div className="text-xl font-black text-[#17251C]">
                  <AnimatedNumber value={stats.totalVenues} />
                  <span className="text-xs font-normal text-[#556B5C] ml-2">points de vente</span>
                </div>
              </div>
              <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                <Building2 className="h-4 w-4" />
              </div>
            </div>

            <div className="p-4 rounded-xl border border-[#D8E6DB] bg-white flex items-center justify-between shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">Opérations à Valider</span>
                <div className="text-xl font-black text-[#17251C]">
                  <AnimatedNumber value={stats.pendingValidationsCount} />
                  <span className="text-xs font-normal text-[#556B5C] ml-2">en attente</span>
                </div>
              </div>
              <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
            </div>

            <div className="p-4 rounded-xl border border-[#D8E6DB] bg-white flex items-center justify-between shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">Vigilance Fraudes</span>
                <div className="text-xl font-black text-[#17251C]">
                  <AnimatedNumber value={totalAnomalies} />
                  <span className="text-xs font-normal text-[#556B5C] ml-2">signalements</span>
                </div>
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                totalAnomalies > 0 ? "bg-[#E52329]/10 text-[#E52329]" : "bg-[#006B2D]/10 text-[#006B2D]"
              }`}>
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* =========================================================================
          3. SECTION ANALYTIQUE (GRAPHES RECHARTS AVEC VRAIES VALEURS)
          ========================================================================= */}
      {(isAdmin || isController) && (
        <motion.div variants={fadeUpItem} className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Donut Opérateurs */}
          <Card className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold tracking-tight text-[#17251C]">
                    Opérateurs Agréés
                  </CardTitle>
                  <CardDescription className="text-xs text-[#556B5C]">

                    Répartition des sites et points de vente
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/20 font-bold">
                  {venuesByOperator.length} actifs
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                {venuesByOperator.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={venuesByOperator}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="count"
                        nameKey="name"
                      >
                        {venuesByOperator.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          border: "1px solid #D8E6DB",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(val) => (
                          <span className="text-xs font-semibold text-[#17251C]">
                            {val}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-[#556B5C]">

                    Aucun site de test enregistrée.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Activités Suspectes (Tendance hebdomadaire réelle sans chiffre fictif) */}
          <Card className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold tracking-tight text-[#17251C]">
                    Évolution des Activités Suspectes
                  </CardTitle>
                  <CardDescription className="text-xs text-[#556B5C]">
                    Période des 7 derniers jours (Fuseau Africa/Bamako) • 0 = aucune anomalie
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={
                    totalAnomalies > 0
                      ? "bg-[#E52329]/10 text-[#E52329] border-[#E52329]/30 text-xs font-bold"
                      : "bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30 text-xs font-bold"
                  }
                >
                  {totalAnomalies > 0 ? `${totalAnomalies} signalements` : "Aucune anomalie"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={illegalActivityTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="day"
                      stroke="#64748B"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#64748B"
                      fontSize={11}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #D8E6DB",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                    <Line
                      type="monotone"
                      dataKey="paris"
                      name="Tests non conformes"
                      stroke="#E52329"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#E52329" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="transactions"
                      name="Transactions suspectes"
                      stroke="#FFD000"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#FFD000" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* =========================================================================
          4. LIVE DATA STREAM: DERNIERS PARIS ENREGISTRÉS
          ========================================================================= */}
      <motion.div variants={fadeUpItem}>
        <Card className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold tracking-tight text-[#17251C]">
                {isAgent ? "Mes Derniers Tests Enregistrés" : "Derniers Tests Enregistrés sur le Réseau"}
              </CardTitle>
              <CardDescription className="text-xs text-[#556B5C]">
                {isAgent
                  ? "Suivi direct de vos 30 derniers tests saisis"
                  : "Flux en direct des 30 derniers tests sur les plateformes"}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs gap-1 text-[#006B2D] hover:bg-[#006B2D]/10 font-bold">
              <Link to="/tests">
                <span>Voir tous les tests</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.recentBets.length > 0 ? (
              <div className="relative w-full overflow-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#D8E6DB] bg-[#F5F8F5] text-[#556B5C] font-bold">
                      <th className="py-2.5 px-3">Date & Heure</th>
                      <th className="py-2.5 px-3">Opérateur</th>
                      <th className="py-2.5 px-3">Support</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Montant</th>
                      <th className="py-2.5 px-3 text-right">Montants retournés</th>
                      <th className="py-2.5 px-3 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8E6DB]">
                    {stats.recentBets.map((bet) => {
                      const isWon = bet.status?.toLowerCase().includes("gagn");
                      const isLost = bet.status?.toLowerCase() === "perdu";
                      return (
                        <tr
                          key={bet.id}
                          className="hover:bg-[#F5F8F5] transition-colors"
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#556B5C]">
                            {new Date(bet.date).toLocaleDateString("fr-FR")}{" "}
                            {bet.time ? `• ${bet.time}` : ""}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#17251C]">
                            {bet.operator}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-[#F5F8F5] text-[#556B5C] border border-[#D8E6DB] text-[11px] font-semibold">
                              {bet.support || "—"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#556B5C]">
                            {testCatalogLabel(bet.bet_type)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#17251C]">
                            {new Intl.NumberFormat("fr-FR").format(bet.amount_fcfa)} FCFA
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {bet.amount_won_fcfa && bet.amount_won_fcfa > 0 ? (
                              <span className="font-bold text-[#006B2D]">
                                {new Intl.NumberFormat("fr-FR").format(bet.amount_won_fcfa)} FCFA
                              </span>
                            ) : (
                              <span className="text-[#556B5C]">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant="outline"
                              className={
                                isWon
                                  ? "bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30 text-[10px] font-bold"
                                  : isLost
                                  ? "bg-[#E52329]/10 text-[#E52329] border-[#E52329]/30 text-[10px] font-bold"
                                  : "bg-[#FFD000]/20 text-[#004D20] border-[#FFD000]/50 text-[10px] font-bold"
                              }
                            >
                              {testStatusLabel(bet.status)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">

                Aucun test enregistré.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
