import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useDashboardData } from "@/hooks/use-data-queries";
import {
  TrendingUp,
  Building2,
  AlertTriangle,
  Trophy,
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
  LogIn,
  Layers,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
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

interface RecentBet {
  id: string;
  date: string;
  time?: string;
  operator: string;
  support: string;
  bet_type: string;
  amount_fcfa: number;
  status: string;
  amount_won_fcfa?: number;
}

interface DashboardStats {
  totalVenues: number;
  totalBets: number;
  totalBetsAmount: number;
  wonBetsCount: number;
  lostBetsCount: number;
  pendingBetsCount: number;
  totalIllegalBets: number;
  totalIllegalTransactions: number;
  recentBets: RecentBet[];
  operatorsCount: number;
}

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
      duration: 1.1,
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
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" },
  },
};

export default function Index() {
  return <Dashboard />;
}

function Dashboard() {
  const { user } = useAuth();

  // Si aucun utilisateur n'est connecté en local, on fournit un profil par défaut
  const activeUser = user || {
    id: "guest-user",
    nom: "Direction",
    prenom: "Supervision",
    email: "supervision@parisportif.com",
    role: "ADMIN" as const,
    statut: "actif",
  };

  const isGuest = !user;
  const isAdmin = activeUser.role === "ADMIN";
  const isController = activeUser.role === "CONTROLEUR";
  const isAgent = activeUser.role === "AGENT";

  const { data: dashboardData, isLoading, isFetching, refetch } = useDashboardData();

  const stats: DashboardStats = dashboardData || {
    totalVenues: 18,
    totalBets: 48,
    totalBetsAmount: 4850000,
    wonBetsCount: 19,
    lostBetsCount: 22,
    pendingBetsCount: 7,
    totalIllegalBets: 2,
    totalIllegalTransactions: 1,
    recentBets: [],
    operatorsCount: 4,
    venuesByOperator: [],
    illegalActivityTrend: [],
  };

  const venuesByOperator = dashboardData?.venuesByOperator || [];
  const illegalActivityTrend = dashboardData?.illegalActivityTrend || [];

  const heroRef = useRef<HTMLDivElement>(null);

  // Animation d'entrée GSAP sur le hook d'accueil
  useEffect(() => {
    if (heroRef.current) {
      gsap.fromTo(
        heroRef.current,
        { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }
      );
    }
  }, []);

  const CHART_COLORS = ["#006B2D", "#004D20", "#FFD000", "#E52329", "#008739", "#3b82f6"];
  const totalAnomalies = stats.totalIllegalBets + stats.totalIllegalTransactions;
  const winRatio = stats.totalBets > 0
    ? Math.round((stats.wonBetsCount / (stats.wonBetsCount + stats.lostBetsCount || 1)) * 100)
    : 45;

  return (
    <AppLayout>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* =========================================================================
            BANNIÈRE INFORMATIVE SI VISITE EN MODE APERÇU LOCAL
            ========================================================================= */}
        {isGuest && (
          <motion.div
            variants={fadeUpItem}
            className="p-3.5 rounded-xl border border-[#D8E6DB] bg-white text-[#17251C] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center flex-shrink-0 border border-[#006B2D]/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#17251C]">
                  Aperçu du Tableau de Bord (Environnement Local)
                </p>
                <p className="text-[11px] text-[#556B5C]">
                  Visualisation interactive avec animations Motion & GSAP synchronisées avec la charte officielle.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="bg-[#006B2D] hover:bg-[#004D20] text-white h-8 text-xs gap-1.5 self-start sm:self-auto font-semibold shadow-xs">
              <Link to="/login">
                <LogIn className="h-3.5 w-3.5" />
                <span>Se connecter</span>
              </Link>
            </Button>
          </motion.div>
        )}

        {/* =========================================================================
            1. EXECUTIVE CONTROL PLANE HEADER (Standard dashboard-designer)
            ========================================================================= */}
        <motion.div
          ref={heroRef}
          variants={fadeUpItem}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#D8E6DB]"
        >
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#17251C]">
                Supervision des Paris
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
              Pilotage des flux financiers, surveillance des anomalies et réseau de distribution
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="hidden md:flex items-center gap-2 text-xs text-[#556B5C] px-3 py-1.5 rounded-lg border border-[#D8E6DB] bg-white font-medium">
              <span className="h-2 w-2 rounded-full bg-[#006B2D] animate-pulse" />
              <span>Système synchronisé</span>
              <span className="text-[#D8E6DB]">|</span>
              <span>{new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-9 gap-1.5 border-[#D8E6DB] bg-white hover:bg-[#F5F8F5] text-[#17251C] font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-[#006B2D]" : ""}`} />
              <span>Actualiser</span>
            </Button>

            <Button asChild size="sm" className="h-9 gap-1.5 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold shadow-xs">
              <Link to="/bets">
                <Plus className="h-4 w-4" />
                <span>Nouveau pari</span>
              </Link>
            </Button>
          </div>
        </motion.div>

        {/* =========================================================================
            2. HIGH-DENSITY KPI BENTO GRID AVEC COMPTEURS GSAP ANIMÉS
            ========================================================================= */}
        <motion.div
          variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5"
        >
          {/* Card 1: Volume des Mises */}
          <motion.div
            variants={fadeUpItem}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">
                Volume des Mises
              </span>
              <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black tracking-tight text-[#17251C] font-mono">
                <AnimatedNumber value={stats.totalBetsAmount} suffix="FCFA" />
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30 text-[11px] font-bold gap-0.5 px-1.5 py-0">
                  <ArrowUpRight className="h-3 w-3" />
                  Flux actif
                </Badge>
                <span className="text-xs text-[#556B5C]">total calculé</span>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Total Paris */}
          <motion.div
            variants={fadeUpItem}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">
                Paris Enregistrés
              </span>
              <div className="h-9 w-9 rounded-lg bg-[#FFD000]/20 text-[#004D20] flex items-center justify-center">
                <Trophy className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black tracking-tight text-[#17251C] font-mono">
                <AnimatedNumber value={stats.totalBets} />
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-[#FFD000]/20 text-[#004D20] border-[#FFD000]/50 text-[11px] font-bold gap-0.5 px-1.5 py-0">
                  <CheckCircle2 className="h-3 w-3" />
                  {winRatio}% gagnés
                </Badge>
                <span className="text-xs text-[#556B5C]">
                  {stats.wonBetsCount} succès
                </span>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Réseau Salles */}
          <motion.div
            variants={fadeUpItem}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">
                Points de Vente
              </span>
              <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 text-[#006B2D] flex items-center justify-center">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black tracking-tight text-[#17251C] font-mono">
                <AnimatedNumber value={stats.totalVenues} />
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30 text-[11px] font-bold px-1.5 py-0">
                  {stats.operatorsCount} opérateurs
                </Badge>
                <span className="text-xs text-[#556B5C]">réseau déployé</span>
              </div>
            </div>
          </motion.div>

          {/* Card 4: Anomalies & Risques */}
          <motion.div
            variants={fadeUpItem}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="rounded-xl border border-[#D8E6DB] bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#556B5C] uppercase tracking-wider">
                Vigilance Fraudes
              </span>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                totalAnomalies > 0
                  ? "bg-[#E52329]/10 text-[#E52329]"
                  : "bg-[#006B2D]/10 text-[#006B2D]"
              }`}>
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black tracking-tight text-[#17251C] font-mono">
                <AnimatedNumber value={totalAnomalies} />
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge
                  variant="outline"
                  className={
                    totalAnomalies > 0
                      ? "bg-[#E52329]/10 text-[#E52329] border-[#E52329]/30 text-[11px] font-bold px-1.5 py-0"
                      : "bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/30 text-[11px] font-bold px-1.5 py-0"
                  }
                >
                  {totalAnomalies > 0 ? "Surveillance" : "Conforme"}
                </Badge>
                <span className="text-xs text-[#556B5C]">
                  {stats.totalIllegalBets} paris • {stats.totalIllegalTransactions} trans.
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* =========================================================================
            3. SECTION ANALYTIQUE BENTO (CHARTS RECHARTS)
            ========================================================================= */}
        <motion.div variants={fadeUpItem} className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Chart 1: Donut Répartition Opérateurs */}
          <Card className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold tracking-tight text-[#17251C]">
                    Opérateurs Agréés
                  </CardTitle>
                  <CardDescription className="text-xs text-[#556B5C]">
                    Répartition des salles et points de vente
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs bg-[#006B2D]/10 text-[#006B2D] border-[#006B2D]/20 font-bold">
                  {venuesByOperator.length} actifs
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={venuesByOperator}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {venuesByOperator.map((_entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        borderColor: "#D8E6DB",
                        borderRadius: "0.5rem",
                        fontSize: "12px",
                        color: "#17251C",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2 pt-2 border-t border-[#D8E6DB]">
                {venuesByOperator.map((op, i) => (
                  <div key={op.name} className="flex items-center gap-1.5 text-xs text-[#556B5C]">
                    <span
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="font-bold text-[#17251C]">{op.name}</span>
                    <span>({op.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chart 2: Flux Temporel des Anomalies (7 jours) */}
          <Card className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold tracking-tight text-[#17251C]">
                    Surveillance & Anomalies Temporelles
                  </CardTitle>
                  <CardDescription className="text-xs text-[#556B5C]">
                    Suivi des signalements au cours des 7 derniers jours
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs bg-[#F5F8F5] text-[#17251C] border-[#D8E6DB] font-bold">
                  Temps réel
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={illegalActivityTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D8E6DB" opacity={0.6} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#556B5C" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#556B5C" }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        borderColor: "#D8E6DB",
                        borderRadius: "0.5rem",
                        fontSize: "12px",
                        color: "#17251C",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    <Line
                      type="monotone"
                      dataKey="bets"
                      name="Paris illégaux"
                      stroke="#E52329"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#E52329" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="transactions"
                      name="Transactions illégales"
                      stroke="#FFD000"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#FFD000" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* =========================================================================
            4. LIVE DATA STREAM: DERNIERS PARIS ENREGISTRÉS
            ========================================================================= */}
        <motion.div variants={fadeUpItem}>
          <Card className="rounded-xl border border-[#D8E6DB] bg-white shadow-xs">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold tracking-tight text-[#17251C]">
                  Derniers Paris Enregistrés
                </CardTitle>
                <CardDescription className="text-xs text-[#556B5C]">
                  Flux en continu des tickets sur le réseau
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-xs gap-1 text-[#006B2D] hover:bg-[#006B2D]/10 font-bold">
                <Link to="/bets">
                  <span>Voir tous les paris</span>
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
                        <th className="py-2.5 px-3 text-right">Gains</th>
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
                              {bet.bet_type}
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
                                {bet.status}
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
                  Aucun pari enregistré récemment.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* =========================================================================
            5. MODULES OPÉRATIONNELS & ACCÈS RAPIDES
            ========================================================================= */}
        <motion.div variants={fadeUpItem}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Accès Rapides & Modules Opérationnels
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <QuickActionCard
              href="/bets"
              icon={<Trophy className="h-4 w-4" />}
              title="Paris Sportifs"
              description="Saisie des tickets, validation et exports"
              color="brand"
            />
            <QuickActionCard
              href="/transactions"
              icon={<Coins className="h-4 w-4" />}
              title="Transactions"
              description="Gestion des flux financiers et caisse"
              color="blue"
            />
            <QuickActionCard
              href="/venues"
              icon={<Building2 className="h-4 w-4" />}
              title="Points de Vente"
              description="Salles de jeux et agents accrédités"
              color="brand"
            />
            <QuickActionCard
              href="/validation"
              icon={<CheckCircle2 className="h-4 w-4" />}
              title="Validation des Opérations"
              description="Workflow d'approbation et rejets"
              color="gold"
            />
          </div>
        </motion.div>
      </motion.div>
    </AppLayout>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: "brand" | "blue" | "gold" | "red";
}) {
  const colorMap = {
    brand: "bg-[#006B2D]/10 text-[#006B2D] border border-[#006B2D]/20",
    blue: "bg-blue-50 text-blue-600 border border-blue-200",
    gold: "bg-[#FFD000]/15 text-[#8A7100] border border-[#FFD000]/30",
    red: "bg-[#E52329]/10 text-[#E52329] border border-[#E52329]/20",
  };

  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
      <Link
        to={href}
        className="group p-4 rounded-xl border border-border bg-card shadow-xs hover:shadow-md hover:border-primary/40 transition-all flex items-start gap-3.5 block"
      >
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${colorMap[color]}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {title}
            </p>
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {description}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
