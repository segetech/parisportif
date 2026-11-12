import ExcelJS from "exceljs";
import { readRecordReference } from "@/lib/record-reference";

export const OFFICIAL_OPERATORS = [
  { key: "1XBET", label: "1XBET", fill: "FF00B0F0", chartColor: "#00B0F0" },
  { key: "BET223", label: "BET223", fill: "FFED7D31", chartColor: "#ED7D31" },
  { key: "PREMIERBET", label: "PREMIERBET", fill: "FF70AD47", chartColor: "#70AD47" },
  { key: "MALIBET", label: "MALIBET", fill: "FFF4B084", chartColor: "#F4B084" },
  { key: "MEGAPARI", label: "MEGAPARI", fill: "FFFFFF00", chartColor: "#EAB308" },
  { key: "888STARZ", label: "888STARZ", fill: "FFB4C6E7", chartColor: "#B4C6E7" },
] as const;

export type OfficialOperatorKey = (typeof OFFICIAL_OPERATORS)[number]["key"];

export function normalizeOfficialOperator(raw?: string | null): OfficialOperatorKey | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (upper.includes("1XBET") || upper.includes("1X")) return "1XBET";
  if (upper.includes("BET223")) return "BET223";
  if (upper.includes("PREMIER")) return "PREMIERBET";
  if (upper.includes("MALIBET")) return "MALIBET";
  if (upper.includes("MEGAPARI")) return "MEGAPARI";
  if (upper.includes("888STARZ") || upper.includes("888")) return "888STARZ";
  return null;
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
  counts: Record<OfficialOperatorKey, number>;
  total: number;
}

export interface DailyTxMatrixRow {
  isoDate: string;
  label: string;
  depots: Record<OfficialOperatorKey, number>;
  retraits: Record<OfficialOperatorKey, number>;
  totalDepots: number;
  totalRetraits: number;
}

export function buildDailyBetMatrix(
  bets: any[],
  startDate: string,
  endDate: string,
): DailyBetMatrixRow[] {
  const dates = getDatesInRange(startDate, endDate);
  const byDate = new Map<string, Record<OfficialOperatorKey, number>>();

  for (const d of dates) {
    byDate.set(d, {
      "1XBET": 0,
      BET223: 0,
      PREMIERBET: 0,
      MALIBET: 0,
      MEGAPARI: 0,
      "888STARZ": 0,
    });
  }

  for (const b of bets) {
    const op = normalizeOfficialOperator(b.operator);
    if (!op) continue;
    const row = byDate.get(b.date);
    if (row) {
      row[op] += 1;
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
): DailyTxMatrixRow[] {
  const dates = getDatesInRange(startDate, endDate);
  const byDate = new Map<
    string,
    {
      depots: Record<OfficialOperatorKey, number>;
      retraits: Record<OfficialOperatorKey, number>;
    }
  >();

  const emptyRecord = (): Record<OfficialOperatorKey, number> => ({
    "1XBET": 0,
    BET223: 0,
    PREMIERBET: 0,
    MALIBET: 0,
    MEGAPARI: 0,
    "888STARZ": 0,
  });

  for (const d of dates) {
    byDate.set(d, { depots: emptyRecord(), retraits: emptyRecord() });
  }

  for (const tx of transactions) {
    const op = normalizeOfficialOperator(tx.operator);
    if (!op) continue;
    const bucket = byDate.get(tx.date);
    if (!bucket) continue;
    const amt = Number(tx.amount_fcfa) || 0;
    const isRetrait = String(tx.type || "").toLowerCase().includes("retrait");
    if (isRetrait) {
      bucket.retraits[op] += amt;
    } else {
      bucket.depots[op] += amt;
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
  bets: any[];
  transactions: any[];
  illegals: any[];
  chartImageBase64?: string | null;
}

export async function exportWeeklyOfficialReport({
  startDate,
  endDate,
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

  const periodLabel = `DU ${formatShortFrDate(startDate).toUpperCase()} AU ${formatShortFrDate(endDate).toUpperCase()}`;

  // ============================================================================
  // 1. FEUILLE PARI
  // ============================================================================
  const wsPari = wb.addWorksheet("PARI");
  wsPari.mergeCells("A1:I1");
  const pariTitle = wsPari.getCell("A1");
  pariTitle.value = `RAPPORTS TESTS DE JEUX — SEMAINE ${periodLabel}`;
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
  pariHeaders.forEach((h, i) => styleHeaderCell(pariHeaderRow.getCell(i + 1)));
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

    const opKey = normalizeOfficialOperator(b.operator);
    const opMeta = OFFICIAL_OPERATORS.find((o) => o.key === opKey);
    if (opMeta) {
      row.getCell(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: opMeta.fill },
      };
    }
  });

  const pariTotalRow = wsPari.getRow(pariRowIdx++);
  pariTotalRow.height = 22;
  wsPari.mergeCells(`A${pariTotalRow.number}:E${pariTotalRow.number}`);
  pariTotalRow.getCell(1).value = "TOTAL";
  styleHeaderCell(pariTotalRow.getCell(1));
  for (let c = 2; c <= 5; c++) styleHeaderCell(pariTotalRow.getCell(c));
  pariTotalRow.getCell(6).value = totalBetAmount;
  pariTotalRow.getCell(6).numFmt = "#,##0";
  styleHeaderCell(pariTotalRow.getCell(6));
  pariTotalRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
  for (let c = 7; c <= 9; c++) styleHeaderCell(pariTotalRow.getCell(c));

  // Matrice récapitulative PARI (tests par jour & opérateur)
  const matrixStartRow = pariRowIdx + 2;
  const matrixHeaderRow = wsPari.getRow(matrixStartRow);
  matrixHeaderRow.height = 26;
  matrixHeaderRow.getCell(1).value = "DATE";
  styleHeaderCell(matrixHeaderRow.getCell(1), "FFBFBFBF");

  OFFICIAL_OPERATORS.forEach((op, idx) => {
    const cell = matrixHeaderRow.getCell(idx + 2);
    cell.value = op.label;
    styleHeaderCell(cell, op.fill);
  });
  const totalMatrixHead = matrixHeaderRow.getCell(OFFICIAL_OPERATORS.length + 2);
  totalMatrixHead.value = "TOTAL";
  styleHeaderCell(totalMatrixHead, "FFBFBFBF");

  const betMatrix = buildDailyBetMatrix(filteredBets, startDate, endDate);
  let mRowIdx = matrixStartRow + 1;
  const opTotals: Record<OfficialOperatorKey, number> = {
    "1XBET": 0,
    BET223: 0,
    PREMIERBET: 0,
    MALIBET: 0,
    MEGAPARI: 0,
    "888STARZ": 0,
  };

  betMatrix.forEach((m) => {
    const r = wsPari.getRow(mRowIdx++);
    r.height = 20;
    r.getCell(1).value = m.label;
    styleDataCell(r.getCell(1), "center", true);

    OFFICIAL_OPERATORS.forEach((op, idx) => {
      const val = m.counts[op.key];
      opTotals[op.key] += val;
      const cell = r.getCell(idx + 2);
      cell.value = val > 0 ? val : "";
      styleDataCell(cell, "center");
    });

    const totCell = r.getCell(OFFICIAL_OPERATORS.length + 2);
    totCell.value = m.total > 0 ? m.total : 0;
    styleDataCell(totCell, "center", true);
  });

  const matrixTotalRow = wsPari.getRow(mRowIdx++);
  matrixTotalRow.height = 22;
  matrixTotalRow.getCell(1).value = "TOTAL";
  styleHeaderCell(matrixTotalRow.getCell(1), "FFBFBFBF");
  let grandBetTotal = 0;
  OFFICIAL_OPERATORS.forEach((op, idx) => {
    const v = opTotals[op.key];
    grandBetTotal += v;
    const c = matrixTotalRow.getCell(idx + 2);
    c.value = v;
    styleHeaderCell(c, "FFF2F2F2");
  });
  const grandCell = matrixTotalRow.getCell(OFFICIAL_OPERATORS.length + 2);
  grandCell.value = grandBetTotal;
  styleHeaderCell(grandCell, "FFBFBFBF");

  if (chartImageBase64) {
    const cleanBase64 = chartImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageId = wb.addImage({
      base64: cleanBase64,
      extension: "png",
    });
    wsPari.addImage(imageId, {
      tl: { col: 0.2, row: mRowIdx + 1 },
      ext: { width: 760, height: 360 },
    });
  }

  // ============================================================================
  // 2. FEUILLE DEPOT-RETRAIT
  // ============================================================================
  const wsTx = wb.addWorksheet("DEPOT-RETRAIT");
  wsTx.mergeCells("A1:K1");
  const txTitle = wsTx.getCell("A1");
  txTitle.value = `POINT DES DÉPÔTS ET RETRAITS — SEMAINE ${periodLabel}`;
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
  let totalTxAmount = 0;
  filteredTx.forEach((tx, idx) => {
    const row = wsTx.getRow(txRowIdx++);
    row.height = 20;
    const amt = Number(tx.amount_fcfa) || 0;
    totalTxAmount += amt;
    const ref = readRecordReference(tx).reference || tx.notes || "";
    const proofLabel = tx.proof_attachment_url
      ? "Oui"
      : tx.proof_status === "disponible"
        ? "Oui"
        : tx.proof_status === "non_disponible"
          ? "Non"
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

    const opKey = normalizeOfficialOperator(tx.operator);
    const opMeta = OFFICIAL_OPERATORS.find((o) => o.key === opKey);
    if (opMeta) {
      row.getCell(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: opMeta.fill },
      };
    }
  });

  const txTotalRow = wsTx.getRow(txRowIdx++);
  txTotalRow.height = 22;
  wsTx.mergeCells(`A${txTotalRow.number}:F${txTotalRow.number}`);
  txTotalRow.getCell(1).value = "TOTAL";
  for (let c = 1; c <= 6; c++) styleHeaderCell(txTotalRow.getCell(c));
  txTotalRow.getCell(7).value = totalTxAmount;
  txTotalRow.getCell(7).numFmt = "#,##0";
  styleHeaderCell(txTotalRow.getCell(7));
  txTotalRow.getCell(7).alignment = { vertical: "middle", horizontal: "right" };
  for (let c = 8; c <= 11; c++) styleHeaderCell(txTotalRow.getCell(c));

  // Matrice récapitulative DEPOT-RETRAIT (rows 294-303 style)
  const txMatrixStart = txRowIdx + 2;
  const opHeaderRow = wsTx.getRow(txMatrixStart);
  const subHeaderRow = wsTx.getRow(txMatrixStart + 1);
  opHeaderRow.height = 24;
  subHeaderRow.height = 22;

  wsTx.mergeCells(`A${txMatrixStart}:A${txMatrixStart + 1}`);
  opHeaderRow.getCell(1).value = "DATE";
  styleHeaderCell(opHeaderRow.getCell(1), "FFBFBFBF");
  styleHeaderCell(subHeaderRow.getCell(1), "FFBFBFBF");

  OFFICIAL_OPERATORS.forEach((op, idx) => {
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

  const txMatrix = buildDailyTxMatrix(filteredTx, startDate, endDate);
  let txMRow = txMatrixStart + 2;
  const depotTotals: Record<OfficialOperatorKey, number> = {
    "1XBET": 0, BET223: 0, PREMIERBET: 0, MALIBET: 0, MEGAPARI: 0, "888STARZ": 0,
  };
  const retraitTotals: Record<OfficialOperatorKey, number> = {
    "1XBET": 0, BET223: 0, PREMIERBET: 0, MALIBET: 0, MEGAPARI: 0, "888STARZ": 0,
  };

  txMatrix.forEach((m) => {
    const r = wsTx.getRow(txMRow++);
    r.height = 20;
    r.getCell(1).value = m.label;
    styleDataCell(r.getCell(1), "center", true);

    OFFICIAL_OPERATORS.forEach((op, idx) => {
      const colStart = 2 + idx * 2;
      const dVal = m.depots[op.key];
      const rVal = m.retraits[op.key];
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
  OFFICIAL_OPERATORS.forEach((op, idx) => {
    const colStart = 2 + idx * 2;
    const dCell = txMTotalRow.getCell(colStart);
    dCell.value = depotTotals[op.key];
    dCell.numFmt = "#,##0";
    styleHeaderCell(dCell, "FFF2F2F2");
    dCell.alignment = { vertical: "middle", horizontal: "right" };

    const rCell = txMTotalRow.getCell(colStart + 1);
    rCell.value = retraitTotals[op.key];
    rCell.numFmt = "#,##0";
    styleHeaderCell(rCell, "FFF2F2F2");
    rCell.alignment = { vertical: "middle", horizontal: "right" };
  });

  // ============================================================================
  // 3. FEUILLE ILLEGAL
  // ============================================================================
  const wsIll = wb.addWorksheet("ILLEGAL");
  wsIll.mergeCells("A1:J1");
  const illTitle = wsIll.getCell("A1");
  illTitle.value = `ACTIVITÉS ILLÉGALES — SEMAINE ${periodLabel}`;
  illTitle.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF000000" } };
  illTitle.alignment = { vertical: "middle", horizontal: "center" };
  wsIll.getRow(1).height = 28;

  const illHeaders = [
    "N°",
    "DATE",
    "Catégorie",
    "Opérateur / Site",
    "Support",
    "Type",
    "Montant F CFA",
    "Heure",
    "Numéro de téléphone",
    "Référence",
  ];
  const illWidths = [7, 13, 14, 22, 16, 16, 17, 10, 18, 28];
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

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = new Date(`${item.date}T00:00:00`).toLocaleDateString("fr-FR");
    row.getCell(3).value = item.category || (item.bet_type ? "Pari" : "Transaction");
    row.getCell(4).value = item.operator || "";
    row.getCell(5).value = item.support || "";
    row.getCell(6).value = item.bet_type || item.type || "";
    row.getCell(7).value = amt;
    row.getCell(7).numFmt = "#,##0";
    row.getCell(8).value = item.time || "";
    row.getCell(9).value = item.phone || "";
    row.getCell(10).value = ref;

    [1, 2, 3, 5, 6, 8, 9].forEach((c) => styleDataCell(row.getCell(c), "center"));
    styleDataCell(row.getCell(4), "left", true);
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
  for (let c = 8; c <= 10; c++) styleHeaderCell(illTotalRow.getCell(c));

  // Download file
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `RAPPORTS_SEMAINE_${startDate}_AU_${endDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
