/**
 * Moteur d'exportation Excel Haute Définition avec ExcelJS
 * Stylisation corporate professionnelle :
 * - Bandeau de titre corporate & cartouche de métadonnées
 * - Blocs KPIs de synthèse intégrés
 * - En-têtes stylés avec filtres automatiques et volet figé
 * - Zebra striping élégant et haute lisibilité
 * - Alignements et typographies soignés
 * - Formatage numérique natif (sommable sous Excel)
 * - Badges de statut colorés (Pastel corporate)
 * - Ligne de synthèse et totaux avec formules Excel
 */

// Helper pour charger ExcelJS de manière sécurisée en environnement Vite SPA
async function getExcelJS(): Promise<any> {
  try {
    // @ts-ignore
    const mod = await import(/* @vite-ignore */ "exceljs/dist/exceljs.min.js");
    return mod.default || mod;
  } catch (err) {
    if ((window as any).ExcelJS) return (window as any).ExcelJS;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
      script.onload = () => resolve((window as any).ExcelJS);
      script.onerror = () => reject(new Error("Impossible de charger le moteur ExcelJS"));
      document.head.appendChild(script);
    });
  }
}

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
  align?: "left" | "center" | "right";
  isCurrency?: boolean;
  isStatus?: boolean;
}

export interface ExcelExportOptions {
  sheetName: string;
  title: string;
  subtitle?: string;
  operator?: string;
  periodText?: string;
  columns: ExcelColumnDef[];
  data: any[];
  filename: string;
  showTotals?: boolean;
}

export async function exportStyledExcel({
  sheetName = "Données",
  title,
  subtitle,
  operator,
  periodText,
  columns,
  data,
  filename,
  showTotals = true,
}: ExcelExportOptions) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Système de Gestion des Paris";
  workbook.lastModifiedBy = "Système de Gestion des Paris";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  const numCols = columns.length;
  let currentRow = 1;

  // ========================================================
  // 1. BANDEAU DE TITRE CORPORATE (Lignes 1 et 2)
  // ========================================================
  const titleRow = worksheet.getRow(currentRow);
  titleRow.height = 36;
  worksheet.mergeCells(currentRow, 1, currentRow, numCols);
  const titleCell = titleRow.getCell(1);
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" }, // Slate 900
  };
  currentRow++;

  // Ligne de sous-titre / Métadonnées
  const subRow = worksheet.getRow(currentRow);
  subRow.height = 24;
  worksheet.mergeCells(currentRow, 1, currentRow, numCols);
  const subCell = subRow.getCell(1);
  const dateFormatted = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const metadataParts = [
    periodText ? `Période : ${periodText}` : "Période : Toutes",
    operator && operator !== "tous" ? `Opérateur : ${operator}` : "Opérateur : Tous",
    `Extrait le : ${dateFormatted}`,
    `Total : ${data.length} enregistrement(s)`,
  ];
  subCell.value = metadataParts.join("   •   ");
  subCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF94A3B8" } }; // Slate 400
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  subCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" }, // Slate 800
  };
  currentRow++;

  // Ligne d'espacement
  worksheet.getRow(currentRow).height = 10;
  currentRow++;

  // ========================================================
  // 2. CARTOUCHES SYNTHÈSE / KPIS (Si montants présents)
  // ========================================================
  const hasCurrencyCol = columns.some((c) => c.isCurrency);
  if (hasCurrencyCol && data.length > 0) {
    let totalMise = 0;
    let totalGains = 0;
    let nbGagnes = 0;

    data.forEach((item) => {
      totalMise += Number(item.amount_fcfa || item.montant || 0);
      totalGains += Number(item.amount_won_fcfa || item.gains || 0);
      const st = String(item.status || item.statut || "").toLowerCase();
      if (st.includes("gagn")) nbGagnes++;
    });

    const kpiRow = worksheet.getRow(currentRow);
    kpiRow.height = 30;

    // Bloc 1: Total Engagé
    const kpi1Cell = kpiRow.getCell(1);
    kpi1Cell.value = `Volume Misé : ${new Intl.NumberFormat("fr-FR").format(totalMise)} FCFA`;
    kpi1Cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF065F46" } };
    kpi1Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
    kpi1Cell.alignment = { horizontal: "center", vertical: "middle" };
    kpi1Cell.border = {
      top: { style: "thin", color: { argb: "FFA7F3D0" } },
      bottom: { style: "thin", color: { argb: "FFA7F3D0" } },
      left: { style: "thin", color: { argb: "FFA7F3D0" } },
      right: { style: "thin", color: { argb: "FFA7F3D0" } },
    };

    // Bloc 2: Total Gains
    const colMid = Math.max(3, Math.floor(numCols / 2));
    const kpi2Cell = kpiRow.getCell(colMid);
    kpi2Cell.value = `Gains Remportés : ${new Intl.NumberFormat("fr-FR").format(totalGains)} FCFA`;
    kpi2Cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF1E40AF" } };
    kpi2Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    kpi2Cell.alignment = { horizontal: "center", vertical: "middle" };
    kpi2Cell.border = {
      top: { style: "thin", color: { argb: "FFBFDBFE" } },
      bottom: { style: "thin", color: { argb: "FFBFDBFE" } },
      left: { style: "thin", color: { argb: "FFBFDBFE" } },
      right: { style: "thin", color: { argb: "FFBFDBFE" } },
    };

    // Bloc 3: Marge / Rétention
    const kpi3Cell = kpiRow.getCell(numCols);
    const marge = totalMise - totalGains;
    kpi3Cell.value = `Marge Nette : ${new Intl.NumberFormat("fr-FR").format(marge)} FCFA`;
    kpi3Cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF374151" } };
    kpi3Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    kpi3Cell.alignment = { horizontal: "center", vertical: "middle" };
    kpi3Cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };

    currentRow++;
    worksheet.getRow(currentRow).height = 10;
    currentRow++;
  }

  // ========================================================
  // 3. EN-TÊTES DE COLONNES (Header Row)
  // ========================================================
  const headerRowIndex = currentRow;
  const headerRow = worksheet.getRow(headerRowIndex);
  headerRow.height = 26;

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = {
      horizontal: col.align || (col.isCurrency ? "right" : "left"),
      vertical: "middle",
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" }, // Bleu Marine Corporate (Blue 900)
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF0F172A" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF3B82F6" } },
      right: { style: "thin", color: { argb: "FF3B82F6" } },
    };
  });
  currentRow++;

  // ========================================================
  // 4. LIGNES DE DONNÉES AVEC ZEBRA STRIPING & STYLES
  // ========================================================
  const dataStartRow = currentRow;

  data.forEach((item, rowIdx) => {
    const dataRow = worksheet.getRow(currentRow);
    dataRow.height = 22;
    const isEven = rowIdx % 2 === 0;
    const rowBgColor = isEven ? "FFFFFFFF" : "FFF8FAFC"; // Blanc pur vs Slate 50

    columns.forEach((col, colIdx) => {
      const cell = dataRow.getCell(colIdx + 1);
      const val = item[col.key];

      // Formatage et valeur
      if (col.isCurrency) {
        const numVal = Number(val) || 0;
        cell.value = numVal;
        cell.numFmt = '#,##0 "FCFA"';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.value = val ?? "";
        cell.alignment = {
          horizontal: col.align || "left",
          vertical: "middle",
        };
      }

      // Police par défaut
      cell.font = { name: "Segoe UI", size: 9.5, color: { argb: "FF1E293B" } };

      // Couleur de fond par défaut (Zebra)
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowBgColor },
      };

      // Bordure fine
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      // Badge de statut stylisé
      if (col.isStatus && val) {
        const st = String(val).toLowerCase();
        if (st.includes("gagn")) {
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF166534" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (st.includes("perdu")) {
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF991B1B" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (st.includes("attente")) {
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF92400E" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      }

      // Référence ou N° en monospace subtil
      if (col.key === "id" || col.key === "reference" || col.key === "ref") {
        cell.font = { name: "Consolas", size: 9, color: { argb: "FF64748B" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    });

    currentRow++;
  });

  const dataEndRow = currentRow - 1;

  // ========================================================
  // 5. LIGNE DE SYNTHÈSE / TOTAL GÉNÉRAL
  // ========================================================
  if (showTotals && data.length > 0) {
    const totalRow = worksheet.getRow(currentRow);
    totalRow.height = 26;

    // Étiquette Total
    const labelCell = totalRow.getCell(1);
    labelCell.value = "TOTAL GÉNÉRAL";
    labelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF0F172A" } };
    labelCell.alignment = { horizontal: "left", vertical: "middle" };

    columns.forEach((col, colIdx) => {
      const cell = totalRow.getCell(colIdx + 1);

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" }, // Slate 100
      };

      // Double bordure inférieure comptable
      cell.border = {
        top: { style: "thin", color: { argb: "FF0F172A" } },
        bottom: { style: "double", color: { argb: "FF0F172A" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      // Formule de somme automatique sur les colonnes de montants
      if (col.isCurrency) {
        const colLetter = worksheet.getColumn(colIdx + 1).letter;
        cell.value = {
          formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})`,
        };
        cell.numFmt = '#,##0 "FCFA"';
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF0F172A" } };
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
    });

    currentRow++;
  }

  // ========================================================
  // 6. AJUSTEMENT AUTOMATIQUE DES LARGEURS DE COLONNES
  // ========================================================
  columns.forEach((colDef, idx) => {
    const column = worksheet.getColumn(idx + 1);
    let maxLen = colDef.header.length;

    // Scan des données pour adapter la largeur
    data.forEach((row) => {
      const valStr = String(row[colDef.key] ?? "");
      if (valStr.length > maxLen) {
        maxLen = valStr.length;
      }
    });

    // Padding et largeur minimale/maximale
    const targetWidth = colDef.width || Math.min(Math.max(maxLen + 4, 12), 35);
    column.width = targetWidth;
  });

  // ========================================================
  // 7. VOLET FIGÉ (Freeze Panes) & FILTRES AUTOMATIQUES
  // ========================================================
  worksheet.views = [
    {
      state: "frozen",
      xSplit: 0,
      ySplit: headerRowIndex, // Fige toutes les lignes au-dessus des données
      showGridLines: true,
    },
  ];

  const firstColLetter = worksheet.getColumn(1).letter;
  const lastColLetter = worksheet.getColumn(numCols).letter;
  worksheet.autoFilter = `${firstColLetter}${headerRowIndex}:${lastColLetter}${dataEndRow}`;

  // ========================================================
  // 8. EXPORTATION DU FICHIER BLOB
  // ========================================================
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
