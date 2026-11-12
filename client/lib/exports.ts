import { testCatalogLabel, testStatusLabel, testExportValue } from "./test-vocabulary";
import api, { Bet, Transaction, Venue } from "@/data/api";
import { exportStyledExcel, ExcelColumnDef } from "@/lib/excel-export";
import { exportStyledPDF, PDFColumnDef } from "@/lib/pdf-export";

export type ExportModule = "transactions" | "bets" | "venues";

export interface FetchParams {
  module: ExportModule;
  operator: string; // required strict
  fromISO: string; // YYYY-MM-DD
  toISO: string;   // YYYY-MM-DD (inclusive)
}

// Africa/Bamako is UTC+0. Dates are stored as YYYY-MM-DD so string compare is fine.
export async function fetchExportData(
  module: ExportModule,
  operator: string,
  fromISO: string,
  toISO: string,
): Promise<any[]> {
  if (!operator) throw new Error("Veuillez choisir un opérateur.");
  if (fromISO && toISO && fromISO > toISO) throw new Error("La date de début doit être avant la date de fin.");

  if (module === "transactions") {
    const items = await api.transactions.list({ start: fromISO, end: toISO, operator });
    return items.map((t) => ({
      date: t.date,
      time: t.time,
      operator: t.operator,
      platform: t.platform,
      payment_operator: t.payment_operator,
      type: t.type,
      amount_fcfa: t.amount_fcfa,
      phone: t.phone ?? "",
      reference: t.reference,
      proof: t.proof ? "Oui" : "Non",
      notes: t.notes ?? "",
    }));
  }

  if (module === "bets") {
    const createdByOnly = undefined;
    const rows: Bet[] = await api.bets.list({ start: fromISO, end: toISO, operator, createdByOnly });
    // tri: opérateur puis heure asc
    rows.sort((a, b) => (a.operator.localeCompare(b.operator) || (a.time + a.date).localeCompare(b.time + b.date)));
    return rows.map((b) => ({
      operator: b.operator, // Opérateur de jeux
      support: testCatalogLabel(b.support || ""),   // Support
      date: b.date,
      time: b.time,
      bet_type: testCatalogLabel(b.bet_type || ""),
      amount_fcfa: b.amount_fcfa,
      amount_won_fcfa: b.amount_won_fcfa,
      status: testStatusLabel(b.status),
      montant_text: formatFcfaCompact(b.amount_fcfa), // Montant en texte "xxxxF"
      heure_text: formatHeureH(b.time),               // Heure au format "HHHMM"
      phone: b.phone || "",
      reference: b.reference,                          // Référence
      statut: testStatusLabel(b.status),                                // statut
      montant_retourne_text: formatFcfaCompact(b.amount_won_fcfa),
    }));
  }

  if (module === "venues") {
    const allVenues = await api.venues.list();
    const rows: Venue[] = allVenues.filter((v) => v.operator === operator);
    return rows.map((v) => ({
      quartier_no: v.quartier_no ?? "",
      quartier: v.quartier,
      operator: v.operator,
      support: v.support,
      bet_type: v.bet_type,
      address: v.address,
      contact_phone: v.contact_phone ?? "",
      gps_lat: v.gps_lat ?? "",
      gps_lng: v.gps_lng ?? "",
      notes: v.notes ?? "",
    }));
  }

  return [];
}

import { escapeCell } from "./csv";

export async function exportToCSV(
  headers: string[],
  rows: any[],
  filename: string,
) {
  const csv = [
    headers.map((key) => escapeCell(({ bet_type: "Type de test", amount_fcfa: "Montant engagé (FCFA)", amount_won_fcfa: "Montant retourné (FCFA)", status: "Issue du test" } as Record<string, string>)[key] || key)).join(";"),
    ...rows.map((r) => headers.map((h) => escapeCell(testExportValue(h, (r as any)[h]))).join(";")),
  ].join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

// Helpers
export function formatFcfaCompact(n?: number) {
  return (typeof n === "number" ? new Intl.NumberFormat("fr-FR").format(n) : "") + (n ? "F" : "");
}

export function formatHeureH(isoOrHHmm?: string) {
  if (!isoOrHHmm) return "";
  const s = isoOrHHmm.includes("T") ? isoOrHHmm.slice(11, 16) : isoOrHHmm;
  if (/^\d{2}:\d{2}$/.test(s)) {
    return `${s.slice(0, 2)}H${s.slice(3, 5)}`;
  }
  return isoOrHHmm;
}

export async function exportToExcel(
  sheetName: string,
  headers: { key: string; title: string; width?: number; numFmt?: string }[],
  rows: any[],
  filename: string,
) {
  const columns: ExcelColumnDef[] = headers.map((h) => {
    const isCurrency =
      h.key.toLowerCase().includes("amount") ||
      h.key.toLowerCase().includes("montant") ||
      h.key.toLowerCase().includes("montants retournés");
    const isStatus =
      h.key.toLowerCase() === "status" ||
      h.key.toLowerCase() === "statut" ||
      h.key.toLowerCase() === "proof";

    return {
      header: h.title,
      key: h.key,
      width: h.width || (isCurrency ? 20 : 16),
      isCurrency,
      isStatus,
      align: isCurrency ? "right" : isStatus ? "center" : "left",
    };
  });

  await exportStyledExcel({
    sheetName,
    title: `Rapport OPEN — ${sheetName.toUpperCase()}`,
    subtitle: `Export des données`,
    columns,
    data: rows,
    filename,
    showTotals: true,
  });
}

export async function exportToPDF(
  documentTitle: string,
  headers: { key: string; title: string; width?: number; numFmt?: string }[],
  rows: any[],
  filename: string,
  operator?: string,
  periodText?: string,
) {
  const columns: PDFColumnDef[] = headers.map((h) => {
    const isCurrency =
      h.key.toLowerCase().includes("amount") ||
      h.key.toLowerCase().includes("montant") ||
      h.key.toLowerCase().includes("montants retournés");
    const isStatus =
      h.key.toLowerCase() === "status" ||
      h.key.toLowerCase() === "statut" ||
      h.key.toLowerCase() === "proof" ||
      h.key.toLowerCase().includes("validation");

    return {
      header: h.title,
      key: h.key,
      isCurrency,
      isStatus,
      align: isCurrency ? "right" : isStatus ? "center" : "left",
    };
  });

  await exportStyledPDF({
    title: `Rapport OPEN — ${documentTitle.toUpperCase()}`,
    operator,
    periodText,
    columns,
    data: rows,
    filename,
    showTotals: true,
  });
}
