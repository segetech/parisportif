import { testExportValue } from "./test-vocabulary";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface PDFColumnDef {
  header: string;
  key: string;
  align?: "left" | "center" | "right";
  isCurrency?: boolean;
  isStatus?: boolean;
}

export interface PDFExportOptions {
  title: string;
  subtitle?: string;
  operator?: string;
  periodText?: string;
  columns: PDFColumnDef[];
  data: any[];
  filename: string;
  showTotals?: boolean;
  orientation?: "portrait" | "landscape";
}

export async function exportStyledPDF({
  title,
  subtitle,
  operator,
  periodText,
  columns,
  data,
  filename,
  showTotals = true,
  orientation,
}: PDFExportOptions) {
  // Déterminer l'orientation : paysage si plus de 5 colonnes pour un confort visuel optimal
  const autoOrientation = orientation || (columns.length > 5 ? "landscape" : "portrait");
  const doc = new jsPDF({
    orientation: autoOrientation,
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ========================================================
  // 1. BANDEAU SUPÉRIEUR BRANDÉ (Vert Émeraude Solide Officiel)
  // ========================================================
  doc.setFillColor(0, 107, 45); // Vert officiel #006B2D
  doc.rect(0, 0, pageWidth, 5, "F");

  // Accent doré fin sous le bandeau émeraude
  doc.setFillColor(255, 208, 0); // Or officiel #FFD000
  doc.rect(0, 5, pageWidth, 1, "F");

  let currentY = 14;

  // Logo textuel et titre de l'application
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 107, 45);
  doc.text("TEST", margin, currentY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text("Test • Rapport de données", margin + 18, currentY - 0.5);

  currentY += 8;

  // Titre principal du rapport
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(title.toUpperCase(), margin, currentY);

  currentY += 5.5;

  // Métadonnées & Période
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

  const metaParts = [
    `Période : ${periodDisplay}`,
    `Opérateur : ${operatorText}`,
    `Généré le : ${dateFormatted}`,
    `Volume : ${data.length} ligne(s)`,
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text(metaParts.join("   •   "), margin, currentY);

  currentY += 5;

  // ========================================================
  // 2. BLOCS KPIS DE SYNTHÈSE (Si colonnes de montants présentes)
  // ========================================================
  const hasCurrencyCol = columns.some((c) => c.isCurrency);
  if (hasCurrencyCol && data.length > 0) {
    let totalMise = 0;
    let totalGains = 0;

    data.forEach((item) => {
      totalMise += Number(item.amount_fcfa || item.montant || 0);
      totalGains += Number(item.amount_won_fcfa || item.gains || 0);
    });

    const marge = totalMise - totalGains;
    const cardWidth = (pageWidth - margin * 2 - 8) / 3;
    const cardHeight = 12;

    // Bloc 1 : Volume Misé / Débit
    doc.setFillColor(236, 253, 245); // Emerald 50
    doc.setDrawColor(167, 243, 208); // Emerald 200
    doc.roundedRect(margin, currentY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(6, 95, 70); // Emerald 800
    doc.text("VOLUME TOTAL ENGAGÉ", margin + 3, currentY + 4.5);
    doc.setFontSize(9.5);
    doc.text(
      `${new Intl.NumberFormat("fr-FR").format(Math.round(totalMise))} FCFA`,
      margin + 3,
      currentY + 9.5
    );

    // Bloc 2 : Gains Remportés / Crédit
    const x2 = margin + cardWidth + 4;
    doc.setFillColor(241, 245, 249); // Slate 100
    doc.setDrawColor(203, 213, 225); // Slate 300
    doc.roundedRect(x2, currentY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59); // Slate 800
    doc.text("MONTANTS RETOURNÉS", x2 + 3, currentY + 4.5);
    doc.setFontSize(9.5);
    doc.text(
      `${new Intl.NumberFormat("fr-FR").format(Math.round(totalGains))} FCFA`,
      x2 + 3,
      currentY + 9.5
    );

    // Bloc 3 : Marge Nette
    const x3 = x2 + cardWidth + 4;
    doc.setFillColor(254, 243, 199); // Amber 100
    doc.setDrawColor(253, 230, 138); // Amber 200
    doc.roundedRect(x3, currentY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(146, 64, 14); // Amber 800
    doc.text("MARGE NETTE OPÉRATEUR", x3 + 3, currentY + 4.5);
    doc.setFontSize(9.5);
    doc.text(
      `${new Intl.NumberFormat("fr-FR").format(Math.round(marge))} FCFA`,
      x3 + 3,
      currentY + 9.5
    );

    currentY += cardHeight + 4;
  }

  // ========================================================
  // 3. TABLEAU DES DONNÉES FORMATÉ AVEC JSPDF-AUTOTABLE
  // ========================================================
  const tableHeaders = columns.map((c) => c.header.toUpperCase());

  const tableBody = data.map((row, idx) => {
    return columns.map((col) => {
      let val = testExportValue(col.key, row[col.key]);
      if (col.key === "index") return String(idx + 1);

      if (col.isCurrency) {
        const num = Number(val) || 0;
        return `${new Intl.NumberFormat("fr-FR").format(Math.round(num))} FCFA`;
      }

      if (val === undefined || val === null || val === "") return "—";
      return String(val);
    });
  });

  // Calcul du footer de totalisation
  const tableFoot = showTotals && hasCurrencyCol
    ? [
        columns.map((col, idx) => {
          if (idx === 0) return "TOTAL";
          if (col.isCurrency) {
            let colSum = 0;
            data.forEach((item) => {
              colSum += Number(item[col.key] || 0);
            });
            return `${new Intl.NumberFormat("fr-FR").format(Math.round(colSum))} FCFA`;
          }
          return "";
        }),
      ]
    : undefined;

  // Configuration des alignements de colonnes
  const columnStylesConfig: Record<number, any> = {};
  columns.forEach((col, idx) => {
    columnStylesConfig[idx] = {
      halign: col.align || (col.isCurrency ? "right" : "left"),
    };
  });

  autoTable(doc, {
    startY: currentY,
    head: [tableHeaders],
    body: tableBody,
    foot: tableFoot,
    margin: { left: margin, right: margin, bottom: 14 },
    theme: "striped",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 41, 59], // Slate 800
      lineColor: [226, 232, 240], // Slate 200
      lineWidth: 0.2,
      valign: "middle",
    },
    headStyles: {
      fillColor: [0, 107, 45], // Vert Émeraude Officiel #006B2D
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
      minCellHeight: 7,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // Slate 50
    },
    footStyles: {
      fillColor: [241, 245, 249], // Slate 100
      textColor: [15, 23, 42], // Slate 900
      fontStyle: "bold",
      fontSize: 8.5,
      minCellHeight: 7,
      lineColor: [0, 107, 45],
      lineWidth: 0.3,
    },
    columnStyles: columnStylesConfig,
    didParseCell: (hookData) => {
      // Colorer les statuts dans les cellules du corps de tableau
      if (hookData.section === "body") {
        const colDef = columns[hookData.column.index];
        if (colDef?.isStatus) {
          const rawText = String(hookData.cell.raw || "").toLowerCase();
          if (rawText.includes("gagn") || rawText.includes("valid")) {
            hookData.cell.styles.textColor = [22, 101, 52]; // Vert foncé #166534
            hookData.cell.styles.fontStyle = "bold";
          } else if (rawText.includes("perdu") || rawText.includes("refus")) {
            hookData.cell.styles.textColor = [153, 27, 27]; // Rouge foncé #991B1B
            hookData.cell.styles.fontStyle = "bold";
          } else if (rawText.includes("attente")) {
            hookData.cell.styles.textColor = [146, 64, 14]; // Ambre #92400E
            hookData.cell.styles.fontStyle = "bold";
          }
        }
      }
    },
    didDrawPage: (hookData) => {
      // ========================================================
      // 4. PIED DE PAGE CORPORATE SUR TOUTES LES PAGES
      // ========================================================
      const str = `Page ${hookData.pageNumber}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // Slate 400

      // Ligne séparatrice fine
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);

      // Mention de confidentialité et pagination
      doc.text(
        "Document généré par le Système de Gestion & Contrôle des Tests • Strictement Confidentiel",
        margin,
        pageHeight - 4.5
      );
      doc.text(str, pageWidth - margin - 15, pageHeight - 4.5);
    },
  });

  // Sauvegarde et téléchargement du fichier PDF
  const finalFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  doc.save(finalFilename);
}
