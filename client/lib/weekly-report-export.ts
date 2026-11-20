import ExcelJS from "exceljs";
import { readRecordReference } from "@/lib/record-reference";
import { buildReportFilename } from "@/lib/report-periods";
import { addNativeCharts, type NativeChart } from "./report-charts";

function uniqueSafeSheetName(
  wb: ExcelJS.Workbook,
  rawName: string,
): string {
  const cleaned = rawName.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  const base = cleaned.slice(0, 31) || "Feuille";
  if (!wb.getWorksheet(base)) return base;
  for (let i = 2; i < 100; i++) {
    const suffix = ` (${i})`;
    const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!wb.getWorksheet(candidate)) return candidate;
  }
  return base;
}

function applyPrintablePageSetup(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  };
}

export interface ReportOperatorMeta {
  key: string; // Uppercase normalized key (e.g. "1XBET")
  label: string; // Header label (e.g. "1XBET")
  displayName: string; // Row display label (e.g. "1xBet")
  fill: string; // Excel ARGB e.g. "FF00B0F0"
  chartColor: string; // Hex for Recharts e.g. "#00B0F0"
}

const CANONICAL_OPERATOR_ORDER = [
  "1XBET",
  "BET223",
  "PREMIERBET",
  "MALIBET",
  "MEGAPARI",
  "888STARZ",
];

const KNOWN_OPERATOR_META: Record<
  string,
  { displayName: string; fill: string; chartColor: string }
> = {
  "1XBET": { displayName: "1xBet", fill: "FF00B0F0", chartColor: "#00B0F0" },
  BET223: { displayName: "Bet223", fill: "FFED7D31", chartColor: "#ED7D31" },
  PREMIERBET: {
    displayName: "PremierBet",
    fill: "FF70AD47",
    chartColor: "#70AD47",
  },
  MALIBET: { displayName: "MALIBET", fill: "FFF4B084", chartColor: "#F4B084" },
  MEGAPARI: {
    displayName: "MEGAPARI",
    fill: "FFFFFF00",
    chartColor: "#EAB308",
  },
  "888STARZ": {
    displayName: "888STARZ",
    fill: "FFB4C6E7",
    chartColor: "#B4C6E7",
  },
};

const FALLBACK_PALETTE: Array<{ fill: string; chartColor: string }> = [
  { fill: "FF9DC3E6", chartColor: "#3B82F6" },
  { fill: "FFA9D08E", chartColor: "#22C55E" },
  { fill: "FFFFD966", chartColor: "#F59E0B" },
  { fill: "FFF8CBAD", chartColor: "#FB923C" },
  { fill: "FFD9E1F2", chartColor: "#6366F1" },
  { fill: "FFC6E0B4", chartColor: "#10B981" },
  { fill: "FFFFE699", chartColor: "#CA8A04" },
  { fill: "FFE2EFDA", chartColor: "#16A34A" },
];

export function normalizeOperatorKey(raw?: string | null): string {
  if (!raw) return "";
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned === "BET222" || cleaned === "BET233") return "BET223";
  if (cleaned === "1XBET") return "1XBET";
  if (cleaned === "PREMIERBET") return "PREMIERBET";
  if (cleaned === "MALIBET") return "MALIBET";
  return cleaned;
}

function getOperatorOrderIndex(key: string): number {
  const idx = CANONICAL_OPERATOR_ORDER.indexOf(key);
  return idx === -1 ? 999 : idx;
}

/**
 * Construit dynamiquement la liste des opérateurs du rapport dans l'ordre canonique
 * de référence (1xBet, Bet223, PremierBet, MALIBET, MEGAPARI, 888STARZ, puis autres).
 */
export function resolveReportOperators(
  activeOperatorNames: string[],
  bets: any[] = [],
  transactions: any[] = [],
): ReportOperatorMeta[] {
  const seen = new Map<string, string>();

  const register = (name?: string | null) => {
    if (!name || !name.trim()) return;
    const key = normalizeOperatorKey(name);
    if (!key) return;
    if (!seen.has(key)) {
      seen.set(key, name.trim());
    }
  };

  for (const name of activeOperatorNames) register(name);
  for (const b of bets) register(b.operator);
  for (const t of transactions) register(t.operator);

  const sortedEntries = Array.from(seen.entries()).sort(([keyA, labelA], [keyB, labelB]) => {
    const idxA = getOperatorOrderIndex(keyA);
    const idxB = getOperatorOrderIndex(keyB);
    if (idxA !== idxB) return idxA - idxB;
    return labelA.localeCompare(labelB, "fr");
  });

  let fallbackIdx = 0;
  const result: ReportOperatorMeta[] = [];

  for (const [key, label] of sortedEntries) {
    const known = KNOWN_OPERATOR_META[key];
    if (known) {
      result.push({
        key,
        label: key,
        displayName: known.displayName,
        fill: known.fill,
        chartColor: known.chartColor,
      });
    } else {
      const palette = FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length];
      fallbackIdx++;
      result.push({
        key,
        label: label.toUpperCase(),
        displayName: label,
        fill: palette.fill,
        chartColor: palette.chartColor,
      });
    }
  }

  return result;
}

export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  if (!startDate || !endDate) return dates;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    return dates;
  }
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 62) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return dates;
}

const MONTHS_FR_SHORT = [
  "janv",
  "févr",
  "mars",
  "avr",
  "mai",
  "juin",
  "juil",
  "août",
  "sept",
  "oct",
  "nov",
  "déc",
];

const MONTHS_FR_UPPER = [
  "JANVIER",
  "FÉVRIER",
  "MARS",
  "AVRIL",
  "MAI",
  "JUIN",
  "JUILLET",
  "AOÛT",
  "SEPTEMBRE",
  "OCTOBRE",
  "NOVEMBRE",
  "DÉCEMBRE",
];

const MONTHS_FR_LOWER = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function formatShortFrDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${d.getDate()}-${MONTHS_FR_SHORT[d.getMonth()]}`;
}

export function formatFullPeriodTitle(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "";
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return `DU ${startDate} AU ${endDate}`;
  }
  const sDay = String(s.getDate()).padStart(2, "0");
  const eDay = String(e.getDate()).padStart(2, "0");
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `DU ${sDay} AU ${eDay} ${MONTHS_FR_UPPER[e.getMonth()]}`;
  }
  return `DU ${sDay} ${MONTHS_FR_UPPER[s.getMonth()]} AU ${eDay} ${MONTHS_FR_UPPER[e.getMonth()]}`;
}

function formatSentencePeriod(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "";
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return `du ${startDate} au ${endDate}`;
  }
  const sDay = s.getDate();
  const eDay = e.getDate();
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `du ${sDay} au ${eDay} ${MONTHS_FR_LOWER[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `du ${sDay} ${MONTHS_FR_LOWER[s.getMonth()]} au ${eDay} ${MONTHS_FR_LOWER[e.getMonth()]} ${e.getFullYear()}`;
}

export function formatExcelHour(rawTime?: string | null): string {
  if (!rawTime) return "";
  const trimmed = String(rawTime).trim();
  const match = /^(\d{1,2})[:Hh](\d{2})(?::\d{2})?$/.exec(trimmed);
  if (match) {
    return `${match[1].padStart(2, "0")}H${match[2]}`;
  }
  return trimmed.toUpperCase();
}

function sortableTimeKey(rawTime?: string | null): string {
  if (!rawTime) return "99:99";
  const match = /^(\d{1,2})[:Hh](\d{2})/.exec(String(rawTime).trim());
  if (!match) return "99:99";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function sortOperationsChronologically<T extends Record<string, any>>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const dateA = String(a.date || "");
    const dateB = String(b.date || "");
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    const timeA = sortableTimeKey(a.time);
    const timeB = sortableTimeKey(b.time);
    if (timeA !== timeB) return timeA.localeCompare(timeB);

    const refA = String(readRecordReference(a).reference || a.id || "");
    const refB = String(readRecordReference(b).reference || b.id || "");
    return refA.localeCompare(refB);
  });
}

export interface OperatorOperationGroup<T> {
  meta: ReportOperatorMeta;
  items: T[];
}

export function groupOperationsByOperator<T extends Record<string, any>>(
  items: T[],
  reportOperators: ReportOperatorMeta[],
): OperatorOperationGroup<T>[] {
  const buckets = new Map<string, T[]>();
  const metaByKey = new Map<string, ReportOperatorMeta>();

  for (const op of reportOperators) {
    metaByKey.set(op.key, op);
    buckets.set(op.key, []);
  }

  for (const item of items) {
    const key = normalizeOperatorKey(item.operator) || "AUTRE";
    if (!buckets.has(key)) {
      buckets.set(key, []);
      metaByKey.set(key, {
        key,
        label: key,
        displayName: String(item.operator || key),
        fill: "FFE2EFDA",
        chartColor: "#16A34A",
      });
    }
    buckets.get(key)!.push(item);
  }

  const orderedKeys = Array.from(buckets.keys()).sort((a, b) => {
    const idxA = getOperatorOrderIndex(a);
    const idxB = getOperatorOrderIndex(b);
    if (idxA !== idxB) return idxA - idxB;
    const posA = reportOperators.findIndex((o) => o.key === a);
    const posB = reportOperators.findIndex((o) => o.key === b);
    if (posA !== -1 && posB !== -1) return posA - posB;
    return a.localeCompare(b, "fr");
  });

  const groups: OperatorOperationGroup<T>[] = [];
  for (const key of orderedKeys) {
    const list = buckets.get(key) || [];
    if (list.length === 0) continue;
    groups.push({
      meta: metaByKey.get(key)!,
      items: sortOperationsChronologically(list),
    });
  }
  return groups;
}

export interface DailyBetMatrixRow {
  isoDate: string;
  label: string;
  counts: Record<string, number>;
  total: number;
}

export interface DailyTxMatrixRow {
  isoDate: string;
  label: string;
  depots: Record<string, number>;
  retraits: Record<string, number>;
  totalDepots: number;
  totalRetraits: number;
}

export function buildDailyBetMatrix(
  bets: any[],
  startDate: string,
  endDate: string,
  operators: ReportOperatorMeta[],
): DailyBetMatrixRow[] {
  const dates = getDatesInRange(startDate, endDate);
  const byDate = new Map<string, Record<string, number>>();

  const emptyCounts = () => {
    const rec: Record<string, number> = {};
    for (const op of operators) rec[op.key] = 0;
    return rec;
  };

  for (const d of dates) {
    byDate.set(d, emptyCounts());
  }

  for (const b of bets) {
    const key = normalizeOperatorKey(b.operator);
    if (!key) continue;
    const row = byDate.get(b.date);
    if (row && key in row) {
      row[key] += 1;
    }
  }

  return dates.map((isoDate) => {
    const counts = byDate.get(isoDate)!;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return {
      isoDate,
      label: formatShortFrDate(isoDate),
      counts,
      total,
    };
  });
}

export function buildDailyTxMatrix(
  transactions: any[],
  startDate: string,
  endDate: string,
  operators: ReportOperatorMeta[],
): DailyTxMatrixRow[] {
  const dates = getDatesInRange(startDate, endDate);
  const byDate = new Map<
    string,
    { depots: Record<string, number>; retraits: Record<string, number> }
  >();

  const emptyRecord = (): Record<string, number> => {
    const rec: Record<string, number> = {};
    for (const op of operators) rec[op.key] = 0;
    return rec;
  };

  for (const d of dates) {
    byDate.set(d, { depots: emptyRecord(), retraits: emptyRecord() });
  }

  for (const tx of transactions) {
    const key = normalizeOperatorKey(tx.operator);
    if (!key) continue;
    const bucket = byDate.get(tx.date);
    if (!bucket || !(key in bucket.depots)) continue;
    const amt = Number(tx.amount_fcfa) || 0;
    const isRetrait = String(tx.type || "").toLowerCase().includes("retrait");
    if (isRetrait) {
      bucket.retraits[key] += amt;
    } else {
      bucket.depots[key] += amt;
    }
  }

  return dates.map((isoDate) => {
    const { depots, retraits } = byDate.get(isoDate)!;
    return {
      isoDate,
      label: formatShortFrDate(isoDate),
      depots,
      retraits,
      totalDepots: Object.values(depots).reduce((s, n) => s + n, 0),
      totalRetraits: Object.values(retraits).reduce((s, n) => s + n, 0),
    };
  });
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

function styleHeaderCell(
  cell: ExcelJS.Cell,
  fillArgb = "FFBFBFBF",
  size = 14,
) {
  cell.font = {
    name: "Cambria",
    size,
    bold: true,
    color: { argb: "FF000000" },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: fillArgb },
  };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = THIN_BORDER;
}

function styleDataCell(
  cell: ExcelJS.Cell,
  horizontal: "left" | "center" | "right" = "center",
  bold = false,
  size = 14,
) {
  cell.font = {
    name: "Cambria",
    size,
    bold,
    color: { argb: "FF000000" },
  };
  cell.alignment = { vertical: "middle", horizontal };
  cell.border = THIN_BORDER;
}

function resolveProofDisplay(record: any): string {
  if (record.proof_attachment_url || record.proof_status === "disponible") {
    return "Dispo";
  }
  if (record.proof_status === "non_disponible") {
    return "Non Dispo";
  }
  if (record.proof === true) return "Dispo";
  if (record.proof === false) return "Non Dispo";
  return "Non Dispo";
}

function normalizeDisplayTxType(raw?: string | null): string {
  const v = String(raw || "").toLowerCase();
  if (v.includes("retrait")) return "Retrait";
  return "Dépôt";
}

export interface ExportWeeklyReportParams {
  startDate: string;
  endDate: string;
  activeOperatorNames: string[];
  bets: any[];
  transactions: any[];
  illegals: any[];
  chartImageBase64?: string | null;
}

async function buildWeeklyOfficialWorkbookInternal({
  startDate,
  endDate,
  activeOperatorNames,
  bets,
  transactions,
  illegals,
}: ExportWeeklyReportParams): Promise<{ wb: ExcelJS.Workbook; charts: NativeChart[] }> {
  const wb = new ExcelJS.Workbook();
  const charts: NativeChart[] = [];
  wb.creator = "OPEN - Plateforme de Contrôle";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const filteredBets = bets.filter(
    (b) => (!startDate || b.date >= startDate) && (!endDate || b.date <= endDate),
  );
  const filteredTx = transactions.filter(
    (t) => (!startDate || t.date >= startDate) && (!endDate || t.date <= endDate),
  );
  const filteredIllegals = sortOperationsChronologically(
    illegals.filter(
      (i) => (!startDate || i.date >= startDate) && (!endDate || i.date <= endDate),
    ),
  );

  const reportOperators = resolveReportOperators(
    activeOperatorNames,
    filteredBets,
    filteredTx,
  );
  const betGroups = groupOperationsByOperator(filteredBets, reportOperators);
  const txGroups = groupOperationsByOperator(filteredTx, reportOperators);

  const titlePeriod = formatFullPeriodTitle(startDate, endDate);
  const sentencePeriod = formatSentencePeriod(startDate, endDate);

  // ============================================================================
  // 1. FEUILLE TEST (classée par blocs d'opérateurs)
  // ============================================================================
  const wsPari = wb.addWorksheet("TEST");
  applyPrintablePageSetup(wsPari);
  wsPari.mergeCells("C1:I1");
  const pariTitle = wsPari.getCell("C1");
  pariTitle.value = `RAPPORT DE LA SEMAINE ${titlePeriod}`;
  pariTitle.font = {
    name: "Cambria",
    size: 14,
    bold: true,
    color: { argb: "FF000000" },
  };
  pariTitle.alignment = { vertical: "middle", horizontal: "center" };
  wsPari.getRow(1).height = 24;

  const pariHeaders = [
    "N°",
    "DATE",
    "Opérateur de jeux",
    "Support",
    "Type de Test",
    "Montant FCFA",
    "Heure",
    "Numéro de téléphone",
    "Référence",
  ];
  const pariWidths = [6, 16.5, 22.8, 20.2, 20.2, 23, 16.2, 22.8, 38.5];
  pariWidths.forEach((w, idx) => {
    wsPari.getColumn(idx + 1).width = w;
  });

  const pariHeaderRow = wsPari.getRow(2);
  pariHeaderRow.height = 40;
  pariHeaderRow.values = pariHeaders;
  pariHeaders.forEach((_, i) => styleHeaderCell(pariHeaderRow.getCell(i + 1)));

  let pariRowIdx = 3;

  betGroups.forEach((group, groupIdx) => {
    const blockStart = pariRowIdx;
    let blockTotal = 0;

    group.items.forEach((b, idx) => {
      const row = wsPari.getRow(pariRowIdx++);
      row.height = 19;
      const amt = Number(b.amount_fcfa) || 0;
      blockTotal += amt;
      const ref = readRecordReference(b).reference || b.notes || "";

      row.getCell(1).value = idx + 1;
      row.getCell(2).value = b.date
        ? new Date(`${b.date}T00:00:00`).toLocaleDateString("fr-FR")
        : "";
      row.getCell(3).value = group.meta.displayName || b.operator || "";
      row.getCell(4).value = b.support || "";
      row.getCell(5).value = b.bet_type || "";
      row.getCell(6).value = amt;
      row.getCell(6).numFmt = "#,##0";
      row.getCell(7).value = formatExcelHour(b.time);
      row.getCell(8).value = b.phone ? String(b.phone) : "";
      row.getCell(9).value = ref ? String(ref) : "";

      [1, 2, 3, 4, 5, 7, 8, 9].forEach((c) =>
        styleDataCell(row.getCell(c), "center"),
      );
      styleDataCell(row.getCell(6), "right");

      row.getCell(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: group.meta.fill },
      };
    });

    const blockEnd = pariRowIdx - 1;
    const subTotalRow = wsPari.getRow(pariRowIdx++);
    subTotalRow.height = 21;
    subTotalRow.getCell(5).value = "TOTAL";
    styleDataCell(subTotalRow.getCell(5), "center", true);
    subTotalRow.getCell(6).value = {
      formula: `SUM(F${blockStart}:F${blockEnd})`,
      result: blockTotal,
    };
    subTotalRow.getCell(6).numFmt = "#,##0";
    styleHeaderCell(subTotalRow.getCell(6), "FFBFBFBF");
    subTotalRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };

    // Ligne vide de séparation entre opérateurs
    if (groupIdx < betGroups.length - 1) {
      wsPari.getRow(pariRowIdx++).height = 19;
    }
  });

  // Récapitulatif journalier PARI (à partir de la colonne B, style référence)
  if (reportOperators.length > 0) {
    pariRowIdx += 1;
    const introRowNum = pariRowIdx++;
    const introRow = wsPari.getRow(introRowNum);
    introRow.height = 20;
    wsPari.mergeCells(`A${introRowNum}:I${introRowNum}`);
    introRow.getCell(1).value = `Matrice Journalière des Tests par Opérateur Actif (${sentencePeriod}) :`;
    introRow.getCell(1).font = {
      name: "Cambria",
      size: 12,
      bold: true,
      color: { argb: "FF000000" },
    };

    pariRowIdx += 1; // ligne blanche avant le tableau récapitulatif

    const matrixHeaderRow = wsPari.getRow(pariRowIdx++);
    matrixHeaderRow.height = 26;
    matrixHeaderRow.getCell(2).value = "DATE";
    styleHeaderCell(matrixHeaderRow.getCell(2), "FFBFBFBF", 12);

    reportOperators.forEach((op, idx) => {
      const colIdx = idx + 3;
      const cell = matrixHeaderRow.getCell(colIdx);
      cell.value = op.label;
      styleHeaderCell(cell, op.fill, 12);
      if ((wsPari.getColumn(colIdx).width || 0) < 16) {
        wsPari.getColumn(colIdx).width = 16;
      }
    });

    const totalColIdx = reportOperators.length + 3;
    const totalMatrixHead = matrixHeaderRow.getCell(totalColIdx);
    totalMatrixHead.value = "TOTAL";
    styleHeaderCell(totalMatrixHead, "FFBFBFBF", 12);

    const betMatrix = buildDailyBetMatrix(
      filteredBets,
      startDate,
      endDate,
      reportOperators,
    );

    const matrixFirstDataRow = pariRowIdx;
    betMatrix.forEach((m) => {
      const r = wsPari.getRow(pariRowIdx++);
      r.height = 20;
      r.getCell(2).value = m.label;
      styleDataCell(r.getCell(2), "center", true, 12);

      reportOperators.forEach((op, idx) => {
        const val = m.counts[op.key] || 0;
        const cell = r.getCell(idx + 3);
        cell.value = val > 0 ? val : "";
        styleDataCell(cell, "center", false, 12);
      });

      const totCell = r.getCell(totalColIdx);
      const firstOpCol = wsPari.getColumn(3).letter;
      const lastOpCol = wsPari.getColumn(reportOperators.length + 2).letter;
      totCell.value = {
        formula: `SUM(${firstOpCol}${r.number}:${lastOpCol}${r.number})`,
        result: m.total,
      };
      styleDataCell(totCell, "center", true, 12);
    });
    const matrixLastDataRow = pariRowIdx - 1;

    const matrixTotalRow = wsPari.getRow(pariRowIdx++);
    matrixTotalRow.height = 22;
    matrixTotalRow.getCell(2).value = "TOTAL";
    styleHeaderCell(matrixTotalRow.getCell(2), "FFBFBFBF", 12);

    let grandBetTotal = 0;
    reportOperators.forEach((op, idx) => {
      const colIdx = idx + 3;
      const colLetter = wsPari.getColumn(colIdx).letter;
      const opSum = betMatrix.reduce((s, m) => s + (m.counts[op.key] || 0), 0);
      grandBetTotal += opSum;
      const c = matrixTotalRow.getCell(colIdx);
      c.value =
        matrixLastDataRow >= matrixFirstDataRow
          ? {
              formula: `SUM(${colLetter}${matrixFirstDataRow}:${colLetter}${matrixLastDataRow})`,
              result: opSum,
            }
          : opSum;
      styleHeaderCell(c, "FFF2F2F2", 12);
    });

    const totalLetter = wsPari.getColumn(totalColIdx).letter;
    const grandCell = matrixTotalRow.getCell(totalColIdx);
    grandCell.value =
      matrixLastDataRow >= matrixFirstDataRow
        ? {
            formula: `SUM(${totalLetter}${matrixFirstDataRow}:${totalLetter}${matrixLastDataRow})`,
            result: grandBetTotal,
          }
        : grandBetTotal;
    styleHeaderCell(grandCell, "FFBFBFBF", 12);

    if (matrixLastDataRow >= matrixFirstDataRow) {
      charts.push({
        sheetId: 1,
        title: "Matrice Journalière des Tests par Opérateur Actif",
        kind: "bar",
        row: pariRowIdx + 1,
        column: 1,
        width: Math.max(7, reportOperators.length + 3),
        height: 18,
        unit: "Tests",
        categories: {
          formula: `PARI!$B$${matrixFirstDataRow}:$B$${matrixLastDataRow}`,
          values: betMatrix.map((m) => m.label),
        },
        series: reportOperators.map((op, idx) => {
          const colLetter = wsPari.getColumn(idx + 3).letter;
          return {
            name: op.displayName,
            formula: `PARI!$${colLetter}$${matrixFirstDataRow}:$${colLetter}$${matrixLastDataRow}`,
            values: betMatrix.map((m) => m.counts[op.key] || 0),
            color: op.chartColor.replace(/^#/, ""),
          };
        }),
      });
    }
  }

  // ============================================================================
  // 2. FEUILLE DEPOT-RETRAIT (classée par blocs d'opérateurs)
  // ============================================================================
  const wsTx = wb.addWorksheet("DEPOT-RETRAIT");
  applyPrintablePageSetup(wsTx);
  wsTx.mergeCells("C1:K1");
  const txTitle = wsTx.getCell("C1");
  txTitle.value = `RAPPORT DE LA SEMAINE ${titlePeriod}`;
  txTitle.font = {
    name: "Cambria",
    size: 14,
    bold: true,
    color: { argb: "FF000000" },
  };
  txTitle.alignment = { vertical: "middle", horizontal: "center" };
  wsTx.getRow(1).height = 24;

  const txHeaders = [
    "N°",
    "DATE",
    "Opérateur de jeux",
    "Plateforme",
    "Opérateur de paiement",
    "Type",
    "Montant F CFA",
    "Heure",
    "Numéro de téléphone",
    "Référence",
    "preuve",
  ];
  const txWidths = [6, 16.5, 22.8, 20.2, 20.2, 27.8, 21.5, 17.2, 22.8, 38.3, 14.5];
  txWidths.forEach((w, idx) => {
    wsTx.getColumn(idx + 1).width = w;
  });

  const txHeaderRow = wsTx.getRow(2);
  txHeaderRow.height = 40;
  txHeaderRow.values = txHeaders;
  txHeaders.forEach((_, i) => styleHeaderCell(txHeaderRow.getCell(i + 1)));

  let txRowIdx = 3;

  txGroups.forEach((group, groupIdx) => {
    const blockStart = txRowIdx;
    let blockDepotTotal = 0;
    let blockRetraitTotal = 0;

    group.items.forEach((tx, idx) => {
      const row = wsTx.getRow(txRowIdx++);
      row.height = 19;
      const amt = Number(tx.amount_fcfa) || 0;
      const displayType = normalizeDisplayTxType(tx.type);
      if (displayType === "Retrait") {
        blockRetraitTotal += amt;
      } else {
        blockDepotTotal += amt;
      }
      const ref = readRecordReference(tx).reference || tx.notes || "";
      const proofLabel = resolveProofDisplay(tx);

      row.getCell(1).value = idx + 1;
      row.getCell(2).value = tx.date
        ? new Date(`${tx.date}T00:00:00`).toLocaleDateString("fr-FR")
        : "";
      row.getCell(3).value = group.meta.displayName || tx.operator || "";
      row.getCell(4).value = tx.platform || tx.support || "";
      row.getCell(5).value = tx.payment_operator || "";
      row.getCell(6).value = displayType;
      row.getCell(7).value = amt;
      row.getCell(7).numFmt = "#,##0";
      row.getCell(8).value = formatExcelHour(tx.time);
      row.getCell(9).value = tx.phone ? String(tx.phone) : "";
      row.getCell(10).value = ref ? String(ref) : "";
      row.getCell(11).value = proofLabel;

      [1, 2, 3, 4, 5, 6, 8, 9, 10, 11].forEach((c) =>
        styleDataCell(row.getCell(c), "center"),
      );
      styleDataCell(row.getCell(7), "right");

      row.getCell(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: group.meta.fill },
      };
    });

    const blockEnd = txRowIdx - 1;

    // Ligne TOTAL DEPOT du bloc opérateur
    const depotSubRow = wsTx.getRow(txRowIdx++);
    depotSubRow.height = 21;
    depotSubRow.getCell(6).value = "TOTAL DEPOT";
    styleDataCell(depotSubRow.getCell(6), "center", true);
    depotSubRow.getCell(7).value = {
      formula: `SUMIF(F${blockStart}:F${blockEnd},"Dépôt",G${blockStart}:G${blockEnd})`,
      result: blockDepotTotal,
    };
    depotSubRow.getCell(7).numFmt = "#,##0";
    styleHeaderCell(depotSubRow.getCell(7), "FFBFBFBF");
    depotSubRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };

    // Ligne TOTAL RETRAIT du bloc opérateur
    const retraitSubRow = wsTx.getRow(txRowIdx++);
    retraitSubRow.height = 21;
    retraitSubRow.getCell(6).value = "TOTAL RETRAIT";
    styleDataCell(retraitSubRow.getCell(6), "center", true);
    retraitSubRow.getCell(7).value = {
      formula: `SUMIF(F${blockStart}:F${blockEnd},"Retrait",G${blockStart}:G${blockEnd})`,
      result: blockRetraitTotal,
    };
    retraitSubRow.getCell(7).numFmt = "#,##0";
    styleHeaderCell(retraitSubRow.getCell(7), "FFBFBFBF");
    retraitSubRow.getCell(7).alignment = {
      vertical: "middle",
      horizontal: "right",
    };

    if (groupIdx < txGroups.length - 1) {
      wsTx.getRow(txRowIdx++).height = 19;
    }
  });

  // Matrice récapitulative DEPOT-RETRAIT dès la colonne B
  if (reportOperators.length > 0) {
    txRowIdx += 1;
    const introRowNum = txRowIdx++;
    const introRow = wsTx.getRow(introRowNum);
    introRow.height = 20;
    wsTx.mergeCells(`A${introRowNum}:K${introRowNum}`);
    introRow.getCell(1).value = `Matrice Récapitulative Dépôts & Retraits par Opérateur Actif (F CFA) (${sentencePeriod}) :`;
    introRow.getCell(1).font = {
      name: "Cambria",
      size: 12,
      bold: true,
      color: { argb: "FF000000" },
    };

    txRowIdx += 1;
    const opHeaderRow = wsTx.getRow(txRowIdx);
    const subHeaderRow = wsTx.getRow(txRowIdx + 1);
    opHeaderRow.height = 24;
    subHeaderRow.height = 22;

    wsTx.mergeCells(`B${txRowIdx}:B${txRowIdx + 1}`);
    opHeaderRow.getCell(2).value = "DATE";
    styleHeaderCell(opHeaderRow.getCell(2), "FFBFBFBF", 12);
    styleHeaderCell(subHeaderRow.getCell(2), "FFBFBFBF", 12);

    reportOperators.forEach((op, idx) => {
      const colStart = 3 + idx * 2;
      const colEnd = colStart + 1;
      wsTx.mergeCells(txRowIdx, colStart, txRowIdx, colEnd);
      opHeaderRow.getCell(colStart).value = op.label;
      styleHeaderCell(opHeaderRow.getCell(colStart), op.fill, 12);
      styleHeaderCell(opHeaderRow.getCell(colEnd), op.fill, 12);

      subHeaderRow.getCell(colStart).value = "DEPOTS";
      subHeaderRow.getCell(colEnd).value = "RETRAITS";
      styleHeaderCell(subHeaderRow.getCell(colStart), "FFF2F2F2", 12);
      styleHeaderCell(subHeaderRow.getCell(colEnd), "FFF2F2F2", 12);
    });

    txRowIdx += 2;
    const txMatrix = buildDailyTxMatrix(
      filteredTx,
      startDate,
      endDate,
      reportOperators,
    );

    const matrixFirstRow = txRowIdx;
    const depotTotals: Record<string, number> = {};
    const retraitTotals: Record<string, number> = {};
    for (const op of reportOperators) {
      depotTotals[op.key] = 0;
      retraitTotals[op.key] = 0;
    }

    txMatrix.forEach((m) => {
      const r = wsTx.getRow(txRowIdx++);
      r.height = 20;
      r.getCell(2).value = m.label;
      styleDataCell(r.getCell(2), "center", true, 12);

      reportOperators.forEach((op, idx) => {
        const colStart = 3 + idx * 2;
        const dVal = m.depots[op.key] || 0;
        const rVal = m.retraits[op.key] || 0;
        depotTotals[op.key] += dVal;
        retraitTotals[op.key] += rVal;

        const dCell = r.getCell(colStart);
        dCell.value = dVal > 0 ? dVal : "";
        dCell.numFmt = "#,##0";
        styleDataCell(dCell, "right", false, 12);

        const rCell = r.getCell(colStart + 1);
        rCell.value = rVal > 0 ? rVal : "";
        rCell.numFmt = "#,##0";
        styleDataCell(rCell, "right", false, 12);
      });
    });
    const matrixLastRow = txRowIdx - 1;

    const txMTotalRow = wsTx.getRow(txRowIdx++);
    txMTotalRow.height = 22;
    txMTotalRow.getCell(2).value = "TOTAL";
    styleHeaderCell(txMTotalRow.getCell(2), "FFBFBFBF", 12);
    reportOperators.forEach((op, idx) => {
      const colStart = 3 + idx * 2;
      const dLetter = wsTx.getColumn(colStart).letter;
      const rLetter = wsTx.getColumn(colStart + 1).letter;

      const dCell = txMTotalRow.getCell(colStart);
      const dVal = depotTotals[op.key] || 0;
      dCell.value =
        matrixLastRow >= matrixFirstRow
          ? {
              formula: `SUM(${dLetter}${matrixFirstRow}:${dLetter}${matrixLastRow})`,
              result: dVal,
            }
          : dVal;
      dCell.numFmt = "#,##0";
      styleHeaderCell(dCell, "FFF2F2F2", 12);
      dCell.alignment = { vertical: "middle", horizontal: "right" };

      const rCell = txMTotalRow.getCell(colStart + 1);
      const rVal = retraitTotals[op.key] || 0;
      rCell.value =
        matrixLastRow >= matrixFirstRow
          ? {
              formula: `SUM(${rLetter}${matrixFirstRow}:${rLetter}${matrixLastRow})`,
              result: rVal,
            }
          : rVal;
      rCell.numFmt = "#,##0";
      styleHeaderCell(rCell, "FFF2F2F2", 12);
      rCell.alignment = { vertical: "middle", horizontal: "right" };
    });

    if (matrixLastRow >= matrixFirstRow) {
      const txSeries: NativeChart["series"] = [];
      reportOperators.forEach((op, idx) => {
        const colStart = 3 + idx * 2;
        const dLetter = wsTx.getColumn(colStart).letter;
        const rLetter = wsTx.getColumn(colStart + 1).letter;
        const baseColor = op.chartColor.replace(/^#/, "");
        txSeries.push({
          name: `${op.displayName} (Dépôts)`,
          formula: `'DEPOT-RETRAIT'!$${dLetter}$${matrixFirstRow}:$${dLetter}$${matrixLastRow}`,
          values: txMatrix.map((m) => m.depots[op.key] || 0),
          color: baseColor,
        });
        txSeries.push({
          name: `${op.displayName} (Retraits)`,
          formula: `'DEPOT-RETRAIT'!$${rLetter}$${matrixFirstRow}:$${rLetter}$${matrixLastRow}`,
          values: txMatrix.map((m) => m.retraits[op.key] || 0),
          color: "E52329",
        });
      });

      charts.push({
        sheetId: 2,
        title: "Matrice Récapitulative Dépôts & Retraits par Opérateur Actif (F CFA)",
        kind: "bar",
        row: txRowIdx + 1,
        column: 1,
        width: Math.max(8, reportOperators.length * 2 + 2),
        height: 18,
        unit: "FCFA",
        categories: {
          formula: `'DEPOT-RETRAIT'!$B$${matrixFirstRow}:$B$${matrixLastRow}`,
          values: txMatrix.map((m) => m.label),
        },
        series: txSeries,
      });
    }
  }

  // ============================================================================
  // 3. FEUILLE ILLEGAL
  // ============================================================================
  const wsIll = wb.addWorksheet("ILLEGAL");
  wsIll.mergeCells("A1:K1");
  const illTitle = wsIll.getCell("A1");
  illTitle.value = `ACTIVITÉS ILLÉGALES — SEMAINE ${titlePeriod}`;
  illTitle.font = {
    name: "Cambria",
    size: 14,
    bold: true,
    color: { argb: "FF000000" },
  };
  illTitle.alignment = { vertical: "middle", horizontal: "center" };
  wsIll.getRow(1).height = 26;

  const illHeaders = [
    "N°",
    "Date",
    "Opérateur de jeux",
    "Plateforme",
    "Opérateur de paiement",
    "Type",
    "Montant",
    "Heure",
    "Numéro de téléphone",
    "Référence",
    "preuve",
  ];
  const illWidths = [7, 15, 22, 18, 20, 15, 18, 12, 20, 34, 14];
  illWidths.forEach((w, idx) => {
    wsIll.getColumn(idx + 1).width = w;
  });

  const illHeaderRow = wsIll.getRow(2);
  illHeaderRow.height = 36;
  illHeaderRow.values = illHeaders;
  illHeaders.forEach((_, i) => styleHeaderCell(illHeaderRow.getCell(i + 1), "FFBFBFBF", 12));

  let illRowIdx = 3;
  let totalIllAmount = 0;
  const illStartRow = illRowIdx;

  filteredIllegals.forEach((item, idx) => {
    const row = wsIll.getRow(illRowIdx++);
    row.height = 20;
    const amt = Number(item.amount_fcfa) || 0;
    totalIllAmount += amt;
    const ref = readRecordReference(item).reference || item.notes || "";

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = item.date
      ? new Date(`${item.date}T00:00:00`).toLocaleDateString("fr-FR")
      : "";
    row.getCell(3).value = item.operator || "";
    row.getCell(4).value = item.platform || item.support || "";
    row.getCell(5).value = item.payment_operator || "";
    row.getCell(6).value = item.bet_type || item.type || "";
    row.getCell(7).value = amt;
    row.getCell(7).numFmt = "#,##0";
    row.getCell(8).value = formatExcelHour(item.time);
    row.getCell(9).value = item.phone ? String(item.phone) : "";
    row.getCell(10).value = ref ? String(ref) : "";
    row.getCell(11).value = resolveProofDisplay(item);

    [1, 2, 3, 4, 5, 6, 8, 9, 10, 11].forEach((c) =>
      styleDataCell(row.getCell(c), "center", c === 3, 12),
    );
    styleDataCell(row.getCell(7), "right", false, 12);
  });
  const illEndRow = illRowIdx - 1;

  const illTotalRow = wsIll.getRow(illRowIdx++);
  illTotalRow.height = 22;
  wsIll.mergeCells(`A${illTotalRow.number}:F${illTotalRow.number}`);
  illTotalRow.getCell(1).value = "TOTAL";
  for (let c = 1; c <= 6; c++) styleHeaderCell(illTotalRow.getCell(c), "FFBFBFBF", 12);
  illTotalRow.getCell(7).value =
    illEndRow >= illStartRow
      ? {
          formula: `SUM(G${illStartRow}:G${illEndRow})`,
          result: totalIllAmount,
        }
      : 0;
  illTotalRow.getCell(7).numFmt = "#,##0";
  styleHeaderCell(illTotalRow.getCell(7), "FFBFBFBF", 12);
  illTotalRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };
  for (let c = 8; c <= 11; c++) styleHeaderCell(illTotalRow.getCell(c), "FFBFBFBF", 12);

  // ============================================================================
  // 4. ONGLETS IMPRIMABLES PAR OPÉRATEUR (Tests & Dépôts-Retraits uniquement)
  // ============================================================================
  const betGroupMap = new Map(betGroups.map((g) => [g.meta.key, g]));
  const txGroupMap = new Map(txGroups.map((g) => [g.meta.key, g]));

  reportOperators.forEach((op) => {
    // 4a. Onglet Test <Opérateur>
    const opBets = betGroupMap.get(op.key)?.items || [];
    const wsOpTest = wb.addWorksheet(
      uniqueSafeSheetName(wb, `Test ${op.displayName}`),
    );
    applyPrintablePageSetup(wsOpTest);
    wsOpTest.mergeCells("A1:I1");
    const opTestTitle = wsOpTest.getCell("A1");
    opTestTitle.value = `RAPPORT DE LA PÉRIODE ${titlePeriod} — OPÉRATEUR : ${op.label} (TESTS)`;
    opTestTitle.font = { name: "Cambria", size: 13, bold: true, color: { argb: "FF000000" } };
    opTestTitle.alignment = { vertical: "middle", horizontal: "center" };
    wsOpTest.getRow(1).height = 24;

    pariWidths.forEach((w, idx) => {
      wsOpTest.getColumn(idx + 1).width = w;
    });
    const opTestHeader = wsOpTest.getRow(2);
    opTestHeader.height = 36;
    opTestHeader.values = pariHeaders;
    pariHeaders.forEach((_, i) => styleHeaderCell(opTestHeader.getCell(i + 1), op.fill, 12));

    let rIdx = 3;
    const startRow = rIdx;
    let opBetTotal = 0;
    opBets.forEach((b, idx) => {
      const row = wsOpTest.getRow(rIdx++);
      row.height = 19;
      const amt = Number(b.amount_fcfa) || 0;
      opBetTotal += amt;
      const ref = readRecordReference(b).reference || b.notes || "";
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = b.date ? new Date(`${b.date}T00:00:00`).toLocaleDateString("fr-FR") : "";
      row.getCell(3).value = op.displayName || b.operator || "";
      row.getCell(4).value = b.support || "";
      row.getCell(5).value = b.bet_type || "";
      row.getCell(6).value = amt;
      row.getCell(6).numFmt = "#,##0";
      row.getCell(7).value = formatExcelHour(b.time);
      row.getCell(8).value = b.phone ? String(b.phone) : "";
      row.getCell(9).value = ref ? String(ref) : "";
      [1, 2, 3, 4, 5, 7, 8, 9].forEach((c) => styleDataCell(row.getCell(c), "center", c === 3, 12));
      styleDataCell(row.getCell(6), "right", false, 12);
    });
    const endRow = rIdx - 1;
    const totalRow = wsOpTest.getRow(rIdx++);
    totalRow.height = 22;
    totalRow.getCell(5).value = "TOTAL";
    styleHeaderCell(totalRow.getCell(5), "FFF2F2F2", 12);
    totalRow.getCell(6).value =
      endRow >= startRow
        ? { formula: `SUM(F${startRow}:F${endRow})`, result: opBetTotal }
        : 0;
    totalRow.getCell(6).numFmt = "#,##0";
    styleHeaderCell(totalRow.getCell(6), "FFF2F2F2", 12);
    totalRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };

    // Matrice journalière + graphique natif en bas de l'onglet Test <Opérateur>
    const opBetMatrix = buildDailyBetMatrix(opBets, startDate, endDate, [op]);
    rIdx += 1;
    const opBetMTitle = wsOpTest.getRow(rIdx++);
    opBetMTitle.height = 20;
    opBetMTitle.getCell(2).value = `Matrice Journalière des Tests — ${op.displayName}`;
    opBetMTitle.getCell(2).font = { name: "Cambria", size: 12, bold: true, color: { argb: "FF000000" } };

    const opBetMHead = wsOpTest.getRow(rIdx++);
    opBetMHead.height = 24;
    opBetMHead.getCell(2).value = "DATE";
    opBetMHead.getCell(3).value = op.label;
    styleHeaderCell(opBetMHead.getCell(2), "FFBFBFBF", 12);
    styleHeaderCell(opBetMHead.getCell(3), op.fill, 12);

    const opBetMFirst = rIdx;
    let opBetMSum = 0;
    opBetMatrix.forEach((m) => {
      const mr = wsOpTest.getRow(rIdx++);
      mr.height = 20;
      const cnt = m.counts[op.key] || 0;
      opBetMSum += cnt;
      mr.getCell(2).value = m.label;
      mr.getCell(3).value = cnt > 0 ? cnt : 0;
      styleDataCell(mr.getCell(2), "center", true, 12);
      styleDataCell(mr.getCell(3), "center", false, 12);
    });
    const opBetMLast = rIdx - 1;
    const opBetMTotal = wsOpTest.getRow(rIdx++);
    opBetMTotal.height = 22;
    opBetMTotal.getCell(2).value = "TOTAL";
    styleHeaderCell(opBetMTotal.getCell(2), "FFBFBFBF", 12);
    opBetMTotal.getCell(3).value =
      opBetMLast >= opBetMFirst
        ? { formula: `SUM(C${opBetMFirst}:C${opBetMLast})`, result: opBetMSum }
        : opBetMSum;
    styleHeaderCell(opBetMTotal.getCell(3), "FFF2F2F2", 12);

    if (opBetMLast >= opBetMFirst) {
      const safeName = wsOpTest.name.replace(/'/g, "''");
      charts.push({
        sheetId: wsOpTest.id,
        title: `Tests journaliers — ${op.displayName}`,
        kind: "bar",
        row: rIdx + 1,
        column: 1,
        width: 7,
        height: 16,
        unit: "Tests",
        categories: {
          formula: `'${safeName}'!$B$${opBetMFirst}:$B$${opBetMLast}`,
          values: opBetMatrix.map((m) => m.label),
        },
        series: [
          {
            name: op.displayName,
            formula: `'${safeName}'!$C$${opBetMFirst}:$C$${opBetMLast}`,
            values: opBetMatrix.map((m) => m.counts[op.key] || 0),
            color: op.chartColor.replace(/^#/, ""),
          },
        ],
      });
    }

    // 4b. Onglet Dépôt-Retrait <Opérateur>
    const opTxs = txGroupMap.get(op.key)?.items || [];
    const wsOpTx = wb.addWorksheet(
      uniqueSafeSheetName(wb, `Dépôt-Retrait ${op.displayName}`),
    );
    applyPrintablePageSetup(wsOpTx);
    wsOpTx.mergeCells("A1:K1");
    const opTxTitle = wsOpTx.getCell("A1");
    opTxTitle.value = `RAPPORT DE LA PÉRIODE ${titlePeriod} — OPÉRATEUR : ${op.label} (DÉPÔTS & RETRAITS)`;
    opTxTitle.font = { name: "Cambria", size: 13, bold: true, color: { argb: "FF000000" } };
    opTxTitle.alignment = { vertical: "middle", horizontal: "center" };
    wsOpTx.getRow(1).height = 24;

    txWidths.forEach((w, idx) => {
      wsOpTx.getColumn(idx + 1).width = w;
    });
    const opTxHeader = wsOpTx.getRow(2);
    opTxHeader.height = 36;
    opTxHeader.values = txHeaders;
    txHeaders.forEach((_, i) => styleHeaderCell(opTxHeader.getCell(i + 1), op.fill, 12));

    let txRIdx = 3;
    const txStartRow = txRIdx;
    let opDepotTotal = 0;
    let opRetraitTotal = 0;
    opTxs.forEach((t, idx) => {
      const row = wsOpTx.getRow(txRIdx++);
      row.height = 19;
      const amt = Number(t.amount_fcfa) || 0;
      const tNorm = String(t.type || "").toLowerCase();
      if (tNorm.includes("retrait")) opRetraitTotal += amt;
      else opDepotTotal += amt;
      const ref = readRecordReference(t).reference || t.notes || "";
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = t.date ? new Date(`${t.date}T00:00:00`).toLocaleDateString("fr-FR") : "";
      row.getCell(3).value = op.displayName || t.operator || "";
      row.getCell(4).value = t.platform || t.support || "";
      row.getCell(5).value = t.payment_operator || "";
      row.getCell(6).value = tNorm.includes("retrait") ? "Retrait" : "Dépôt";
      row.getCell(7).value = amt;
      row.getCell(7).numFmt = "#,##0";
      row.getCell(8).value = formatExcelHour(t.time);
      row.getCell(9).value = t.phone ? String(t.phone) : "";
      row.getCell(10).value = ref ? String(ref) : "";
      row.getCell(11).value = resolveProofDisplay(t);
      [1, 2, 3, 4, 5, 6, 8, 9, 10, 11].forEach((c) => styleDataCell(row.getCell(c), "center", c === 3, 12));
      styleDataCell(row.getCell(7), "right", false, 12);
    });
    const txEndRow = txRIdx - 1;
    const dRow = wsOpTx.getRow(txRIdx++);
    dRow.height = 22;
    dRow.getCell(6).value = "TOTAL DEPOT";
    styleHeaderCell(dRow.getCell(6), "FFF2F2F2", 12);
    dRow.getCell(7).value =
      txEndRow >= txStartRow
        ? { formula: `SUMIF(F${txStartRow}:F${txEndRow},"Dépôt",G${txStartRow}:G${txEndRow})`, result: opDepotTotal }
        : 0;
    dRow.getCell(7).numFmt = "#,##0";
    styleHeaderCell(dRow.getCell(7), "FFF2F2F2", 12);
    dRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };

    const retRow = wsOpTx.getRow(txRIdx++);
    retRow.height = 22;
    retRow.getCell(6).value = "TOTAL RETRAIT";
    styleHeaderCell(retRow.getCell(6), "FFF2F2F2", 12);
    retRow.getCell(7).value =
      txEndRow >= txStartRow
        ? { formula: `SUMIF(F${txStartRow}:F${txEndRow},"Retrait",G${txStartRow}:G${txEndRow})`, result: opRetraitTotal }
        : 0;
    retRow.getCell(7).numFmt = "#,##0";
    styleHeaderCell(retRow.getCell(7), "FFF2F2F2", 12);
    retRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };

    // Matrice récapitulative + graphique natif en bas de l'onglet Dépôt-Retrait <Opérateur>
    const opTxMatrix = buildDailyTxMatrix(opTxs, startDate, endDate, [op]);
    txRIdx += 1;
    const opTxMTitle = wsOpTx.getRow(txRIdx++);
    opTxMTitle.height = 20;
    opTxMTitle.getCell(2).value = `Matrice Récapitulative Dépôts & Retraits — ${op.displayName} (F CFA)`;
    opTxMTitle.getCell(2).font = { name: "Cambria", size: 12, bold: true, color: { argb: "FF000000" } };

    const opTxMHead = wsOpTx.getRow(txRIdx++);
    opTxMHead.height = 24;
    opTxMHead.getCell(2).value = "DATE";
    opTxMHead.getCell(3).value = "DEPOTS";
    opTxMHead.getCell(4).value = "RETRAITS";
    styleHeaderCell(opTxMHead.getCell(2), "FFBFBFBF", 12);
    styleHeaderCell(opTxMHead.getCell(3), op.fill, 12);
    styleHeaderCell(opTxMHead.getCell(4), op.fill, 12);

    const opTxMFirst = txRIdx;
    let opTxMDepotSum = 0;
    let opTxMRetraitSum = 0;
    opTxMatrix.forEach((m) => {
      const mr = wsOpTx.getRow(txRIdx++);
      mr.height = 20;
      const dVal = m.depots[op.key] || 0;
      const rVal = m.retraits[op.key] || 0;
      opTxMDepotSum += dVal;
      opTxMRetraitSum += rVal;
      mr.getCell(2).value = m.label;
      styleDataCell(mr.getCell(2), "center", true, 12);
      mr.getCell(3).value = dVal > 0 ? dVal : 0;
      mr.getCell(3).numFmt = "#,##0";
      styleDataCell(mr.getCell(3), "right", false, 12);
      mr.getCell(4).value = rVal > 0 ? rVal : 0;
      mr.getCell(4).numFmt = "#,##0";
      styleDataCell(mr.getCell(4), "right", false, 12);
    });
    const opTxMLast = txRIdx - 1;
    const opTxMTotal = wsOpTx.getRow(txRIdx++);
    opTxMTotal.height = 22;
    opTxMTotal.getCell(2).value = "TOTAL";
    styleHeaderCell(opTxMTotal.getCell(2), "FFBFBFBF", 12);
    opTxMTotal.getCell(3).value =
      opTxMLast >= opTxMFirst
        ? { formula: `SUM(C${opTxMFirst}:C${opTxMLast})`, result: opTxMDepotSum }
        : opTxMDepotSum;
    opTxMTotal.getCell(3).numFmt = "#,##0";
    styleHeaderCell(opTxMTotal.getCell(3), "FFF2F2F2", 12);
    opTxMTotal.getCell(3).alignment = { vertical: "middle", horizontal: "right" };
    opTxMTotal.getCell(4).value =
      opTxMLast >= opTxMFirst
        ? { formula: `SUM(D${opTxMFirst}:D${opTxMLast})`, result: opTxMRetraitSum }
        : opTxMRetraitSum;
    opTxMTotal.getCell(4).numFmt = "#,##0";
    styleHeaderCell(opTxMTotal.getCell(4), "FFF2F2F2", 12);
    opTxMTotal.getCell(4).alignment = { vertical: "middle", horizontal: "right" };

    if (opTxMLast >= opTxMFirst) {
      const safeName = wsOpTx.name.replace(/'/g, "''");
      charts.push({
        sheetId: wsOpTx.id,
        title: `Dépôts & Retraits — ${op.displayName} (F CFA)`,
        kind: "bar",
        row: txRIdx + 1,
        column: 1,
        width: 8,
        height: 16,
        unit: "FCFA",
        categories: {
          formula: `'${safeName}'!$B$${opTxMFirst}:$B$${opTxMLast}`,
          values: opTxMatrix.map((m) => m.label),
        },
        series: [
          {
            name: "Dépôts",
            formula: `'${safeName}'!$C$${opTxMFirst}:$C$${opTxMLast}`,
            values: opTxMatrix.map((m) => m.depots[op.key] || 0),
            color: op.chartColor.replace(/^#/, ""),
          },
          {
            name: "Retraits",
            formula: `'${safeName}'!$D$${opTxMFirst}:$D$${opTxMLast}`,
            values: opTxMatrix.map((m) => m.retraits[op.key] || 0),
            color: "E52329",
          },
        ],
      });
    }
  });

  return { wb, charts };
}

export async function buildWeeklyOfficialWorkbook(
  params: ExportWeeklyReportParams,
): Promise<ExcelJS.Workbook> {
  const { wb } = await buildWeeklyOfficialWorkbookInternal(params);
  return wb;
}

export async function buildWeeklyOfficialWorkbookBytes(
  params: ExportWeeklyReportParams,
): Promise<Uint8Array> {
  const { wb, charts } = await buildWeeklyOfficialWorkbookInternal(params);
  const rawBuffer = await wb.xlsx.writeBuffer();
  if (charts.length === 0) {
    return new Uint8Array(rawBuffer as ArrayBuffer);
  }
  return addNativeCharts(new Uint8Array(rawBuffer as ArrayBuffer), charts);
}

export async function exportWeeklyOfficialReport(
  params: ExportWeeklyReportParams,
) {
  const bytes = await buildWeeklyOfficialWorkbookBytes(params);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildReportFilename(
    "officiel",
    params.startDate,
    params.endDate,
    "xlsx",
  );
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
