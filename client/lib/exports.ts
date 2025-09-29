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
    const createdByOnly = undefined; // exports are admin by default; enforce RBAC in the page if needed
    const rows: Bet[] = await api.bets.list({ start: fromISO, end: toISO, operator, createdByOnly });
    return rows.map((b) => ({
      date: b.date,
      time: b.time,
      operator: b.operator,
      support: b.support,
      category: "", // placeholder if you later add category
      forme: b.bet_type,
      amount_fcfa: b.amount_fcfa,
      status: b.status,
      amount_won_fcfa: (b as any).amount_won_fcfa ?? "",
      reference: b.reference,
      ticket_url: (b as any).ticket_url ?? "",
      notes: b.notes ?? "",
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
  // If amounts use F CFA, prefer compact "F"
  const adjustedHeaders = headers.map((h) => {
    if (h.key.includes("amount_fcfa") && !h.numFmt) {
      return { ...h, numFmt: "#,##0\"F\"" };
    }
    return h;
  });
  ws.columns = adjustedHeaders.map((h) => ({ header: h.title, key: h.key, width: h.width ?? 16 }));

  // Header style
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };

  // Insert spacer rows between operator groups and color operator cells
  const keyIndex: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, colNumber) => {
    const col = ws.getColumn(colNumber);
    const headerTitle = String(cell.value ?? "");
    const headerDef = adjustedHeaders[colNumber - 1];
    if (headerDef) keyIndex[headerDef.key] = colNumber;
  });

  const opColIdx = keyIndex["operator"];

  const colorMap: Record<string, string> = {
    "1xBet": "FF1DA1F2",      // blue
    "Bet223": "FFEA7E13",     // orange
    "Bet224": "FFEA7E13",     // orange
    "PremierBet": "FF2E7D32", // green
  };

  // build grouped rows
  const sorted = [...rows];
  let prevOp: string | undefined = undefined;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i] as any;
    const curOp = r?.operator as string | undefined;
    if (prevOp !== undefined && curOp !== prevOp) {
      ws.addRow({}); // spacer row
    }
    const excelRow = ws.addRow(r);
    // amount formats per header definition
    excelRow.eachCell((cell, c) => {
      const def = adjustedHeaders[c - 1];
      if (def?.numFmt) (cell as any).numFmt = def.numFmt;
    });
    // operator color chip
    if (opColIdx && curOp) {
      const cell = excelRow.getCell(opColIdx);
      const fill = colorMap[curOp] ?? "FF0EA5E9"; // cyan default
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } } as any;
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true } as any;
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true } as any;
    }
    prevOp = curOp;
  }

  // Styles
  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      const col = adjustedHeaders.find((h) => h.key === (cell as any)._column?.key || h.title === cell.value);
      if (col?.numFmt) cell.numFmt = col.numFmt;
      // align: numbers right, others left
      const isNumber = typeof cell.value === "number";
      cell.alignment = { horizontal: isNumber ? "right" : "left", vertical: "middle", wrapText: true };
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
