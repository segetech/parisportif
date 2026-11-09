import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth, RequireAuth } from "@/context/AuthContext";
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

function formatFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

export default function Index() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalVenues: 0,
    totalBets: 0,
    totalBetsAmount: 0,
    wonBetsCount: 0,
    lostBetsCount: 0,
    pendingBetsCount: 0,
    totalIllegalBets: 0,
    totalIllegalTransactions: 0,
    recentBets: [],
    operatorsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [venuesByOperator, setVenuesByOperator] = useState<any[]>([]);
  const [illegalActivityTrend, setIllegalActivityTrend] = useState<any[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const isAdmin = user?.role === "ADMIN";
  const isController = user?.role === "CONTROLEUR";
  const isAgent = user?.role === "AGENT";

  useEffect(() => {
    loadDashboardData();
  }, [user?.id]);

  async function loadDashboardData() {
    try {
      setLoading(true);

      const [
        venuesRes,
        betsCountRes,
        recentBetsRes,
        illegalBetsRes,
        illegalTransactionsRes,
      ] = await Promise.all([
        supabase.from("venues").select("*"),
        supabase.from("bets").select("*", { count: "exact" }),
        supabase
          .from("bets")
          .select("id, date, time, operator, support, bet_type, amount_fcfa, status, amount_won_fcfa")
          .order("date", { ascending: false })
          .order("time", { ascending: false })
          .limit(30),
        supabase.from("illegal_bets").select("*", { count: "exact" }),
        supabase.from("illegal_transactions").select("*", { count: "exact" }),
      ]);

      const venues = venuesRes.data || [];
      const recentBets: RecentBet[] = (recentBetsRes.data as RecentBet[]) || [];

      // Calculate bet amounts and status distributions from sample/recent
      let totalAmount = 0;
      let wonCount = 0;
      let lostCount = 0;
      let pendingCount = 0;

      recentBets.forEach((b) => {
        totalAmount += Number(b.amount_fcfa) || 0;
        const st = (b.status || "").toLowerCase();
        if (st === "gagné" || st === "gagne") wonCount++;
        else if (st === "perdu") lostCount++;
        else pendingCount++;
      });

      // Venues by operator
      const operatorCounts: Record<string, number> = {};
      venues.forEach((venue: any) => {
        if (venue.operator) {
          operatorCounts[venue.operator] = (operatorCounts[venue.operator] || 0) + 1;
        }
      });

      const operatorData = Object.entries(operatorCounts).map(([name, value]) => ({
        name,
        value,
      }));

      // Trend for last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [illegalBetsTrend, illegalTransactionsTrend] = await Promise.all([
        supabase
          .from("illegal_bets")
          .select("date")
          .gte("date", sevenDaysAgo.toISOString().split("T")[0]),
        supabase
          .from("illegal_transactions")
          .select("date")
          .gte("date", sevenDaysAgo.toISOString().split("T")[0]),
      ]);

      const trendMap: Record<string, { bets: number; transactions: number }> = {};
      illegalBetsTrend.data?.forEach((item: any) => {
        trendMap[item.date] = trendMap[item.date] || { bets: 0, transactions: 0 };
        trendMap[item.date].bets++;
      });
      illegalTransactionsTrend.data?.forEach((item: any) => {
        trendMap[item.date] = trendMap[item.date] || { bets: 0, transactions: 0 };
        trendMap[item.date].transactions++;
      });

      const trendData = Object.entries(trendMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, data]) => ({
          date: new Date(date).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
          }),
          ...data,
        }));

      setStats({
        totalVenues: venuesRes.count || venues.length || 0,
        totalBets: betsCountRes.count || recentBets.length || 0,
        totalBetsAmount: totalAmount,
        wonBetsCount: wonCount,
        lostBetsCount: lostCount,
        pendingBetsCount: pendingCount,
        totalIllegalBets: illegalBetsRes.count || 0,
        totalIllegalTransactions: illegalTransactionsRes.count || 0,
        recentBets: recentBets.slice(0, 6),
        operatorsCount: Object.keys(operatorCounts).length,
      });

      setVenuesByOperator(operatorData);
      setIllegalActivityTrend(trendData);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
    } finally {
      setLoading(false);
    }
  }

  const CHART_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

  const resolvedRate = stats.totalBets > 0
    ? Math.round(((stats.wonBetsCount + stats.lostBetsCount) / Math.max(stats.recentBets.length, 1)) * 100)
    : 100;

  const totalAnomalies = stats.totalIllegalBets + stats.totalIllegalTransactions;

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="h-14 w-1/3 bg-muted animate-pulse rounded-lg" />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
            <div className="h-80 bg-muted animate-pulse rounded-xl lg:col-span-2" />
            <div className="h-80 bg-muted animate-pulse rounded-xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* =========================================================================
            1. EXECUTIVE CONTROL PLANE HEADER (Standard dashboard-designer)
            ========================================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                Tableau de bord de contrôle
              </h1>
              <Badge
                variant="outline"
                className="bg-card text-foreground font-semibold px-2.5 py-0.5 text-xs rounded-full border-border shadow-xs"
              >
                {isAdmin && "ADMINISTRATEUR"}
                {isController && "CONTRÔLEUR"}
                {isAgent && "AGENT DE SAISIE"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Supervision des flux de paris sportifs, conformité et réseau de distribution
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 rounded-lg border border-border bg-card">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Système synchronisé</span>
              <span className="text-border">|</span>
              <span>{lastRefreshed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadDashboardData}
              className="h-9 gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Actualiser</span>
            </Button>

            <Button asChild size="sm" className="h-9 gap-1.5">
              <Link to="/bets">
                <Plus className="h-4 w-4" />
                <span>Nouveau pari</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* =========================================================================
            2. HIGH-DENSITY KPI STAT CARDS (Metric Stat Card Standard)
            ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {/* Card 1: Volume Mises */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Volume des Mises
              </span>
              <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatFCFA(stats.totalBetsAmount)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/60 text-[11px] font-semibold gap-0.5 px-1.5 py-0">
                  <ArrowUpRight className="h-3 w-3" />
                  Actif
                </Badge>
                <span className="text-xs text-muted-foreground">sur paris récents</span>
              </div>
            </div>
          </div>

          {/* Card 2: Total Paris */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Paris Enregistrés
              </span>
              <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Trophy className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatNumber(stats.totalBets)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200/60 text-[11px] font-semibold gap-0.5 px-1.5 py-0">
                  <CheckCircle2 className="h-3 w-3" />
                  {resolvedRate}% traités
                </Badge>
                <span className="text-xs text-muted-foreground">{stats.wonBetsCount} gagnés</span>
              </div>
            </div>
          </div>

          {/* Card 3: Salles de Jeux */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Réseau & Salles
              </span>
              <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatNumber(stats.totalVenues)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 border-indigo-200/60 text-[11px] font-semibold px-1.5 py-0">
                  {stats.operatorsCount} opérateurs
                </Badge>
                <span className="text-xs text-muted-foreground">points de vente</span>
              </div>
            </div>
          </div>

          {/* Card 4: Anomalies & Fraudes */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Activités Suspectes
              </span>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                totalAnomalies > 0
                  ? "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}>
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatNumber(totalAnomalies)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge
                  variant="outline"
                  className={
                    totalAnomalies > 0
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200/60 text-[11px] font-semibold px-1.5 py-0"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/60 text-[11px] font-semibold px-1.5 py-0"
                  }
                >
                  {totalAnomalies > 0 ? "Vigilance requise" : "Conforme"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {stats.totalIllegalBets} paris • {stats.totalIllegalTransactions} trans.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. ANALYTICAL BENTO SECTION (Recharts Charts)
            ========================================================================= */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Chart 1: Répartition par Opérateur */}
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Opérateurs de Jeux
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Répartition des salles par opérateur
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {venuesByOperator.length} actifs
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {venuesByOperator.length > 0 ? (
                <div>
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
                          {venuesByOperator.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend pills */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2 pt-2 border-t border-border">
                    {venuesByOperator.map((op, i) => (
                      <div key={op.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="font-medium text-foreground">{op.name}</span>
                        <span>({op.value})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-56 flex flex-col items-center justify-center text-center text-muted-foreground">
                  <Building2 className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs">Aucune salle enregistrée</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 2: Tendance des Activités (7 derniers jours) */}
          <Card className="rounded-xl border border-border bg-card shadow-xs lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Surveillance & Flux de Risques
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Évolution des signalements d'activités illégales (7 derniers jours)
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  Temps réel
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {illegalActivityTrend.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={illegalActivityTrend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: "12px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="bets"
                        name="Paris illégaux"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="transactions"
                        name="Transactions illégales"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500/70 mb-2" />
                  <p className="text-sm font-medium text-foreground">
                    Aucune anomalie signalée sur les 7 derniers jours
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Toutes les opérations récentes respectent les seuils réglementaires.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* =========================================================================
            4. OPERATIONAL DATA STREAM: RECENT BETS TABLE
            ========================================================================= */}
        <Card className="rounded-xl border border-border bg-card shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight">
                Derniers Paris Enregistrés
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Flux en direct des transactions de paris sur le réseau
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
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
                    <tr className="border-b border-border text-muted-foreground font-medium">
                      <th className="py-2.5 px-3">Date & Heure</th>
                      <th className="py-2.5 px-3">Opérateur</th>
                      <th className="py-2.5 px-3">Support</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Montant</th>
                      <th className="py-2.5 px-3 text-right">Gains</th>
                      <th className="py-2.5 px-3 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {stats.recentBets.map((bet) => {
                      const isWon = bet.status?.toLowerCase().includes("gagn");
                      const isLost = bet.status?.toLowerCase() === "perdu";
                      return (
                        <tr
                          key={bet.id}
                          className="hover:bg-muted/40 transition-colors"
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                            {new Date(bet.date).toLocaleDateString("fr-FR")}{" "}
                            {bet.time ? `• ${bet.time}` : ""}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-foreground">
                            {bet.operator}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[11px]">
                              {bet.support || "—"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {bet.bet_type}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground">
                            {formatNumber(bet.amount_fcfa)} FCFA
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {bet.amount_won_fcfa && bet.amount_won_fcfa > 0 ? (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatNumber(bet.amount_won_fcfa)} FCFA
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant="outline"
                              className={
                                isWon
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/60 text-[10px] font-semibold"
                                  : isLost
                                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200/60 text-[10px] font-semibold"
                                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200/60 text-[10px] font-semibold"
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

        {/* =========================================================================
            5. CONTROL PLANE QUICK ACTIONS HUB
            ========================================================================= */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Accès Rapides & Modules Opérationnels
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <QuickActionCard
              href="/bets"
              icon={<Trophy className="h-4 w-4" />}
              title="Paris Sportifs"
              description="Saisie des tickets, validation et exports"
              color="emerald"
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
              color="indigo"
            />
            {(isAdmin || isController) && (
              <QuickActionCard
                href="/validation"
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Validation des Opérations"
                description="Workflow d'approbation et rejets"
                color="purple"
              />
            )}
            {(isAdmin || isController) && (
              <QuickActionCard
                href="/illegal"
                icon={<AlertTriangle className="h-4 w-4" />}
                title="Activités Suspectes"
                description="Signalements de fraudes et anomalies"
                color="amber"
              />
            )}
            {isAdmin && (
              <QuickActionCard
                href="/users-management"
                icon={<Activity className="h-4 w-4" />}
                title="Gestion des Comptes"
                description="Rôles, habilitations et sécurité"
                color="slate"
              />
            )}
          </div>
        </div>
      </div>
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
  color: "emerald" | "blue" | "indigo" | "purple" | "amber" | "slate";
}) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <Link
      to={href}
      className="group p-4 rounded-xl border border-border bg-card shadow-xs hover:shadow-md hover:border-primary/40 transition-all flex items-start gap-3.5"
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
  );
}
