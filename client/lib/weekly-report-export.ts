import ExcelJS from "exceljs";
import { readRecordReference } from "@/lib/record-reference";
import { buildReportFilename } from "@/lib/report-periods";

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

export async function buildWeeklyOfficialWorkbook({
  startDate,
  endDate,
  activeOperatorNames,
  bets,
  transactions,
  illegals,
  chartImageBase64,
}: ExportWeeklyReportParams): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
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
  // 1. FEUILLE PARI (classée par blocs d'opérateurs)
  // ============================================================================
  const wsPari = wb.addWorksheet("PARI");
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
    "Type de Pari",
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
    const introRow = wsPari.getRow(pariRowIdx++);
    introRow.height = 20;
    introRow.getCell(1).value = `Récapitulatif clair et structuré des tests effectués sur les différentes plateformes de jeux durant la semaine ${sentencePeriod} :`;
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
  }

  if (chartImageBase64) {
    const cleanBase64 = chartImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageId = wb.addImage({
      base64: cleanBase64,
      extension: "png",
    });
    wsPari.addImage(imageId, {
      tl: { col: 1, row: pariRowIdx + 1 },
      ext: { width: 760, height: 360 },
    });
  }

  // ============================================================================
  // 2. FEUILLE DEPOT-RETRAIT (classée par blocs d'opérateurs)
  // ============================================================================
  const wsTx = wb.addWorksheet("DEPOT-RETRAIT");
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
    const introRow = wsTx.getRow(txRowIdx++);
    introRow.height = 20;
    introRow.getCell(1).value = `Récapitulatif clair et structuré des dépôts et retraits effectués sur les différentes plateformes de jeux durant la semaine ${sentencePeriod} :`;
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

  return wb;
}

export async function exportWeeklyOfficialReport(
  params: ExportWeeklyReportParams,
) {
  const wb = await buildWeeklyOfficialWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
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
