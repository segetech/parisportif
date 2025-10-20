import api, { Bet, Transaction, Venue } from "@/data/api";

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
      support: b.support,   // Support
      type_pari: "",        // Type de Pari (catégorie) – inconnu pour l'instant
      montant_text: formatFcfaCompact(b.amount_fcfa), // Montant en texte "xxxxF"
      heure_text: formatHeureH(b.time),               // Heure au format "HHHMM"
      phone: "",                                       // Numéro de téléphone (vide)
      reference: b.reference,                          // Référence
      statut: b.status,                                // statut
      montant_gagne_text: formatFcfaCompact((b as any).amount_won_fcfa), // montant gagné texte
    }));
  }

  if (module === "venues") {
    const rows: Venue[] = [...api.store.venues].filter((v) => v.operator === operator);
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

export async function exportToCSV(
  headers: string[],
  rows: any[],
  filename: string,
) {
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape((r as any)[h])).join(","))].join("\n");
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

async function loadExcelJsFromCdn(): Promise<any> {
  const url = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
  // already loaded?
  if ((window as any).ExcelJS) return (window as any).ExcelJS;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger ExcelJS depuis le CDN."));
    document.head.appendChild(s);
  });
  return (window as any).ExcelJS;
}

export async function exportToExcel(
  sheetName: string,
  headers: { key: string; title: string; width?: number; numFmt?: string }[],
  rows: any[],
  filename: string,
) {
  let ExcelJS: any;
  try {
    // Try local package first (browser build)
    // @ts-ignore
    ExcelJS = (await import(/* @vite-ignore */ "exceljs/dist/exceljs.min.js")) as any;
  } catch {
    // Fallback via script tag to avoid Vite import analysis
    ExcelJS = await loadExcelJsFromCdn();
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  ws.views = [{ state: "frozen", ySplit: 1 }];
  const adjustedHeaders = headers; // rows may already be formatted as text for full control
  ws.columns = adjustedHeaders.map((h) => ({ header: h.title, key: h.key, width: h.width ?? 16 }));

  // Header style
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FF111827" } }; // black text
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }; // gray-200
  header.eachCell((cell) => {
    cell.border = {
      top: { style: "medium", color: { argb: "FF111827" } },
      left: { style: "medium", color: { argb: "FF111827" } },
      bottom: { style: "medium", color: { argb: "FF111827" } },
      right: { style: "medium", color: { argb: "FF111827" } },
    };
  });

  // Insert spacer rows between operator groups and color operator cells
  const keyIndex: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, colNumber) => {
    const col = ws.getColumn(colNumber);
    const headerTitle = String(cell.value ?? "");
    const headerDef = adjustedHeaders[colNumber - 1];
    if (headerDef) keyIndex[headerDef.key] = colNumber;
  });

  // Detect operator column by key or header title
  const findOpIdx = () => {
    if (keyIndex["operator"]) return keyIndex["operator"];
    if (keyIndex["op"]) return keyIndex["op"];
    // fallback by title match
    let idx = 0;
    ws.getRow(1).eachCell((cell, c) => {
      const t = String(cell.value ?? "").toLowerCase();
      if (t.includes("opérateur de jeux")) idx = c;
    });
    return idx || undefined;
  };
  const opColIdx = findOpIdx();

  const colorMap: Record<string, { bg: string; fg: string }> = {
    "1xBet": { bg: "FF1E88E5", fg: "FFFFFFFF" },
    "Bet223": { bg: "FFF57C00", fg: "FFFFFFFF" },
    "PremierBet": { bg: "FF2E7D32", fg: "FFFFFFFF" },
  };

  // build rows (caller may have sorted already)
  const sorted = [...rows];
  let prevOp: string | undefined = undefined;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i] as any;
    const curOp = r?.operator as string | undefined;
    const excelRow = ws.addRow(r);
    // operator color chip
    if (opColIdx && curOp) {
      const cell = excelRow.getCell(opColIdx);
      const m = colorMap[curOp] ?? { bg: "FFF3F4F6", fg: "FF111827" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: m.bg } } as any;
      cell.font = { color: { argb: m.fg }, bold: true } as any;
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true } as any;
    }
    prevOp = curOp;
  }

  // Styles
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "medium", color: { argb: "FF111827" } },
        left: { style: "medium", color: { argb: "FF111827" } },
        bottom: { style: "medium", color: { argb: "FF111827" } },
        right: { style: "medium", color: { argb: "FF111827" } },
      };
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    });
  });

  // Auto filter
  const lastCol = String.fromCharCode("A".charCodeAt(0) + headers.length - 1) + "1";
  ws.autoFilter = { from: "A1", to: lastCol } as any;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
