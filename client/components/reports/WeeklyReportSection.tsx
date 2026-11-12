import React, { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Calendar,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePickerCustom } from "@/components/ui/date-picker-custom";
import {
  useBets,
  useTransactions,
  useIllegalActivities,
} from "@/hooks/use-data-queries";
import {
  OFFICIAL_OPERATORS,
  buildDailyBetMatrix,
  buildDailyTxMatrix,
  exportWeeklyOfficialReport,
  type OfficialOperatorKey,
} from "@/lib/weekly-report-export";

function getDefaultWeekRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export function WeeklyReportSection() {
  const defaultRange = useMemo(() => getDefaultWeekRange(), []);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [isExporting, setIsExporting] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);

  const { data: bets = [] } = useBets();
  const { data: transactions = [] } = useTransactions();
  const { illegalBets = [], illegalTransactions = [] } = useIllegalActivities();

  const illegals = useMemo(
    () => [
      ...illegalBets.map((b: any) => ({ ...b, category: "Pari illégal" })),
      ...illegalTransactions.map((t: any) => ({
        ...t,
        category: "Dépôt/Retrait illégal",
      })),
    ],
    [illegalBets, illegalTransactions],
  );

  const filteredBets = useMemo(
    () =>
      bets.filter(
        (b: any) =>
          (!startDate || b.date >= startDate) && (!endDate || b.date <= endDate),
      ),
    [bets, startDate, endDate],
  );

  const filteredTx = useMemo(
    () =>
      transactions.filter(
        (t: any) =>
          (!startDate || t.date >= startDate) && (!endDate || t.date <= endDate),
      ),
    [transactions, startDate, endDate],
  );

  const betMatrix = useMemo(
    () => buildDailyBetMatrix(filteredBets, startDate, endDate),
    [filteredBets, startDate, endDate],
  );

  const txMatrix = useMemo(
    () => buildDailyTxMatrix(filteredTx, startDate, endDate),
    [filteredTx, startDate, endDate],
  );

  const betTotals = useMemo(() => {
    const totals: Record<OfficialOperatorKey, number> = {
      "1XBET": 0,
      BET223: 0,
      PREMIERBET: 0,
      MALIBET: 0,
      MEGAPARI: 0,
      "888STARZ": 0,
    };
    for (const row of betMatrix) {
      for (const op of OFFICIAL_OPERATORS) {
        totals[op.key] += row.counts[op.key];
      }
    }
    return totals;
  }, [betMatrix]);

  const txTotals = useMemo(() => {
    const depots: Record<OfficialOperatorKey, number> = {
      "1XBET": 0,
      BET223: 0,
      PREMIERBET: 0,
      MALIBET: 0,
      MEGAPARI: 0,
      "888STARZ": 0,
    };
    const retraits: Record<OfficialOperatorKey, number> = {
      "1XBET": 0,
      BET223: 0,
      PREMIERBET: 0,
      MALIBET: 0,
      MEGAPARI: 0,
      "888STARZ": 0,
    };
    for (const row of txMatrix) {
      for (const op of OFFICIAL_OPERATORS) {
        depots[op.key] += row.depots[op.key];
        retraits[op.key] += row.retraits[op.key];
      }
    }
    return { depots, retraits };
  }, [txMatrix]);

  const chartData = useMemo(
    () =>
      betMatrix.map((row) => ({
        date: row.label,
        "1XBET": row.counts["1XBET"],
        BET223: row.counts.BET223,
        PREMIERBET: row.counts.PREMIERBET,
        MALIBET: row.counts.MALIBET,
        MEGAPARI: row.counts.MEGAPARI,
        "888STARZ": row.counts["888STARZ"],
      })),
    [betMatrix],
  );

  async function captureChartBase64(): Promise<string | null> {
    if (!chartRef.current) return null;
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#FFFFFF",
        scale: 2,
      });
      return canvas.toDataURL("image/png");
    } catch (err) {
      console.warn("Capture graphe impossible:", err);
      return null;
    }
  }

  async function handleDownloadChartPng() {
    const dataUrl = await captureChartBase64();
    if (!dataUrl) {
      toast.error("Impossible de capturer le graphe");
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `GRAPHE_TESTS_${startDate}_AU_${endDate}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Image PNG du graphe téléchargée");
  }

  async function handleExportExcel() {
    if (!startDate || !endDate || startDate > endDate) {
      toast.error("Veuillez sélectionner une période valide");
      return;
    }
    setIsExporting(true);
    toast.loading("Génération du rapport officiel Excel...", {
      id: "weekly-report",
    });
    try {
      const chartImg = await captureChartBase64();
      await exportWeeklyOfficialReport({
        startDate,
        endDate,
        bets,
        transactions,
        illegals,
        chartImageBase64: chartImg,
      });
      toast.success("Rapport hebdomadaire officiel (.xlsx) généré avec succès", {
        id: "weekly-report",
      });
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la génération du rapport Excel", {
        id: "weekly-report",
      });
    } finally {
      setIsExporting(false);
    }
  }

  const formatMoney = (n: number) =>
    n > 0 ? new Intl.NumberFormat("fr-FR").format(n) : "—";

  return (
    <div className="space-y-6">
      {/* En-tête & Sélection de période */}
      <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#EBF7EE] text-[#006B2D] flex items-center justify-center shrink-0 border border-[#D8E6DB]">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[#17251C]">
                Rapport Hebdomadaire Officiel (Format Excel)
              </h2>
              <p className="text-xs text-[#556B5C]">
                Génération automatisée des feuilles PARI, DEPOT-RETRAIT et ILLEGAL avec matrices journalières et graphe intégré.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadChartPng}
              className="h-10 text-xs font-bold text-[#17251C] border-[#D8E6DB] hover:bg-[#F5F8F5] rounded-xl gap-1.5"
            >
              <ImageIcon className="h-4 w-4 text-[#006B2D]" />
              <span>Télécharger le graphe (PNG)</span>
            </Button>
            <Button
              onClick={handleExportExcel}
              disabled={isExporting}
              className="h-10 text-xs font-bold bg-[#006B2D] hover:bg-[#004D20] text-white rounded-xl gap-2 shadow-xs"
            >
              <Download className="h-4 w-4 text-[#FFD000]" />
              <span>
                {isExporting
                  ? "Génération..."
                  : "Télécharger le Rapport Excel Officiel (.xlsx)"}
              </span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[#E2ECE4]">
          <DatePickerCustom
            label="Date de début"
            value={startDate}
            onChange={setStartDate}
          />
          <DatePickerCustom
            label="Date de fin"
            value={endDate}
            onChange={setEndDate}
          />
          <div className="p-3 rounded-xl bg-[#F5F8F5] border border-[#D8E6DB] flex flex-col justify-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#556B5C]">
              Tests de jeux (Période)
            </span>
            <span className="text-lg font-extrabold text-[#17251C]">
              {filteredBets.length}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F8F5] border border-[#D8E6DB] flex flex-col justify-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#556B5C]">
              Dépôts &amp; Retraits (Période)
            </span>
            <span className="text-lg font-extrabold text-[#006B2D]">
              {filteredTx.length}
            </span>
          </div>
        </div>
      </div>

      {/* Matrice 1 : Nombre de tests par jour & par opérateur + Graphe */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#006B2D]" />
              <h3 className="text-sm font-extrabold text-[#17251C]">
                Matrice Journalière des Tests par Opérateur
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-[#556B5C]">
              Feuille PARI
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#D8E6DB]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="p-2.5 text-center font-extrabold border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C]">
                    DATE
                  </th>
                  {OFFICIAL_OPERATORS.map((op) => (
                    <th
                      key={op.key}
                      className="p-2.5 text-center font-extrabold border border-[#17251C]/20 text-[#17251C]"
                      style={{ backgroundColor: `#${op.fill.slice(2)}` }}
                    >
                      {op.label}
                    </th>
                  ))}
                  <th className="p-2.5 text-center font-extrabold border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C]">
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {betMatrix.length > 0 ? (
                  betMatrix.map((row) => (
                    <tr key={row.isoDate} className="hover:bg-[#F5F8F5]">
                      <td className="p-2 text-center font-semibold border border-[#D8E6DB] text-[#17251C] whitespace-nowrap">
                        {row.label}
                      </td>
                      {OFFICIAL_OPERATORS.map((op) => (
                        <td
                          key={op.key}
                          className="p-2 text-center font-mono border border-[#D8E6DB] text-[#17251C]"
                        >
                          {row.counts[op.key] > 0 ? row.counts[op.key] : ""}
                        </td>
                      ))}
                      <td className="p-2 text-center font-mono font-bold border border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C]">
                        {row.total}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-6 text-center text-[#556B5C]"
                    >
                      Sélectionnez une période valide
                    </td>
                  </tr>
                )}
                {betMatrix.length > 0 && (
                  <tr className="font-extrabold bg-[#F5F8F5]">
                    <td className="p-2.5 text-center border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C]">
                      TOTAL
                    </td>
                    {OFFICIAL_OPERATORS.map((op) => (
                      <td
                        key={op.key}
                        className="p-2.5 text-center font-mono border border-[#17251C]/20 text-[#17251C]"
                      >
                        {betTotals[op.key]}
                      </td>
                    ))}
                    <td className="p-2.5 text-center font-mono border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C]">
                      {Object.values(betTotals).reduce((a, b) => a + b, 0)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Graphe visuel exportable en image PNG */}
        <div
          ref={chartRef}
          className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#006B2D]" />
              <h3 className="text-sm font-extrabold text-[#17251C]">
                Évolution Journalière des Tests par Opérateur
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-[#556B5C]">
              {startDate} → {endDate}
            </span>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 12, left: -12, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2ECE4" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#17251C", fontSize: 11, fontWeight: 600 }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#556B5C", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#D8E6DB",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", fontWeight: 700 }} />
                {OFFICIAL_OPERATORS.map((op) => (
                  <Bar
                    key={op.key}
                    dataKey={op.key}
                    name={op.label}
                    fill={op.chartColor}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Matrice 2 : Dépôts & Retraits par jour et par opérateur */}
      <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-[#17251C]">
            Matrice Récapitulative Dépôts &amp; Retraits par Opérateur (F CFA)
          </h3>
          <span className="text-[11px] font-semibold text-[#556B5C]">
            Feuille DEPOT-RETRAIT
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#D8E6DB]">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="p-2 text-center font-extrabold border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C]"
                >
                  DATE
                </th>
                {OFFICIAL_OPERATORS.map((op) => (
                  <th
                    key={op.key}
                    colSpan={2}
                    className="p-2 text-center font-extrabold border border-[#17251C]/20 text-[#17251C]"
                    style={{ backgroundColor: `#${op.fill.slice(2)}` }}
                  >
                    {op.label}
                  </th>
                ))}
              </tr>
              <tr>
                {OFFICIAL_OPERATORS.map((op) => (
                  <React.Fragment key={op.key}>
                    <th className="p-1.5 text-center font-bold border border-[#17251C]/20 bg-[#F5F8F5] text-[#006B2D]">
                      DEPOTS
                    </th>
                    <th className="p-1.5 text-center font-bold border border-[#17251C]/20 bg-[#F5F8F5] text-[#E52329]">
                      RETRAITS
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {txMatrix.map((row) => (
                <tr key={row.isoDate} className="hover:bg-[#F5F8F5]">
                  <td className="p-2 text-center font-semibold border border-[#D8E6DB] text-[#17251C] whitespace-nowrap">
                    {row.label}
                  </td>
                  {OFFICIAL_OPERATORS.map((op) => (
                    <React.Fragment key={op.key}>
                      <td className="p-2 text-right font-mono border border-[#D8E6DB] text-[#17251C] whitespace-nowrap">
                        {formatMoney(row.depots[op.key])}
                      </td>
                      <td className="p-2 text-right font-mono border border-[#D8E6DB] text-[#17251C] whitespace-nowrap">
                        {formatMoney(row.retraits[op.key])}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
              {txMatrix.length > 0 && (
                <tr className="font-extrabold bg-[#F5F8F5]">
                  <td className="p-2 text-center border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C]">
                    TOTAL
                  </td>
                  {OFFICIAL_OPERATORS.map((op) => (
                    <React.Fragment key={op.key}>
                      <td className="p-2 text-right font-mono border border-[#17251C]/20 text-[#006B2D] whitespace-nowrap">
                        {new Intl.NumberFormat("fr-FR").format(
                          txTotals.depots[op.key],
                        )}
                      </td>
                      <td className="p-2 text-right font-mono border border-[#17251C]/20 text-[#E52329] whitespace-nowrap">
                        {new Intl.NumberFormat("fr-FR").format(
                          txTotals.retraits[op.key],
                        )}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
