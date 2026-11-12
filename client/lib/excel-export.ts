import { sanitizeForSpreadsheet } from "./excel-import-engine";
import { testExportValue } from "./test-vocabulary";

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

  workbook.creator = "Plateforme Test";
  workbook.lastModifiedBy = "Plateforme Test";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  const numCols = columns.length;
  let currentRow = 1;

  // ========================================================
  // 1. BANDEAU DE TITRE CORPORATE (Vert Émeraude Officiel #006B2D)
  // ========================================================
  const titleRow = worksheet.getRow(currentRow);
  titleRow.height = 36;
  worksheet.mergeCells(currentRow, 1, currentRow, numCols);

  for (let c = 1; c <= numCols; c++) {
    const cell = titleRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF006B2D" }, // Vert Émeraude Officiel #006B2D
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF004D20" } },
      bottom: { style: "thin", color: { argb: "FFFFD000" } },
      left: { style: "thin", color: { argb: "FF004D20" } },
      right: { style: "thin", color: { argb: "FF004D20" } },
    };
  }

  const titleCell = titleRow.getCell(1);
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: "Segoe UI", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  currentRow++;

  // Filet d'accentuation Or officiel (#FFD000)
  const accentRow = worksheet.getRow(currentRow);
  accentRow.height = 4;
  worksheet.mergeCells(currentRow, 1, currentRow, numCols);
  for (let c = 1; c <= numCols; c++) {
    const cell = accentRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFD000" }, // Or officiel #FFD000
    };
  }
  currentRow++;

  // Ligne de sous-titre / Métadonnées en français intégral
  const subRow = worksheet.getRow(currentRow);
  subRow.height = 22;
  worksheet.mergeCells(currentRow, 1, currentRow, numCols);

  for (let c = 1; c <= numCols; c++) {
    const cell = subRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF004D20" }, // Vert forêt sombre #004D20
    };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF003816" } },
      left: { style: "thin", color: { argb: "FF003816" } },
      right: { style: "thin", color: { argb: "FF003816" } },
    };
  }

  const subCell = subRow.getCell(1);
  const dateFormatted = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isAllOperators =
    !operator ||
    operator.toLowerCase() === "tous" ||
    operator.toLowerCase() === "all" ||
    operator.toLowerCase() === "tous les opérateurs";
  const operatorText = isAllOperators ? "Tous les opérateurs" : operator;

  const isAllPeriods =
    !periodText ||
    periodText.toLowerCase() === "all" ||
    periodText.toLowerCase() === "tous" ||
    periodText.toLowerCase().includes("toutes");
  const periodDisplay = isAllPeriods ? "Toutes les dates" : periodText;

  const metadataParts = [
    `Période : ${periodDisplay}`,
    `Opérateur : ${operatorText}`,
    `Extrait le : ${dateFormatted}`,
    `Total : ${data.length} enregistrement(s)`,
  ];
  subCell.value = metadataParts.join("   •   ");
  subCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
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

    data.forEach((item) => {
      totalMise += Number(item.amount_fcfa || item.montant || 0);
      totalGains += Number(item.amount_won_fcfa || item.gains || 0);
    });

    const kpiRow = worksheet.getRow(currentRow);
    kpiRow.height = 30;

    const span1End = Math.max(2, Math.floor(numCols / 3));
    const span2Start = span1End + 1;
    const span2End = Math.max(span2Start + 1, Math.floor((numCols * 2) / 3));
    const span3Start = span2End + 1;
    const span3End = numCols;

    if (span1End >= 2) worksheet.mergeCells(currentRow, 1, currentRow, span1End);
    if (span2End >= span2Start) worksheet.mergeCells(currentRow, span2Start, currentRow, span2End);
    if (span3End >= span3Start) worksheet.mergeCells(currentRow, span3Start, currentRow, span3End);

    // Bloc 1: Total Engagé (Vert émeraude subtil)
    for (let c = 1; c <= span1End; c++) {
      const cell = kpiRow.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFA7F3D0" } },
        bottom: { style: "thin", color: { argb: "FFA7F3D0" } },
        left: { style: "thin", color: { argb: "FFA7F3D0" } },
        right: { style: "thin", color: { argb: "FFA7F3D0" } },
      };
    }
    const kpi1Cell = kpiRow.getCell(1);
    kpi1Cell.value = `Volume Engagé : ${new Intl.NumberFormat("fr-FR").format(totalMise)} FCFA`;
    kpi1Cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF065F46" } };
    kpi1Cell.alignment = { horizontal: "center", vertical: "middle" };

    // Bloc 2: Total Gains (Ambre/Or subtil)
    for (let c = span2Start; c <= span2End; c++) {
      const cell = kpiRow.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFFDE68A" } },
        bottom: { style: "thin", color: { argb: "FFFDE68A" } },
        left: { style: "thin", color: { argb: "FFFDE68A" } },
        right: { style: "thin", color: { argb: "FFFDE68A" } },
      };
    }
    const kpi2Cell = kpiRow.getCell(span2Start);
    kpi2Cell.value = `Montants retournés : ${new Intl.NumberFormat("fr-FR").format(totalGains)} FCFA`;
    kpi2Cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF92400E" } };
    kpi2Cell.alignment = { horizontal: "center", vertical: "middle" };

    // Bloc 3: Marge Nette (Slate subtil)
    const marge = totalMise - totalGains;
    for (let c = span3Start; c <= span3End; c++) {
      const cell = kpiRow.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    }
    const kpi3Cell = kpiRow.getCell(span3Start);
    kpi3Cell.value = `Marge Nette : ${new Intl.NumberFormat("fr-FR").format(marge)} FCFA`;
    kpi3Cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF0F172A" } };
    kpi3Cell.alignment = { horizontal: "center", vertical: "middle" };

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
      fgColor: { argb: "FF006B2D" }, // Vert Émeraude Officiel #006B2D
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF004D20" } },
      bottom: { style: "medium", color: { argb: "FF004D20" } },
      left: { style: "thin", color: { argb: "FF059669" } },
      right: { style: "thin", color: { argb: "FF059669" } },
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
      const val = testExportValue(col.key, item[col.key]);

      // Formatage et valeur
      if (col.isCurrency) {
        const numVal = Number(val) || 0;
        cell.value = numVal;
        cell.numFmt = '#,##0 "FCFA"';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.value = typeof val === "string" ? sanitizeForSpreadsheet(val) : (val ?? "");
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

      // Badge de statut stylisé et traduction automatique en français
      if (col.isStatus && val) {
        const st = String(val).toLowerCase();
        if (st === "issue favorable" || st.includes("gagn") || st === "won" || st.includes("valid")) {
          cell.value = st.includes("valid") ? "Validé" : "Issue favorable";
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF166534" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (st === "issue défavorable" || st.includes("perdu") || st === "lost" || st.includes("refus")) {
          cell.value = st.includes("refus") ? "Refusé" : "Issue défavorable";
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF991B1B" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (st.includes("attente") || st === "pending") {
          cell.value = "En attente";
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

/**
 * Génère et télécharge un modèle Excel vierge officiel prêt à l'importation
 * Conforme aux spécifications des feuilles : depotretrait, pari, ou Salle jeux
 */
export async function buildImportTemplate(type: "depotretrait" | "tests" | "pari" | "salles") {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Plateforme Test";

  let sheetName = "Données";
  let headers: string[] = [];
  let sampleRow: (string | number)[] = [];
  let filename = "";

  if (type === "depotretrait") {
    sheetName = "depotretrait";
    filename = "modele_officiel_depot_retrait.xlsx";
    headers = [
      "Opérateur",
      "Plateforme",
      "Opérateur de paiement",
      "Type",
      "Montant",
      "Heure",
      "Numéro de téléphone",
      "Référence",
      "preuve",
    ];
    sampleRow = [
      "Opérateur de test",
      "App mobile",
      "Orange",
      "Dépôt",
      1000,
      "04:38",
      "0701020304",
      "CI250326.0438.B13742",
      "dispo",
    ];
  } else if (type === "tests" || type === "pari") {
    sheetName = "Tests";
    filename = "modele_officiel_tests.xlsx";
    headers = [
      "Opérateur",
      "Support",
      "Type de test",
      "Montant",
      "Heure",
      "Numéro de téléphone",
      "Référence du test",
      "Statut",
      "Montant retourné",
    ];
    sampleRow = [
      "Opérateur de test",
      "App mobile",
      "Test fonctionnel",
      1000,
      "04:38",
      "0701020304",
      "CI250326.0438.B13742",
      "Issue favorable",
      3500,
    ];
  } else {
    sheetName = "Sites";
    filename = "modele_officiel_sites.xlsx";
    headers = [
      "N°",
      "Quartier",
      "Opérateur",
      "Support",
      "Type de test",
      "localisation",
    ];
    sampleRow = [
      1,
      "Niamana",
      "Opérateur de test",
      "Site de test",
      "Test fonctionnel",
      "Ancienne poste du 11e arrondissement",
    ];
  }

  const worksheet = workbook.addWorksheet(sheetName);
  const headerRow = worksheet.getRow(1);
  headerRow.values = headers;
  headerRow.height = 24;

  headerRow.eachCell((cell) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF006B2D" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  const row2 = worksheet.getRow(2);
  row2.values = sampleRow;
  row2.font = { name: "Segoe UI", size: 9.5 };

  // Ajustement des largeurs
  headers.forEach((h, idx) => {
    worksheet.getColumn(idx + 1).width = Math.max(h.length + 5, 16);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, filename, sheetName };
}

export async function generateBlankImportTemplate(type: "depotretrait" | "tests" | "pari" | "salles") {
  const { buffer, filename } = await buildImportTemplate(type);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
