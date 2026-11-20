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
  Eye,
  FileSpreadsheet,
  Image as ImageIcon,
  Calendar,
  BarChart3,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodSelector, type PeriodMode } from "@/components/reports/PeriodSelector";
import {
  currentReportPeriod,
  customReportPeriod,
  reportPeriod,
  buildReportFilename,
} from "@/lib/report-periods";
import { fetchOpenReport } from "@/lib/open-report-data";
import { supabase } from "@/lib/supabase";
import {
  useBets,
  useTransactions,
  useIllegalActivities,
  useLookups,
} from "@/hooks/use-data-queries";
import {
  resolveReportOperators,
  buildDailyBetMatrix,
  buildDailyTxMatrix,
  groupOperationsByOperator,
  buildWeeklyOfficialWorkbook,
  exportWeeklyOfficialReport,
} from "@/lib/weekly-report-export";

interface PreviewSheetCell {
  text: string;
  bgHex?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  colSpan?: number;
  rowSpan?: number;
}

function colLettersToNumber(letters: string): number {
  let num = 0;
  for (let i = 0; i < letters.length; i++) {
    num = num * 26 + (letters.charCodeAt(i) - 64);
  }
  return num;
}

function parseMergeBounds(range: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(range.trim());
  if (!m) return null;
  return {
    c1: colLettersToNumber(m[1].toUpperCase()),
    r1: Number(m[2]),
    c2: colLettersToNumber(m[3].toUpperCase()),
    r2: Number(m[4]),
  };
}

interface PreviewSheetData {
  name: string;
  colCount: number;
  colWidthsPx: number[];
  rows: Array<{ rowNum: number; cells: PreviewSheetCell[] }>;
}

function argbToHex(argb?: string): string | undefined {
  if (!argb || argb.length < 6) return undefined;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  return `#${hex}`;
}

function formatPreviewCellText(val: any): string {
  if (val === null || val === undefined || val === "") return "";
  if (typeof val === "object") {
    if ("result" in val) {
      const r = val.result;
      if (typeof r === "number") return r.toLocaleString("fr-FR");
      return r !== null && r !== undefined ? String(r) : "";
    }
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText.map((t: any) => t.text).join("");
    }
  }
  if (typeof val === "number") return val.toLocaleString("fr-FR");
  return String(val);
}

export interface WeeklyReportSectionProps {
  externalStartDate?: string;
  externalEndDate?: string;
  externalOperators?: string[];
  hidePeriodControls?: boolean;
}

export function WeeklyReportSection({
  externalStartDate,
  externalEndDate,
  externalOperators,
  hidePeriodControls = false,
}: WeeklyReportSectionProps = {}) {
  const initialPeriod = useMemo(() => currentReportPeriod(), []);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("fixed");
  const [year, setYear] = useState(initialPeriod.year);
  const [month, setMonth] = useState(initialPeriod.month);
  const [tranche, setTranche] = useState<number>(initialPeriod.tranche);
  const [customStart, setCustomStart] = useState(initialPeriod.start);
  const [customEnd, setCustomEnd] = useState(initialPeriod.end);
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSheets, setPreviewSheets] = useState<PreviewSheetData[]>([]);
  const [previewActiveTab, setPreviewActiveTab] = useState<string>("TEST");

  const selectedPeriod = useMemo(() => {
    try {
      return reportPeriod(year, month, tranche);
    } catch {
      return null;
    }
  }, [year, month, tranche]);

  const startDate =
    externalStartDate !== undefined
      ? externalStartDate
      : periodMode === "fixed"
        ? selectedPeriod?.start || ""
        : customStart;
  const endDate =
    externalEndDate !== undefined
      ? externalEndDate
      : periodMode === "fixed"
        ? selectedPeriod?.end || ""
        : customEnd;

  const chartRef = useRef<HTMLDivElement>(null);

  const dateFilters = useMemo(
    () =>
      startDate && endDate
        ? { start: startDate, end: endDate }
        : startDate
          ? { start: startDate }
          : endDate
            ? { end: endDate }
            : undefined,
    [startDate, endDate],
  );

  const { data: lookupsData } = useLookups();
  const { data: bets = [] } = useBets(dateFilters);
  const { data: transactions = [] } = useTransactions(dateFilters);
  const { illegalBets = [], illegalTransactions = [] } = useIllegalActivities();

  const operatorFilterSet = useMemo(() => {
    if (!externalOperators || externalOperators.length === 0) return null;
    return new Set(externalOperators.map((op) => op.trim().toLowerCase()).filter(Boolean));
  }, [externalOperators]);

  const activeOperatorNames = useMemo(() => {
    const base = lookupsData?.activeOperatorNames || [];
    if (!operatorFilterSet) return base;
    const filtered = base.filter((name) => operatorFilterSet.has(name.trim().toLowerCase()));
    return filtered.length > 0 ? filtered : externalOperators || [];
  }, [lookupsData?.activeOperatorNames, operatorFilterSet, externalOperators]);

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
          (!startDate || b.date >= startDate) &&
          (!endDate || b.date <= endDate) &&
          (!operatorFilterSet ||
            operatorFilterSet.has(String(b.operator || "").trim().toLowerCase())),
      ),
    [bets, startDate, endDate, operatorFilterSet],
  );

  const filteredTx = useMemo(
    () =>
      transactions.filter(
        (t: any) =>
          (!startDate || t.date >= startDate) &&
          (!endDate || t.date <= endDate) &&
          (!operatorFilterSet ||
            operatorFilterSet.has(String(t.operator || "").trim().toLowerCase())),
      ),
    [transactions, startDate, endDate, operatorFilterSet],
  );

  const reportOperators = useMemo(
    () => resolveReportOperators(activeOperatorNames, filteredBets, filteredTx),
    [activeOperatorNames, filteredBets, filteredTx],
  );

  const betMatrix = useMemo(
    () => buildDailyBetMatrix(filteredBets, startDate, endDate, reportOperators),
    [filteredBets, startDate, endDate, reportOperators],
  );

  const txMatrix = useMemo(
    () => buildDailyTxMatrix(filteredTx, startDate, endDate, reportOperators),
    [filteredTx, startDate, endDate, reportOperators],
  );

  const betGroups = useMemo(
    () => groupOperationsByOperator(filteredBets, reportOperators),
    [filteredBets, reportOperators],
  );

  const txGroups = useMemo(
    () => groupOperationsByOperator(filteredTx, reportOperators),
    [filteredTx, reportOperators],
  );

  const operatorBlockSummaries = useMemo(() => {
    const betMap = new Map(betGroups.map((g) => [g.meta.key, g]));
    const txMap = new Map(txGroups.map((g) => [g.meta.key, g]));
    return reportOperators.map((op) => {
      const bItems = betMap.get(op.key)?.items ?? [];
      const tItems = txMap.get(op.key)?.items ?? [];
      const betTotalFcfa = bItems.reduce(
        (sum, b: any) => sum + (Number(b.amount_fcfa) || 0),
        0,
      );
      let depotTotalFcfa = 0;
      let retraitTotalFcfa = 0;
      for (const tx of tItems) {
        const amt = Number((tx as any).amount_fcfa) || 0;
        const typeStr = String((tx as any).type || "").toLowerCase();
        if (typeStr.includes("retrait")) {
          retraitTotalFcfa += amt;
        } else {
          depotTotalFcfa += amt;
        }
      }
      return {
        meta: op,
        betCount: bItems.length,
        betTotalFcfa,
        txCount: tItems.length,
        depotTotalFcfa,
        retraitTotalFcfa,
      };
    });
  }, [betGroups, txGroups, reportOperators]);

  const betTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const op of reportOperators) totals[op.key] = 0;
    for (const row of betMatrix) {
      for (const op of reportOperators) {
        totals[op.key] += row.counts[op.key] || 0;
      }
    }
    return totals;
  }, [betMatrix, reportOperators]);

  const txTotals = useMemo(() => {
    const depots: Record<string, number> = {};
    const retraits: Record<string, number> = {};
    for (const op of reportOperators) {
      depots[op.key] = 0;
      retraits[op.key] = 0;
    }
    for (const row of txMatrix) {
      for (const op of reportOperators) {
        depots[op.key] += row.depots[op.key] || 0;
        retraits[op.key] += row.retraits[op.key] || 0;
      }
    }
    return { depots, retraits };
  }, [txMatrix, reportOperators]);

  const chartData = useMemo(
    () =>
      betMatrix.map((row) => {
        const entry: Record<string, string | number> = { date: row.label };
        for (const op of reportOperators) {
          entry[op.key] = row.counts[op.key] || 0;
        }
        return entry;
      }),
    [betMatrix, reportOperators],
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
    a.download = buildReportFilename("graphe", startDate, endDate, "xlsx").replace(/\.xlsx$/, ".png");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Image PNG du graphe téléchargée");
  }

  async function fetchReportPayload() {
    const frozenStart = startDate;
    const frozenEnd = endDate;
    const frozenPeriod =
      externalStartDate !== undefined || periodMode === "custom"
        ? customReportPeriod(frozenStart, frozenEnd)
        : selectedPeriod;
    const chartImg = await captureChartBase64();
    let exportBets = bets;
    let exportTx = transactions;
    let exportIllegals = illegals;

    if (frozenPeriod) {
      const snapshot = await fetchOpenReport(supabase, {
        period: frozenPeriod,
        scope: "all",
        operators:
          externalOperators && externalOperators.length > 0
            ? externalOperators
            : undefined,
      });
      exportBets = snapshot.tests as any;
      exportTx = snapshot.transactions as any;
      exportIllegals = snapshot.anomalies.map((r: any) => ({
        ...r,
        category:
          r.report_entity === "Transaction signalée"
            ? "Dépôt/Retrait illégal"
            : "Pari illégal",
      }));
    }

    return {
      startDate: frozenStart,
      endDate: frozenEnd,
      activeOperatorNames,
      bets: exportBets,
      transactions: exportTx,
      illegals: exportIllegals,
      chartImageBase64: chartImg,
    };
  }

  async function handlePreviewExcel() {
    if (!startDate || !endDate || startDate > endDate) {
      toast.error("Veuillez sélectionner une période valide");
      return;
    }
    setIsPreviewing(true);
    try {
      const payload = await fetchReportPayload();
      const wb = await buildWeeklyOfficialWorkbook(payload);

      const sheets: PreviewSheetData[] = wb.worksheets.map((ws) => {
        const colCount = Math.max(ws.columnCount || 9, 1);
        const colWidthsPx: number[] = [];
        for (let c = 1; c <= colCount; c++) {
          const w = ws.getColumn(c).width;
          const fallback = c === 1 ? 6 : c === 2 ? 14 : 18;
          const px = Math.max(44, Math.min(260, Math.round((w || fallback) * 7.2)));
          colWidthsPx.push(px);
        }
        const mergeMasterMap = new Map<string, { colSpan: number; rowSpan: number }>();
        const mergeSlaveSet = new Set<string>();
        for (const mRange of ws.model?.merges || []) {
          const b = parseMergeBounds(mRange);
          if (!b) continue;
          mergeMasterMap.set(`${b.r1}:${b.c1}`, {
            colSpan: b.c2 - b.c1 + 1,
            rowSpan: b.r2 - b.r1 + 1,
          });
          for (let rr = b.r1; rr <= b.r2; rr++) {
            for (let cc = b.c1; cc <= b.c2; cc++) {
              if (rr === b.r1 && cc === b.c1) continue;
              mergeSlaveSet.add(`${rr}:${cc}`);
            }
          }
        }

        const rows: PreviewSheetData["rows"] = [];
        for (let r = 1; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const cells: PreviewSheetCell[] = [];
          for (let c = 1; c <= colCount; c++) {
            const coordKey = `${r}:${c}`;
            if (mergeSlaveSet.has(coordKey)) continue;
            const span = mergeMasterMap.get(coordKey);
            const cell = row.getCell(c);
            const fill: any = cell.fill;
            const bgHex =
              fill?.type === "pattern" ? argbToHex(fill?.fgColor?.argb) : undefined;
            cells.push({
              text: formatPreviewCellText(cell.value),
              bgHex,
              bold: Boolean(cell.font?.bold),
              align:
                (cell.alignment?.horizontal as "left" | "center" | "right") ||
                "left",
              colSpan: span && span.colSpan > 1 ? span.colSpan : undefined,
              rowSpan: span && span.rowSpan > 1 ? span.rowSpan : undefined,
            });
          }
          rows.push({ rowNum: r, cells });
        }
        return { name: ws.name, colCount, colWidthsPx, rows };
      });

      setPreviewSheets(sheets);
      if (sheets.length > 0) setPreviewActiveTab(sheets[0].name);
      setPreviewOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Impossible de générer l'aperçu du classeur",
      );
    } finally {
      setIsPreviewing(false);
    }
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
      const payload = await fetchReportPayload();
      await exportWeeklyOfficialReport(payload);
      toast.success("Rapport officiel (.xlsx) généré avec succès", {
        id: "weekly-report",
      });
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erreur lors de la génération du rapport Excel",
        { id: "weekly-report" },
      );
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
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-[#EBF7EE] text-[#006B2D] flex items-center justify-center shrink-0 border border-[#CFE4D5]">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-[#17251C] tracking-tight">
                Matrice &amp; Rapport Officiel par Période
              </h2>
              <p className="text-xs text-[#556B5C] mt-0.5">
                Feuilles <span className="font-semibold text-[#17251C]">TEST</span>,{" "}
                <span className="font-semibold text-[#17251C]">DEPOT-RETRAIT</span> et{" "}
                <span className="font-semibold text-[#17251C]">ILLEGAL</span> sur{" "}
                {reportOperators.length} opérateur(s) actif(s).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadChartPng}
              className="h-10 px-3.5 text-xs font-semibold text-[#17251C] bg-[#FAFBF9] border-[#D8E6DB] hover:bg-[#F0F5F1] hover:border-[#B8DEC6] rounded-lg gap-1.5 whitespace-nowrap transition-colors duration-150"
            >
              <ImageIcon className="h-4 w-4 text-[#556B5C]" />
              <span>Graphe PNG</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handlePreviewExcel}
              disabled={isPreviewing || isExporting || !startDate || !endDate || startDate > endDate}
              className="h-10 px-3.5 text-xs font-bold text-[#006B2D] bg-[#EBF7EE] border-[#B8DEC6] hover:bg-[#DCF1E2] hover:border-[#006B2D]/40 rounded-lg gap-1.5 whitespace-nowrap transition-colors duration-150"
            >
              {isPreviewing ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#006B2D]" />
              ) : (
                <Eye className="h-4 w-4 text-[#006B2D]" />
              )}
              <span>
                {isPreviewing ? "Chargement…" : "Aperçu Excel"}
              </span>
            </Button>
            <Button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || !startDate || !endDate || startDate > endDate}
              className="h-10 px-4 text-xs font-bold bg-[#006B2D] hover:bg-[#004D20] active:bg-[#003D19] text-white rounded-lg gap-2 whitespace-nowrap shadow-xs transition-colors duration-150"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#FFD000]" />
              ) : (
                <Download className="h-4 w-4 text-[#FFD000]" />
              )}
              <span>
                {isExporting ? "Génération…" : "Télécharger (.xlsx)"}
              </span>
            </Button>
          </div>
        </div>

        <div className="pt-2 border-t border-[#E2ECE4] space-y-4">
          {!hidePeriodControls && (
            <PeriodSelector
              year={year}
              month={month}
              tranche={tranche}
              onYearChange={setYear}
              onMonthChange={setMonth}
              onTrancheChange={setTranche}
              mode={periodMode}
              onModeChange={setPeriodMode}
              allowCustomMode
              customStart={customStart}
              customEnd={customEnd}
              onCustomStartChange={setCustomStart}
              onCustomEndChange={setCustomEnd}
              disabled={isExporting}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#F5F8F5] border border-[#D8E6DB] flex flex-col justify-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#556B5C]">
                Aperçu Tests de jeux (Période)
              </span>
              <span className="text-lg font-extrabold text-[#17251C]">
                {filteredBets.length}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#F5F8F5] border border-[#D8E6DB] flex flex-col justify-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#556B5C]">
                Aperçu Dépôts &amp; Retraits (Période)
              </span>
              <span className="text-lg font-extrabold text-[#006B2D]">
                {filteredTx.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Aperçu du classement par blocs d'opérateurs */}
      <div className="bg-white rounded-2xl border border-[#D8E6DB] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-[#F5F8F5] border-b border-[#D8E6DB] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-[#17251C]">
              Aperçu du classement par blocs d&apos;opérateurs (feuilles PARI &amp; DEPOT-RETRAIT)
            </h4>
            <p className="text-xs text-[#556B5C]">
              Chaque opérateur dispose de son bloc trié chronologiquement (N° 1 → N) avec ses sous-totaux dédiés dans le fichier Excel.
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#006B2D] text-white">
            {operatorBlockSummaries.length} opérateur(s)
          </span>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {operatorBlockSummaries.map((block) => (
            <div
              key={block.meta.key}
              className="rounded-xl border border-[#D8E6DB] bg-[#FAFBF9] p-3.5 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0 border border-black/15"
                    style={{ backgroundColor: block.meta.chartColor }}
                  />
                  <span className="font-extrabold text-sm text-[#17251C] truncate">
                    {block.meta.displayName}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#556B5C] bg-white px-2 py-0.5 rounded-md border border-[#D8E6DB]">
                  {block.betCount > 0 ? `PARI N° 1 → ${block.betCount}` : "0 pari"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white border border-[#E6EEE8] p-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#556B5C]">
                    TOTAL PARI
                  </span>
                  <span className="font-extrabold text-[#17251C] tabular-nums">
                    {block.betTotalFcfa.toLocaleString("fr-FR")} F
                  </span>
                </div>
                <div className="rounded-lg bg-white border border-[#E6EEE8] p-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#556B5C]">
                    OPÉRATIONS D/R
                  </span>
                  <span className="font-extrabold text-[#17251C] tabular-nums">
                    {block.txCount > 0 ? `N° 1 → ${block.txCount}` : "0 op."}
                  </span>
                </div>
                <div className="rounded-lg bg-[#EAF4ED] border border-[#CFE4D5] p-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#004D20]">
                    TOTAL DÉPÔT
                  </span>
                  <span className="font-extrabold text-[#006B2D] tabular-nums">
                    {block.depotTotalFcfa.toLocaleString("fr-FR")} F
                  </span>
                </div>
                <div className="rounded-lg bg-[#FFF8DF] border border-[#EFE0A8] p-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#7A5B00]">
                    TOTAL RETRAIT
                  </span>
                  <span className="font-extrabold text-[#7A5B00] tabular-nums">
                    {block.retraitTotalFcfa.toLocaleString("fr-FR")} F
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Matrice 1 : Nombre de tests par jour & par opérateur actif */}
      <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#006B2D]" />
            <h3 className="text-sm font-extrabold text-[#17251C]">
              Matrice Journalière des Tests par Opérateur Actif
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-[#556B5C]">
            Feuille PARI ({reportOperators.length} opérateurs)
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#D8E6DB]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-2.5 text-center font-extrabold border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C] whitespace-nowrap">
                  DATE
                </th>
                {reportOperators.map((op) => (
                  <th
                    key={op.key}
                    className="p-2.5 text-center font-extrabold border border-[#17251C]/20 text-[#17251C] whitespace-nowrap"
                    style={{ backgroundColor: `#${op.fill.slice(2)}` }}
                  >
                    {op.label}
                  </th>
                ))}
                <th className="p-2.5 text-center font-extrabold border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C] whitespace-nowrap">
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
                    {reportOperators.map((op) => (
                      <td
                        key={op.key}
                        className="p-2 text-center font-mono border border-[#D8E6DB] text-[#17251C]"
                      >
                        {(row.counts[op.key] || 0) > 0 ? row.counts[op.key] : ""}
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
                    colSpan={reportOperators.length + 2}
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
                  {reportOperators.map((op) => (
                    <td
                      key={op.key}
                      className="p-2.5 text-center font-mono border border-[#17251C]/20 text-[#17251C]"
                    >
                      {betTotals[op.key] || 0}
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
              Évolution Journalière des Tests par Opérateur Actif
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-[#556B5C]">
            {startDate} → {endDate}
          </span>
        </div>

        <div className="h-[320px] w-full">
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
              {reportOperators.map((op) => (
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

      {/* Matrice 2 : Dépôts & Retraits par jour et par opérateur actif */}
      <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-[#17251C]">
            Matrice Récapitulative Dépôts &amp; Retraits par Opérateur Actif (F CFA)
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
                  className="p-2 text-center font-extrabold border border-[#17251C]/20 bg-[#BFBFBF] text-[#17251C] whitespace-nowrap"
                >
                  DATE
                </th>
                {reportOperators.map((op) => (
                  <th
                    key={op.key}
                    colSpan={2}
                    className="p-2 text-center font-extrabold border border-[#17251C]/20 text-[#17251C] whitespace-nowrap"
                    style={{ backgroundColor: `#${op.fill.slice(2)}` }}
                  >
                    {op.label}
                  </th>
                ))}
              </tr>
              <tr>
                {reportOperators.map((op) => (
                  <React.Fragment key={op.key}>
                    <th className="p-1.5 text-center font-bold border border-[#17251C]/20 bg-[#F5F8F5] text-[#006B2D] whitespace-nowrap">
                      DEPOTS
                    </th>
                    <th className="p-1.5 text-center font-bold border border-[#17251C]/20 bg-[#F5F8F5] text-[#E52329] whitespace-nowrap">
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
                  {reportOperators.map((op) => (
                    <React.Fragment key={op.key}>
                      <td className="p-2 text-right font-mono border border-[#D8E6DB] text-[#17251C] whitespace-nowrap">
                        {formatMoney(row.depots[op.key] || 0)}
                      </td>
                      <td className="p-2 text-right font-mono border border-[#D8E6DB] text-[#17251C] whitespace-nowrap">
                        {formatMoney(row.retraits[op.key] || 0)}
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
                  {reportOperators.map((op) => (
                    <React.Fragment key={op.key}>
                      <td className="p-2 text-right font-mono border border-[#17251C]/20 text-[#006B2D] whitespace-nowrap">
                        {new Intl.NumberFormat("fr-FR").format(
                          txTotals.depots[op.key] || 0,
                        )}
                      </td>
                      <td className="p-2 text-right font-mono border border-[#17251C]/20 text-[#E52329] whitespace-nowrap">
                        {new Intl.NumberFormat("fr-FR").format(
                          txTotals.retraits[op.key] || 0,
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

      {/* Modal d'aperçu du classeur Excel sans téléchargement */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[95vw] max-w-6xl max-h-[92dvh] p-3 sm:p-6 overflow-hidden flex flex-col bg-white border border-[#D8E6DB]">
          <DialogHeader className="shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pr-7">
              <div className="min-w-0">
                <DialogTitle className="text-sm sm:text-lg font-extrabold text-[#17251C] flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-[#006B2D] shrink-0" />
                  <span className="truncate">Aperçu du Classeur Officiel (.xlsx)</span>
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-[#556B5C] mt-0.5">
                  Prévisualisation des feuilles générées (blocs opérateurs, sous-totaux et matrices) pour la période {startDate} → {endDate}.
                </DialogDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setPreviewOpen(false);
                  void handleExportExcel();
                }}
                disabled={isExporting}
                className="w-full sm:w-auto shrink-0 bg-[#006B2D] hover:bg-[#004D20] text-white text-xs font-bold gap-1.5"
              >
                <Download className="h-3.5 w-3.5 text-[#FFD000]" />
                <span>Télécharger (.xlsx)</span>
              </Button>
            </div>
          </DialogHeader>

          {previewSheets.length > 0 && (
            <Tabs
              value={previewActiveTab}
              onValueChange={setPreviewActiveTab}
              className="flex-1 min-h-0 min-w-0 w-full flex flex-col space-y-2.5"
            >
              <TabsList className="w-full max-w-full h-auto max-h-28 overflow-y-auto flex flex-wrap justify-start gap-1 bg-[#EEF4EF] border border-[#D8E6DB] p-1 rounded-xl shrink-0">
                {previewSheets.map((s) => (
                  <TabsTrigger
                    key={s.name}
                    value={s.name}
                    className="h-7 px-2.5 text-[11px] sm:text-xs font-bold rounded-lg data-[state=active]:bg-[#006B2D] data-[state=active]:text-white whitespace-nowrap"
                  >
                    {s.name} ({s.rows.length} lig.)
                  </TabsTrigger>
                ))}
              </TabsList>

              {previewSheets.map((s) => (
                <TabsContent
                  key={s.name}
                  value={s.name}
                  className="flex-1 min-h-0 min-w-0 w-full overflow-auto rounded-xl border border-[#D8E6DB] bg-[#FAFBF9] mt-0"
                >
                  <table className="table-fixed w-max border-collapse text-[10px] sm:text-[11px] font-sans">
                    <colgroup>
                      <col style={{ width: "36px" }} />
                      {s.colWidthsPx.map((px, i) => (
                        <col key={i} style={{ width: `${px}px` }} />
                      ))}
                    </colgroup>
                    <tbody>
                      {s.rows.map((r) => {
                        const isBlank = r.cells.every((c) => !c.text);
                        return (
                          <tr
                            key={r.rowNum}
                            className={
                              isBlank
                                ? "h-3.5 bg-[#FAFBF9]"
                                : r.rowNum <= 2
                                  ? "bg-[#F5F8F5]"
                                  : "bg-white hover:bg-[#F5F8F5]/60"
                            }
                          >
                            <td className="sticky left-0 z-10 px-1.5 sm:px-2 py-1 text-[10px] font-mono text-[#556B5C] bg-[#F5F8F5] border border-[#D8E6DB] text-center select-none w-8 sm:w-9">
                              {r.rowNum}
                            </td>
                            {r.cells.map((c, idx) => (
                              <td
                                key={idx}
                                colSpan={c.colSpan}
                                rowSpan={c.rowSpan}
                                style={
                                  c.bgHex
                                    ? { backgroundColor: c.bgHex }
                                    : undefined
                                }
                                className={`px-1.5 sm:px-2 py-1 border border-[#D8E6DB] text-[#17251C] ${
                                  c.colSpan && c.colSpan > 1
                                    ? "whitespace-normal"
                                    : "truncate"
                                } ${
                                  c.bold ? "font-bold" : "font-normal"
                                } ${
                                  c.align === "right"
                                    ? "text-right tabular-nums"
                                    : c.align === "center"
                                      ? "text-center"
                                      : "text-left"
                                }`}
                              >
                                {c.text}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
