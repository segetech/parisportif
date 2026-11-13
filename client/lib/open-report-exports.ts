import { buildCsv, downloadCsv, type CsvRow } from "./csv";
import { exportStyledPDF, type PDFColumnDef } from "./pdf-export";
import {
  aggregateReport,
  moneyCents,
  numericMoney,
  operatorKey,
  type ReportRow,
  type ReportSnapshot,
} from "./open-report-data";
import {
  buildReportFilename,
  buildReportTitle,
  formatBamakoDateTime,
} from "./report-periods";
import { testCatalogLabel, testStatusLabel } from "./test-vocabulary";
import { readRecordReference } from "./record-reference";

function validationLabel(status: unknown): string {
  switch (String(status || "")) {
    case "valide":
      return "Validé";
    case "en_attente":
      return "En attente";
    case "refuse":
      return "Refusé";
    default:
      return "Non renseigné";
  }
}

function resolveSnapshotSummary(snapshot: ReportSnapshot) {
  const activeOperatorFilter =
    snapshot.filters.operators && snapshot.filters.operators.length > 0
      ? snapshot.filters.operators
      : snapshot.filters.operator || undefined;
  return aggregateReport(
    snapshot,
    snapshot.filters.period,
    activeOperatorFilter,
    snapshot.filters.operatorCategory,
  );
}

function resolveScopeMeta(scope: ReportSnapshot["filters"]["scope"]) {
  if (scope === "bets") {
    return { slug: "tests", title: "Rapport des tests" };
  }
  if (scope === "transactions") {
    return { slug: "transactions", title: "Rapport des transactions" };
  }
  return { slug: "rapport", title: "Rapport d’activité" };
}

function resolveOperatorSummary(snapshot: ReportSnapshot): string {
  if (snapshot.filters.operators && snapshot.filters.operators.length > 0) {
    return snapshot.filters.operators.join(", ");
  }
  if (snapshot.filters.operator) return snapshot.filters.operator;
  if (snapshot.filters.operatorCategory === "legal") return "Opérateurs légaux";
  if (snapshot.filters.operatorCategory === "illegal") return "Opérateurs illégaux";
  return "Tous les opérateurs";
}

function toMoneyNumber(value: unknown): number {
  const cents = moneyCents(value);
  return cents === null ? 0 : numericMoney(cents);
}

export function buildOpenReportCsv(snapshot: ReportSnapshot): {
  csv: string;
  filename: string;
  rowCount: number;
  summary: ReturnType<typeof aggregateReport>;
} {
  const summary = resolveSnapshotSummary(snapshot);
  const { slug } = resolveScopeMeta(snapshot.filters.scope);
  const filename = buildReportFilename(
    slug,
    snapshot.filters.period.start,
    snapshot.filters.period.end,
    "csv",
  );

  const scope = snapshot.filters.scope || "all";
  let rows: CsvRow[] = [];
  let columns: string[] = [];

  if (scope === "bets") {
    columns = [
      "Référence",
      "Date",
      "Heure",
      "Opérateur",
      "Support",
      "Type de test",
      "Montant engagé (F CFA)",
      "Montant retourné (F CFA)",
      "Issue",
      "Validation",
      "Notes",
    ];
    rows = summary.tests.map((r: ReportRow) => ({
      Référence: readRecordReference(r as any).reference || r.id,
      Date: r.date?.slice(0, 10) || "",
      Heure: r.time || "",
      Opérateur: operatorKey(r) || "Non renseigné",
      Support: testCatalogLabel(r.support || ""),
      "Type de test": testCatalogLabel(r.bet_type || ""),
      "Montant engagé (F CFA)": toMoneyNumber(r.amount_fcfa),
      "Montant retourné (F CFA)":
        r.amount_won_fcfa === null || r.amount_won_fcfa === undefined || r.amount_won_fcfa === ""
          ? ""
          : toMoneyNumber(r.amount_won_fcfa),
      Issue: testStatusLabel(r.status),
      Validation: validationLabel(r.validation_status),
      Notes: r.notes || "",
    }));
  } else if (scope === "transactions") {
    columns = [
      "Référence",
      "Date",
      "Heure",
      "Opérateur",
      "Plateforme",
      "Moyen de paiement",
      "Type",
      "Montant (F CFA)",
      "Téléphone",
      "Validation",
      "Notes",
    ];
    rows = summary.transactions.map((r: ReportRow) => ({
      Référence: readRecordReference(r as any).reference || r.id,
      Date: r.date?.slice(0, 10) || "",
      Heure: r.time || "",
      Opérateur: operatorKey(r) || "Non renseigné",
      Plateforme: testCatalogLabel(r.platform || r.support || ""),
      "Moyen de paiement": r.payment_operator || "",
      Type: r.type || "",
      "Montant (F CFA)": toMoneyNumber(r.amount_fcfa),
      Téléphone: r.phone || "",
      Validation: validationLabel(r.validation_status),
      Notes: r.notes || "",
    }));
  } else {
    columns = [
      "Catégorie",
      "Référence",
      "Date",
      "Heure",
      "Opérateur",
      "Plateforme / Support",
      "Moyen de paiement",
      "Montant engagé / F CFA",
      "Montant retourné (F CFA)",
      "Validation",
      "Notes",
    ];
    rows = [
      ...summary.tests.map((r: ReportRow) => ({
        Catégorie: "Test",
        Référence: readRecordReference(r as any).reference || r.id,
        Date: r.date?.slice(0, 10) || "",
        Heure: r.time || "",
        Opérateur: operatorKey(r) || "Non renseigné",
        "Plateforme / Support": testCatalogLabel(r.support || ""),
        "Moyen de paiement": "",
        "Montant engagé / F CFA": toMoneyNumber(r.amount_fcfa),
        "Montant retourné (F CFA)":
          r.amount_won_fcfa === null || r.amount_won_fcfa === undefined || r.amount_won_fcfa === ""
            ? ""
            : toMoneyNumber(r.amount_won_fcfa),
        Validation: validationLabel(r.validation_status),
        Notes: r.notes || "",
      })),
      ...summary.transactions.map((r: ReportRow) => ({
        Catégorie: r.type || "Transaction",
        Référence: readRecordReference(r as any).reference || r.id,
        Date: r.date?.slice(0, 10) || "",
        Heure: r.time || "",
        Opérateur: operatorKey(r) || "Non renseigné",
        "Plateforme / Support": testCatalogLabel(r.platform || r.support || ""),
        "Moyen de paiement": r.payment_operator || "",
        "Montant engagé / F CFA": toMoneyNumber(r.amount_fcfa),
        "Montant retourné (F CFA)": "",
        Validation: validationLabel(r.validation_status),
        Notes: r.notes || "",
      })),
    ];
  }

  return {
    csv: buildCsv(rows, columns),
    filename,
    rowCount: rows.length,
    summary,
  };
}

export function triggerOpenReportCsvDownload(snapshot: ReportSnapshot) {
  const result = buildOpenReportCsv(snapshot);
  if (result.rowCount === 0) {
    throw new Error("Aucune donnée trouvée pour cette période.");
  }
  downloadCsv(result.filename, result.csv);
  return result;
}

export async function exportOpenReportPDF(
  snapshot: ReportSnapshot,
  pdfExporter = exportStyledPDF,
) {
  const summary = resolveSnapshotSummary(snapshot);
  const scope = snapshot.filters.scope || "all";
  const { slug, title } = resolveScopeMeta(scope);
  const filename = buildReportFilename(
    slug,
    snapshot.filters.period.start,
    snapshot.filters.period.end,
    "pdf",
  );
  const operatorSummary = resolveOperatorSummary(snapshot);
  const generatedLabel = formatBamakoDateTime(new Date(snapshot.generatedAt));

  let columns: PDFColumnDef[] = [];
  let data: Record<string, any>[] = [];

  if (scope === "bets") {
    columns = [
      { header: "N°", key: "index", align: "center" },
      { header: "Date", key: "date", align: "center" },
      { header: "Heure", key: "time", align: "center" },
      { header: "Opérateur", key: "operator", align: "left" },
      { header: "Support", key: "support", align: "center" },
      { header: "Type", key: "bet_type", align: "center" },
      { header: "Montant engagé", key: "amount_fcfa", align: "right", isCurrency: true },
      { header: "Statut", key: "validation_status", align: "center", isStatus: true },
      { header: "Référence", key: "reference", align: "left" },
    ];
    data = summary.tests.map((r: ReportRow, idx: number) => ({
      index: idx + 1,
      date: r.date?.slice(0, 10) || "",
      time: r.time || "—",
      operator: operatorKey(r) || "Non renseigné",
      support: testCatalogLabel(r.support || "") || "—",
      bet_type: testCatalogLabel(r.bet_type || "") || "—",
      amount_fcfa: toMoneyNumber(r.amount_fcfa),
      validation_status: validationLabel(r.validation_status),
      reference: readRecordReference(r as any).reference || r.id,
    }));
  } else if (scope === "transactions") {
    columns = [
      { header: "N°", key: "index", align: "center" },
      { header: "Date", key: "date", align: "center" },
      { header: "Heure", key: "time", align: "center" },
      { header: "Opérateur", key: "operator", align: "left" },
      { header: "Plateforme", key: "platform", align: "center" },
      { header: "Paiement", key: "payment_operator", align: "center" },
      { header: "Type", key: "type", align: "center", isStatus: true },
      { header: "Montant F CFA", key: "amount_fcfa", align: "right", isCurrency: true },
      { header: "Référence", key: "reference", align: "left" },
    ];
    data = summary.transactions.map((r: ReportRow, idx: number) => ({
      index: idx + 1,
      date: r.date?.slice(0, 10) || "",
      time: r.time || "—",
      operator: operatorKey(r) || "Non renseigné",
      platform: testCatalogLabel(r.platform || r.support || "") || "—",
      payment_operator: r.payment_operator || "—",
      type: r.type || "—",
      amount_fcfa: toMoneyNumber(r.amount_fcfa),
      reference: readRecordReference(r as any).reference || r.id,
    }));
  } else {
    columns = [
      { header: "N°", key: "index", align: "center" },
      { header: "Catégorie", key: "category", align: "center", isStatus: true },
      { header: "Date", key: "date", align: "center" },
      { header: "Heure", key: "time", align: "center" },
      { header: "Opérateur", key: "operator", align: "left" },
      { header: "Plateforme", key: "support", align: "center" },
      { header: "Montant F CFA", key: "amount_fcfa", align: "right", isCurrency: true },
      { header: "Statut", key: "validation_status", align: "center", isStatus: true },
      { header: "Référence", key: "reference", align: "left" },
    ];
    const combined = [
      ...summary.tests.map((r: ReportRow) => ({ kind: "Test", r })),
      ...summary.transactions.map((r: ReportRow) => ({ kind: r.type || "Transaction", r })),
    ];
    data = combined.map(({ kind, r }, idx: number) => ({
      index: idx + 1,
      category: kind,
      date: r.date?.slice(0, 10) || "",
      time: r.time || "—",
      operator: operatorKey(r) || "Non renseigné",
      support: testCatalogLabel(r.platform || r.support || "") || "—",
      amount_fcfa: toMoneyNumber(r.amount_fcfa),
      validation_status: validationLabel(r.validation_status),
      reference: readRecordReference(r as any).reference || r.id,
    }));
  }

  if (data.length === 0) {
    throw new Error("Aucune donnée trouvée pour cette période.");
  }

  await pdfExporter({
    title: buildReportTitle(title, snapshot.filters.period.label),
    subtitle: `Généré le ${generatedLabel} (Africa/Bamako) • ${data.length} ligne(s)`,
    operator: operatorSummary,
    periodText: `${snapshot.filters.period.label} (${snapshot.filters.period.start} → ${snapshot.filters.period.end})`,
    columns,
    data,
    filename,
    showTotals: true,
    orientation: "landscape",
  });

  return { filename, rowCount: data.length, summary };
}
