import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, RequireAuth } from "@/context/AuthContext";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  AlertTriangle,
  DollarSign,
  Trophy,
  Activity,
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

interface DashboardStats {
  totalVenues: number;
  totalBets: number;
  totalIllegalBets: number;
  totalIllegalTransactions: number;
  recentActivity: any[];
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
    totalIllegalBets: 0,
    totalIllegalTransactions: 0,
    recentActivity: [],
  });
  const [loading, setLoading] = useState(true);
  const [venuesByOperator, setVenuesByOperator] = useState<any[]>([]);
  const [illegalActivityTrend, setIllegalActivityTrend] = useState<any[]>([]);

  const isAdmin = user?.role === "ADMIN";
  const isController = user?.role === "CONTROLEUR";
  const isAgent = user?.role === "AGENT";

  useEffect(() => {
    loadDashboardData();
  }, [user?.id]);

  async function loadDashboardData() {
    try {
      setLoading(true);

      // Charger les statistiques selon le rôle
      const [venuesData, betsData, illegalBetsData, illegalTransactionsData] =
        await Promise.all([
          supabase.from("venues").select("*", { count: "exact" }),
          supabase.from("bets").select("*", { count: "exact" }),
          supabase.from("illegal_bets").select("*", { count: "exact" }),
          supabase
            .from("illegal_transactions")
            .select("*", { count: "exact" }),
        ]);

      setStats({
        totalVenues: venuesData.count || 0,
        totalBets: betsData.count || 0,
        totalIllegalBets: illegalBetsData.count || 0,
        totalIllegalTransactions: illegalTransactionsData.count || 0,
        recentActivity: [],
      });

      // Charger les salles par opérateur
      if (venuesData.data) {
        const operatorCounts: Record<string, number> = {};
        venuesData.data.forEach((venue: any) => {
          operatorCounts[venue.operator] =
            (operatorCounts[venue.operator] || 0) + 1;
        });
        const operatorData = Object.entries(operatorCounts).map(
          ([name, value]) => ({
            name,
            value,
          })
        );
        setVenuesByOperator(operatorData);
      }

      // Charger la tendance des activités illégales (derniers 7 jours)
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

      // Grouper par date
      const trendMap: Record<string, { bets: number; transactions: number }> =
        {};
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

      setIllegalActivityTrend(trendData);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
    } finally {
      setLoading(false);
    }
  }

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
            <p className="text-sm text-muted-foreground">
              Chargement des données...
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* En-tête avec message de bienvenue */}
        <div>
          <h1 className="text-3xl font-bold">
            Bienvenue, {user?.prenom || user?.nom} !
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin && "Tableau de bord administrateur"}
            {isController && "Tableau de bord contrôleur"}
            {isAgent && "Tableau de bord agent"}
          </p>
        </div>

        {/* KPIs principaux */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Salles de jeux"
            value={formatNumber(stats.totalVenues)}
            icon={<Building2 className="h-4 w-4" />}
            trend={null}
            color="blue"
          />
          <StatCard
            title="Paris enregistrés"
            value={formatNumber(stats.totalBets)}
            icon={<Trophy className="h-4 w-4" />}
            trend={null}
            color="green"
          />
          <StatCard
            title="Paris illégaux"
            value={formatNumber(stats.totalIllegalBets)}
            icon={<AlertTriangle className="h-4 w-4" />}
            trend={null}
            color="red"
          />
          <StatCard
            title="Transactions illégales"
            value={formatNumber(stats.totalIllegalTransactions)}
            icon={<Activity className="h-4 w-4" />}
            trend={null}
            color="orange"
          />
        </div>

        {/* Graphiques */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Répartition des salles par opérateur */}
          {venuesByOperator.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Salles par opérateur</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={venuesByOperator}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name} (${(percent * 100).toFixed(0)}%)`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {venuesByOperator.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tendance des activités illégales */}
          {(isAdmin || isController) && illegalActivityTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Activités illégales (7 derniers jours)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={illegalActivityTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="bets"
                        stroke="#ef4444"
                        name="Paris illégaux"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="transactions"
                        stroke="#f59e0b"
                        name="Transactions illégales"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Accès rapides selon le rôle */}
        <Card>
          <CardHeader>
            <CardTitle>Accès rapides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              <QuickAccessButton
                href="/venues"
                icon={<Building2 className="h-5 w-5" />}
                label="Salles de jeux"
              />
              <QuickAccessButton
                href="/bets"
                icon={<Trophy className="h-5 w-5" />}
                label="Paris"
              />
              {(isAdmin || isController) && (
                <QuickAccessButton
                  href="/illegal"
                  icon={<AlertTriangle className="h-5 w-5" />}
                  label="Activités illégales"
                />
              )}
              {isAdmin && (
                <QuickAccessButton
                  href="/users-management"
                  icon={<Users className="h-5 w-5" />}
                  label="Utilisateurs"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Statistiques détaillées pour ADMIN et CONTROLEUR */}
        {(isAdmin || isController) && (
          <Card>
            <CardHeader>
              <CardTitle>Résumé des activités illégales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="font-medium">Paris illégaux détectés</p>
                      <p className="text-sm text-muted-foreground">
                        Total enregistré dans le système
                      </p>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-red-600">
                    {formatNumber(stats.totalIllegalBets)}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="font-medium">Transactions illégales</p>
                      <p className="text-sm text-muted-foreground">
                        Dépôts et retraits suspects
                      </p>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatNumber(stats.totalIllegalTransactions)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend: { value: number; isPositive: boolean } | null;
  color: "blue" | "green" | "red" | "orange";
}

function StatCard({ title, value, icon, trend, color }: StatCardProps) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-2">{value}</p>
            {trend && (
              <div
                className={`flex items-center gap-1 mt-2 text-sm ${
                  trend.isPositive ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {trend.isPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{Math.abs(trend.value)}%</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-full ${colorClasses[color]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAccessButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 p-4 border rounded-lg hover:bg-slate-50 transition-colors"
    >
      <div className="p-2 bg-primary/10 text-primary rounded-lg">{icon}</div>
      <span className="font-medium">{label}</span>
    </a>
  );
}
