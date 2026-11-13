import ExcelJS from "exceljs";
import { readRecordReference } from "@/lib/record-reference";
import { buildReportFilename } from "@/lib/report-periods";

export interface ReportOperatorMeta {
  key: string; // Uppercase normalized key
  label: string; // Display label (e.g. "1xBet" or "1XBET")
  fill: string; // Excel ARGB e.g. "FF00B0F0"
  chartColor: string; // Hex for Recharts e.g. "#00B0F0"
}

const KNOWN_OPERATOR_COLORS: Record<string, { fill: string; chartColor: string }> = {
  "1XBET": { fill: "FF00B0F0", chartColor: "#00B0F0" },
  BET223: { fill: "FFED7D31", chartColor: "#ED7D31" },
  PREMIERBET: { fill: "FF70AD47", chartColor: "#70AD47" },
  MALIBET: { fill: "FFF4B084", chartColor: "#F4B084" },
  MEGAPARI: { fill: "FFFFFF00", chartColor: "#EAB308" },
  "888STARZ": { fill: "FFB4C6E7", chartColor: "#B4C6E7" },
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
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Construit dynamiquement la liste des opérateurs du rapport à partir des
 * opérateurs actifs en base de données (+ ceux présents dans les données de la période).
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

  let fallbackIdx = 0;
  const result: ReportOperatorMeta[] = [];

  for (const [key, label] of seen.entries()) {
    const known = KNOWN_OPERATOR_COLORS[key];
    if (known) {
      result.push({
        key,
        label: label.toUpperCase(),
        fill: known.fill,
        chartColor: known.chartColor,
      });
    } else {
      const palette = FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length];
      fallbackIdx++;
      result.push({
        key,
        label: label.toUpperCase(),
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
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
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

export function formatShortFrDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const months = [
    "janv", "févr", "mars", "avr", "mai", "juin",
    "juil", "août", "sept", "oct", "nov", "déc",
  ];
  return `${d.getDate()}-${months[d.getMonth()]}`;
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

function styleHeaderCell(cell: ExcelJS.Cell, fillArgb = "FFBFBFBF") {
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = THIN_BORDER;
}

function styleDataCell(
  cell: ExcelJS.Cell,
  horizontal: "left" | "center" | "right" = "center",
  bold = false,
) {
  cell.font = { name: "Calibri", size: 11, bold, color: { argb: "FF000000" } };
  cell.alignment = { vertical: "middle", horizontal };
  cell.border = THIN_BORDER;
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

export async function exportWeeklyOfficialReport({
  startDate,
  endDate,
  activeOperatorNames,
  bets,
  transactions,
  illegals,
  chartImageBase64,
}: ExportWeeklyReportParams) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Test - Plateforme de Contrôle";
  wb.created = new Date();

  const filteredBets = bets.filter(
    (b) => (!startDate || b.date >= startDate) && (!endDate || b.date <= endDate),
  );
  const filteredTx = transactions.filter(
    (t) => (!startDate || t.date >= startDate) && (!endDate || t.date <= endDate),
  );
  const filteredIllegals = illegals.filter(
    (i) => (!startDate || i.date >= startDate) && (!endDate || i.date <= endDate),
  );

  const reportOperators = resolveReportOperators(
    activeOperatorNames,
    filteredBets,
    filteredTx,
  );
  const operatorColorMap = new Map(reportOperators.map((o) => [o.key, o.fill]));

  const periodLabel = `DU ${formatShortFrDate(startDate).toUpperCase()} AU ${formatShortFrDate(endDate).toUpperCase()}`;

  // ============================================================================
  // 1. FEUILLE PARI
  // ============================================================================
  const wsPari = wb.addWorksheet("PARI");
  wsPari.mergeCells("A1:I1");
  const pariTitle = wsPari.getCell("A1");
  pariTitle.value = `RAPPORT DE LA SEMAINE ${periodLabel}`;
  pariTitle.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF000000" } };
  pariTitle.alignment = { vertical: "middle", horizontal: "center" };
  wsPari.getRow(1).height = 28;

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
  const pariWidths = [7, 13, 20, 16, 18, 16, 10, 18, 28];
  pariWidths.forEach((w, idx) => {
    wsPari.getColumn(idx + 1).width = w;
  });

  const pariHeaderRow = wsPari.getRow(2);
  pariHeaderRow.height = 26;
  pariHeaderRow.values = pariHeaders;
  pariHeaders.forEach((_, i) => styleHeaderCell(pariHeaderRow.getCell(i + 1)));

  let pariRowIdx = 3;
  let totalBetAmount = 0;
  filteredBets.forEach((b, idx) => {
    const row = wsPari.getRow(pariRowIdx++);
    row.height = 20;
    const amt = Number(b.amount_fcfa) || 0;
    totalBetAmount += amt;
    const ref = readRecordReference(b).reference || b.notes || "";

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = new Date(`${b.date}T00:00:00`).toLocaleDateString("fr-FR");
    row.getCell(3).value = b.operator || "";
    row.getCell(4).value = b.support || "";
    row.getCell(5).value = b.bet_type || "";
    row.getCell(6).value = amt;
    row.getCell(6).numFmt = "#,##0";
    row.getCell(7).value = b.time || "";
    row.getCell(8).value = b.phone || "";
    row.getCell(9).value = ref;

    [1, 2, 4, 5, 7, 8].forEach((c) => styleDataCell(row.getCell(c), "center"));
    styleDataCell(row.getCell(3), "left", true);
    styleDataCell(row.getCell(6), "right");
    styleDataCell(row.getCell(9), "left");

    const opFill = operatorColorMap.get(normalizeOperatorKey(b.operator));
    if (opFill) {
      row.getCell(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: opFill },
      };
    }
  });

  const pariTotalRow = wsPari.getRow(pariRowIdx++);
  pariTotalRow.height = 22;
  wsPari.mergeCells(`A${pariTotalRow.number}:E${pariTotalRow.number}`);
  pariTotalRow.getCell(1).value = "TOTAL";
  for (let c = 1; c <= 5; c++) styleHeaderCell(pariTotalRow.getCell(c));
  pariTotalRow.getCell(6).value = totalBetAmount;
  pariTotalRow.getCell(6).numFmt = "#,##0";
  styleHeaderCell(pariTotalRow.getCell(6));
  pariTotalRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
  for (let c = 7; c <= 9; c++) styleHeaderCell(pariTotalRow.getCell(c));

  // Matrice récapitulative PARI dynamique (opérateurs actifs)
  if (reportOperators.length > 0) {
    const matrixStartRow = pariRowIdx + 2;
    const matrixHeaderRow = wsPari.getRow(matrixStartRow);
    matrixHeaderRow.height = 26;
    matrixHeaderRow.getCell(1).value = "DATE";
    styleHeaderCell(matrixHeaderRow.getCell(1), "FFBFBFBF");

    reportOperators.forEach((op, idx) => {
      const cell = matrixHeaderRow.getCell(idx + 2);
      cell.value = op.label;
      styleHeaderCell(cell, op.fill);
      if ((wsPari.getColumn(idx + 2).width || 0) < 14) {
        wsPari.getColumn(idx + 2).width = 14;
      }
    });
    const totalMatrixHead = matrixHeaderRow.getCell(reportOperators.length + 2);
    totalMatrixHead.value = "TOTAL";
    styleHeaderCell(totalMatrixHead, "FFBFBFBF");

    const betMatrix = buildDailyBetMatrix(
      filteredBets,
      startDate,
      endDate,
      reportOperators,
    );
    let mRowIdx = matrixStartRow + 1;
    const opTotals: Record<string, number> = {};
    for (const op of reportOperators) opTotals[op.key] = 0;

    betMatrix.forEach((m) => {
      const r = wsPari.getRow(mRowIdx++);
      r.height = 20;
      r.getCell(1).value = m.label;
      styleDataCell(r.getCell(1), "center", true);

      reportOperators.forEach((op, idx) => {
        const val = m.counts[op.key] || 0;
        opTotals[op.key] += val;
        const cell = r.getCell(idx + 2);
        cell.value = val > 0 ? val : "";
        styleDataCell(cell, "center");
      });

      const totCell = r.getCell(reportOperators.length + 2);
      totCell.value = m.total > 0 ? m.total : 0;
      styleDataCell(totCell, "center", true);
    });

    const matrixTotalRow = wsPari.getRow(mRowIdx++);
    matrixTotalRow.height = 22;
    matrixTotalRow.getCell(1).value = "TOTAL";
    styleHeaderCell(matrixTotalRow.getCell(1), "FFBFBFBF");
    let grandBetTotal = 0;
    reportOperators.forEach((op, idx) => {
      const v = opTotals[op.key] || 0;
      grandBetTotal += v;
      const c = matrixTotalRow.getCell(idx + 2);
      c.value = v;
      styleHeaderCell(c, "FFF2F2F2");
    });
    const grandCell = matrixTotalRow.getCell(reportOperators.length + 2);
    grandCell.value = grandBetTotal;
    styleHeaderCell(grandCell, "FFBFBFBF");

    pariRowIdx = mRowIdx;
  }

  if (chartImageBase64) {
    const cleanBase64 = chartImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageId = wb.addImage({
      base64: cleanBase64,
      extension: "png",
    });
    wsPari.addImage(imageId, {
      tl: { col: 0.2, row: pariRowIdx + 1 },
      ext: { width: 760, height: 360 },
    });
  }

  // ============================================================================
  // 2. FEUILLE DEPOT-RETRAIT
  // ============================================================================
  const wsTx = wb.addWorksheet("DEPOT-RETRAIT");
  wsTx.mergeCells("A1:K1");
  const txTitle = wsTx.getCell("A1");
  txTitle.value = `RAPPORT DE LA SEMAINE ${periodLabel}`;
  txTitle.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF000000" } };
  txTitle.alignment = { vertical: "middle", horizontal: "center" };
  wsTx.getRow(1).height = 28;

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
  const txWidths = [7, 13, 18, 15, 20, 13, 17, 10, 18, 28, 12];
  txWidths.forEach((w, idx) => {
    wsTx.getColumn(idx + 1).width = w;
  });

  const txHeaderRow = wsTx.getRow(2);
  txHeaderRow.height = 28;
  txHeaderRow.values = txHeaders;
  txHeaders.forEach((_, i) => styleHeaderCell(txHeaderRow.getCell(i + 1)));

  let txRowIdx = 3;
  let totalDepotAmount = 0;
  let totalRetraitAmount = 0;
  filteredTx.forEach((tx, idx) => {
    const row = wsTx.getRow(txRowIdx++);
    row.height = 20;
    const amt = Number(tx.amount_fcfa) || 0;
    if (String(tx.type || "").toLowerCase().includes("retrait")) {
      totalRetraitAmount += amt;
    } else {
      totalDepotAmount += amt;
    }
    const ref = readRecordReference(tx).reference || tx.notes || "";
    const proofLabel = tx.proof_attachment_url
      ? "Oui"
      : tx.proof_status === "disponible"
        ? "Dispo"
        : tx.proof_status === "non_disponible"
          ? "Non dispo"
          : "";

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = new Date(`${tx.date}T00:00:00`).toLocaleDateString("fr-FR");
    row.getCell(3).value = tx.operator || "";
    row.getCell(4).value = tx.platform || tx.support || "";
    row.getCell(5).value = tx.payment_operator || "";
    row.getCell(6).value = tx.type || "";
    row.getCell(7).value = amt;
    row.getCell(7).numFmt = "#,##0";
    row.getCell(8).value = tx.time || "";
    row.getCell(9).value = tx.phone || "";
    row.getCell(10).value = ref;
    row.getCell(11).value = proofLabel;

    [1, 2, 4, 5, 6, 8, 9, 11].forEach((c) => styleDataCell(row.getCell(c), "center"));
    styleDataCell(row.getCell(3), "left", true);
    styleDataCell(row.getCell(7), "right");
    styleDataCell(row.getCell(10), "left");

    const opFill = operatorColorMap.get(normalizeOperatorKey(tx.operator));
    if (opFill) {
      row.getCell(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: opFill },
      };
    }
  });

  const appendTxTotalRow = (label: string, amount: number) => {
    const totalRow = wsTx.getRow(txRowIdx++);
    totalRow.height = 22;
    wsTx.mergeCells(`A${totalRow.number}:F${totalRow.number}`);
    totalRow.getCell(1).value = label;
    for (let c = 1; c <= 6; c++) styleHeaderCell(totalRow.getCell(c));
    totalRow.getCell(7).value = amount;
    totalRow.getCell(7).numFmt = "#,##0";
    styleHeaderCell(totalRow.getCell(7));
    totalRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };
    for (let c = 8; c <= 11; c++) styleHeaderCell(totalRow.getCell(c));
  };

  appendTxTotalRow("TOTAL DEPOT", totalDepotAmount);
  appendTxTotalRow("TOTAL RETRAIT", totalRetraitAmount);

  // Matrice récapitulative DEPOT-RETRAIT dynamique (opérateurs actifs)
  if (reportOperators.length > 0) {
    const txMatrixStart = txRowIdx + 2;
    const opHeaderRow = wsTx.getRow(txMatrixStart);
    const subHeaderRow = wsTx.getRow(txMatrixStart + 1);
    opHeaderRow.height = 24;
    subHeaderRow.height = 22;

    wsTx.mergeCells(`A${txMatrixStart}:A${txMatrixStart + 1}`);
    opHeaderRow.getCell(1).value = "DATE";
    styleHeaderCell(opHeaderRow.getCell(1), "FFBFBFBF");
    styleHeaderCell(subHeaderRow.getCell(1), "FFBFBFBF");

    reportOperators.forEach((op, idx) => {
      const colStart = 2 + idx * 2;
      const colEnd = colStart + 1;
      wsTx.mergeCells(txMatrixStart, colStart, txMatrixStart, colEnd);
      opHeaderRow.getCell(colStart).value = op.label;
      styleHeaderCell(opHeaderRow.getCell(colStart), op.fill);
      styleHeaderCell(opHeaderRow.getCell(colEnd), op.fill);

      subHeaderRow.getCell(colStart).value = "DEPOTS";
      subHeaderRow.getCell(colEnd).value = "RETRAITS";
      styleHeaderCell(subHeaderRow.getCell(colStart), "FFF2F2F2");
      styleHeaderCell(subHeaderRow.getCell(colEnd), "FFF2F2F2");
    });

    const txMatrix = buildDailyTxMatrix(
      filteredTx,
      startDate,
      endDate,
      reportOperators,
    );
    let txMRow = txMatrixStart + 2;
    const depotTotals: Record<string, number> = {};
    const retraitTotals: Record<string, number> = {};
    for (const op of reportOperators) {
      depotTotals[op.key] = 0;
      retraitTotals[op.key] = 0;
    }

    txMatrix.forEach((m) => {
      const r = wsTx.getRow(txMRow++);
      r.height = 20;
      r.getCell(1).value = m.label;
      styleDataCell(r.getCell(1), "center", true);

      reportOperators.forEach((op, idx) => {
        const colStart = 2 + idx * 2;
        const dVal = m.depots[op.key] || 0;
        const rVal = m.retraits[op.key] || 0;
        depotTotals[op.key] += dVal;
        retraitTotals[op.key] += rVal;

        const dCell = r.getCell(colStart);
        dCell.value = dVal > 0 ? dVal : "";
        dCell.numFmt = "#,##0";
        styleDataCell(dCell, "right");

        const rCell = r.getCell(colStart + 1);
        rCell.value = rVal > 0 ? rVal : "";
        rCell.numFmt = "#,##0";
        styleDataCell(rCell, "right");
      });
    });

    const txMTotalRow = wsTx.getRow(txMRow++);
    txMTotalRow.height = 22;
    txMTotalRow.getCell(1).value = "TOTAL";
    styleHeaderCell(txMTotalRow.getCell(1), "FFBFBFBF");
    reportOperators.forEach((op, idx) => {
      const colStart = 2 + idx * 2;
      const dCell = txMTotalRow.getCell(colStart);
      dCell.value = depotTotals[op.key] || 0;
      dCell.numFmt = "#,##0";
      styleHeaderCell(dCell, "FFF2F2F2");
      dCell.alignment = { vertical: "middle", horizontal: "right" };

      const rCell = txMTotalRow.getCell(colStart + 1);
      rCell.value = retraitTotals[op.key] || 0;
      rCell.numFmt = "#,##0";
      styleHeaderCell(rCell, "FFF2F2F2");
      rCell.alignment = { vertical: "middle", horizontal: "right" };
    });
  }

  // ============================================================================
  // 3. FEUILLE ILLEGAL
  // ============================================================================
  const wsIll = wb.addWorksheet("ILLEGAL");
  wsIll.mergeCells("A1:K1");
  const illTitle = wsIll.getCell("A1");
  illTitle.value = `ACTIVITÉS ILLÉGALES — SEMAINE ${periodLabel}`;
  illTitle.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF000000" } };
  illTitle.alignment = { vertical: "middle", horizontal: "center" };
  wsIll.getRow(1).height = 28;

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
  const illWidths = [7, 13, 20, 15, 20, 14, 16, 10, 18, 28, 12];
  illWidths.forEach((w, idx) => {
    wsIll.getColumn(idx + 1).width = w;
  });

  const illHeaderRow = wsIll.getRow(2);
  illHeaderRow.height = 26;
  illHeaderRow.values = illHeaders;
  illHeaders.forEach((_, i) => styleHeaderCell(illHeaderRow.getCell(i + 1)));

  let illRowIdx = 3;
  let totalIllAmount = 0;
  filteredIllegals.forEach((item, idx) => {
    const row = wsIll.getRow(illRowIdx++);
    row.height = 20;
    const amt = Number(item.amount_fcfa) || 0;
    totalIllAmount += amt;
    const ref = readRecordReference(item).reference || item.notes || "";
    const proofLabel = item.proof_attachment_url
      ? "Oui"
      : item.proof_status === "disponible"
        ? "Dispo"
        : item.proof_status === "non_disponible"
          ? "Non dispo"
          : "";

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = new Date(`${item.date}T00:00:00`).toLocaleDateString("fr-FR");
    row.getCell(3).value = item.operator || "";
    row.getCell(4).value = item.platform || item.support || "";
    row.getCell(5).value = item.payment_operator || "";
    row.getCell(6).value = item.bet_type || item.type || "";
    row.getCell(7).value = amt;
    row.getCell(7).numFmt = "#,##0";
    row.getCell(8).value = item.time || "";
    row.getCell(9).value = item.phone || "";
    row.getCell(10).value = ref;
    row.getCell(11).value = proofLabel;

    [1, 2, 4, 5, 6, 8, 9, 11].forEach((c) => styleDataCell(row.getCell(c), "center"));
    styleDataCell(row.getCell(3), "left", true);
    styleDataCell(row.getCell(7), "right");
    styleDataCell(row.getCell(10), "left");
  });

  const illTotalRow = wsIll.getRow(illRowIdx++);
  illTotalRow.height = 22;
  wsIll.mergeCells(`A${illTotalRow.number}:F${illTotalRow.number}`);
  illTotalRow.getCell(1).value = "TOTAL";
  for (let c = 1; c <= 6; c++) styleHeaderCell(illTotalRow.getCell(c));
  illTotalRow.getCell(7).value = totalIllAmount;
  illTotalRow.getCell(7).numFmt = "#,##0";
  styleHeaderCell(illTotalRow.getCell(7));
  illTotalRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };
  for (let c = 8; c <= 11; c++) styleHeaderCell(illTotalRow.getCell(c));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildReportFilename("officiel", startDate, endDate, "xlsx");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
