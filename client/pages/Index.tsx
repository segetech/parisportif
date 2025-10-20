import AppLayout from "@/components/layout/AppLayout";
import api from "@/data/api";
import dayjs, { DATE_FORMAT } from "@/lib/dayjs";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth, RequireAuth } from "@/context/AuthContext";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatFcfa(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " F CFA";
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
  const [rows, setRows] = useState({ tx: [], bets: [] } as {
    tx: Awaited<ReturnType<typeof api.transactions.list>>;
    bets: Awaited<ReturnType<typeof api.bets.list>>;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [user?.id]);

  async function load() {
    try {
      setLoading(true);
      const params = new URLSearchParams(window.location.search);
      const start = params.get("start") ?? dayjs().format(DATE_FORMAT);
      const end = params.get("end") ?? dayjs().format(DATE_FORMAT);

      // Use backend endpoint for faster loading
      const queryParams = new URLSearchParams({
        start,
        end,
        role: user?.role ?? "AGENT",
        userId: user?.id ?? "",
      });

      const response = await fetch(`/api/dashboard/data?${queryParams}`);
      if (!response.ok) throw new Error("Failed to load dashboard data");

      const data = await response.json();
      setRows({ tx: data.transactions, bets: data.bets });
    } finally {
      setLoading(false);
    }
  }

  const kpis = useMemo(() => {
    const depots = rows.tx
      .filter((t) => t.type === "Dépôt")
      .reduce((s, t) => s + t.amount_fcfa, 0);
    const retraits = rows.tx
      .filter((t) => t.type === "Retrait")
      .reduce((s, t) => s + t.amount_fcfa, 0);
    const mises = rows.bets.reduce((s, b) => s + b.amount_fcfa, 0);
    const gains = rows.bets
      .filter((b) => b.status === "gagné" && b.amount_won_fcfa)
      .reduce((s, b) => s + (b.amount_won_fcfa || 0), 0);
    const roi = mises > 0 ? Math.round((gains / mises) * 100) : 0;
    return { depots, retraits, mises, gains, roi };
  }, [rows]);

  const perDay = useMemo(() => {
    const map: Record<string, { mises: number; gains: number }> = {};
    for (const b of rows.bets) {
      map[b.date] ??= { mises: 0, gains: 0 };
      map[b.date].mises += b.amount_fcfa;
      if (b.status === "gagné" && b.amount_won_fcfa)
        map[b.date].gains += b.amount_won_fcfa;
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }));
  }, [rows]);

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
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Dépôts" value={formatFcfa(kpis.depots)} />
        <Kpi title="Retraits" value={formatFcfa(kpis.retraits)} />
        <Kpi title="Mises" value={formatFcfa(kpis.mises)} />
        <Kpi title="Gains" value={formatFcfa(kpis.gains)} />
      </div>
      <div className="mt-6 rounded-xl border p-4">
        <div className="font-semibold mb-2">ROI: {kpis.roi}%</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="mises" fill="#60a5fa" name="Mises" />
              <Bar dataKey="gains" fill="#34d399" name="Gains" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppLayout>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
