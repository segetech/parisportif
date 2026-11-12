import ExcelJS from "exceljs";
import { addNativeCharts, type NativeChart } from "./report-charts";
import { aggregateReport, numericMoney, moneyCents, operatorKey, type ReportRow, type ReportSnapshot } from "./open-report-data";
import { testCatalogLabel, testStatusLabel, HISTORICAL_RESULT_NOTICE } from "./test-vocabulary";

const GREEN = "006B2D", GOLD = "FFD000", RED = "C43636", INK = "173B28", PALE = "EFF6F0";
const MONEY = '#,##0.00 "FCFA"';
type Column = { title: string; value: (r: ReportRow) => ExcelJS.CellValue; money?: boolean; date?: boolean; width?: number };
const safe = (value: unknown): string => { const text = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""); return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text; };
const money = (value: unknown) => { const cents = moneyCents(value); return cents === null ? null : numericMoney(cents); };
const dateValue = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : null;
const validationLabel = (s: unknown) => ({ valide: "Validé", en_attente: "En attente", refuse: "Refusé" }[String(s)] || "Non renseigné");
const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`;
const ref = (sheet: string, range: string) => `${quoted(sheet)}!${range}`;

export function reportSheetNames(operators: string[]): Map<string, string> {
  const used = new Set(["synthèse", "tous les tests", "dépôts", "retraits", "contrôles & anomalies", "sites", "paramètres du rapport", "history"]);
  const names = new Map<string, string>();
  for (const operator of operators) {
    const clean = (operator || "Non renseigné").replace(/[\\/:*?\[\]\u0000-\u001f]/g, " ").replace(/^'+|'+$/g, "").trim() || "Opérateur";
    let suffix = "", index = 1, name = "";
    do { name = clean.slice(0, 31 - suffix.length).replace(/[\uD800-\uDBFF]$/, "") + suffix; suffix = ` (${++index})`; } while (used.has(name.toLocaleLowerCase("fr")));
    used.add(name.toLocaleLowerCase("fr")); names.set(operator, name);
  }
  return names;
}

function setupSheet(workbook: ExcelJS.Workbook, name: string, title: string, snapshot: ReportSnapshot, columns = 12) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 6, showGridLines: false }], pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.properties.defaultRowHeight = 21;
  for (let col = 1; col <= Math.max(12, columns); col++) sheet.getColumn(col).width = 14;
  sheet.mergeCells(1, 1, 2, Math.max(12, columns));
  sheet.getCell("A1").value = safe(`OPEN — ${title}`);
  sheet.getCell("A1").font = { name: "Calibri", size: 22, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.mergeCells(3, 1, 3, Math.max(12, columns)); sheet.getCell("A3").value = snapshot.filters.period.label;
  sheet.getCell("A3").font = { name: "Calibri", size: 13, bold: true, color: { argb: INK } };
  sheet.mergeCells(4, 1, 4, Math.max(12, columns));
  const opLabel = snapshot.filters.operators && snapshot.filters.operators.length > 0
    ? snapshot.filters.operators.join(", ")
    : (snapshot.filters.operator || "Tous");
  sheet.getCell("A4").value = safe(`Opérateur : ${opLabel} • Périmètre : ${snapshot.filters.scope === "bets" ? "Tests" : snapshot.filters.scope === "transactions" ? "Transactions" : "Tests et transactions"} • Généré le ${new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Bamako", dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.generatedAt))}`);
  sheet.getCell("A4").alignment = { wrapText: true }; sheet.getRow(4).height = 30;
  sheet.pageSetup.printTitlesRow = "1:6";
  sheet.headerFooter.oddFooter = "OPEN | &A | Page &P / &N";
  return sheet;
}
function header(sheet: ExcelJS.Worksheet, row: number, labels: string[], column = 1) {
  labels.forEach((label, i) => { const cell = sheet.getCell(row, column + i); cell.value = label ? safe(label) : null; cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } }; cell.alignment = { wrapText: true, vertical: "middle" }; });
  sheet.getRow(row).height = 34;
}
function table(sheet: ExcelJS.Worksheet, rows: ReportRow[], columns: Column[], startRow = 6, filter = false) {
  header(sheet, startRow, columns.map(c => c.title));
  columns.forEach((col, i) => { sheet.getColumn(i + 1).width = col.width || 21; });
  rows.forEach((record, index) => {
    const row = sheet.getRow(startRow + index + 1);
    columns.forEach((col, i) => {
      const cell = row.getCell(i + 1), raw = col.value(record);
      cell.value = raw === "" ? null : typeof raw === "string" ? safe(raw) : raw;
      cell.font = { name: "Calibri", size: 11, color: { argb: INK } };
      cell.alignment = { vertical: "top", wrapText: true, horizontal: col.date ? "center" : col.money ? "right" : "left" };
      if (col.money) cell.numFmt = MONEY;
      if (col.date) cell.numFmt = "dd/mm/yyyy";
      if (index % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE } };
    });
    row.height = 30;
  });
  const end = startRow + rows.length;
  if (filter) sheet.autoFilter = { from: { row: startRow, column: 1 }, to: { row: Math.max(startRow, end), column: columns.length } };
  const total = end + 1;
  sheet.getCell(total, 1).value = rows.length ? `TOTAL — ${rows.length} ligne(s)` : "Aucune donnée pour cette période";
  sheet.getCell(total, 1).font = { bold: true, color: { argb: GREEN } };
  columns.forEach((col, index) => { if (col.money) { const values = rows.map(r => moneyCents(col.value(r)) ?? 0n); const amount = numericMoney(values.reduce((s, v) => s + v, 0n)); const letter = sheet.getColumn(index + 1).letter; sheet.getCell(total, index + 1).value = rows.length ? { formula: `SUM(${letter}${startRow + 1}:${letter}${end})`, result: amount } : 0; sheet.getCell(total, index + 1).numFmt = MONEY; sheet.getCell(total, index + 1).font = { bold: true }; } });
  return { first: startRow + 1, end: Math.max(startRow + 1, end), total };
}

export async function buildOpenReport(snapshot: ReportSnapshot): Promise<{ bytes: Uint8Array; filename: string; operators: Map<string, string>; summary: ReturnType<typeof aggregateReport> }> {
  const activeOperatorFilter = snapshot.filters.operators && snapshot.filters.operators.length > 0
    ? snapshot.filters.operators
    : (snapshot.filters.operator || undefined);
  const summary = aggregateReport(snapshot, snapshot.filters.period, activeOperatorFilter);
  const operators = [...new Set([...summary.tests, ...summary.transactions, ...summary.anomalies].map(operatorKey))].sort((a, b) => a.localeCompare(b, "fr") || (a < b ? -1 : 1));
  if (operators.length > 200) throw new Error("Plus de 200 opérateurs : filtrez le rapport pour préserver sa lisibilité.");
  const names = reportSheetNames(operators), charts: NativeChart[] = [];
  const workbook = new ExcelJS.Workbook(); workbook.creator = "OPEN"; workbook.created = new Date(snapshot.generatedAt); workbook.calcProperties.fullCalcOnLoad = true;
  const synthesis = setupSheet(workbook, "Synthèse", "Rapport d’activité", snapshot);
  synthesis.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  const people = new Map(snapshot.people.map(p => [p.id, [p.prenom, p.nom].filter(Boolean).join(" ")]));
  const sites = new Map(snapshot.sites.map(s => [s.id, s]));
  const person = (id: string) => id ? people.get(id) || `Identifiant : ${id}` : "Non renseigné";
  const site = (r: ReportRow) => { const linked = sites.get(r.venue_id); return linked ? `${linked.quartier} — ${linked.address}` : r.venue_id ? "Site non accessible" : "Non renseigné"; };
  const testColumns: Column[] = [
    { title: "Référence", value: r => r.reference || r.id, width: 28 }, { title: "Date du test", value: r => dateValue(r.date), date: true, width: 14 }, { title: "Heure", value: r => r.time || "", width: 11 }, { title: "Opérateur", value: r => operatorKey(r) || "Non renseigné", width: 26 }, { title: "Support", value: r => testCatalogLabel(r.support || "") }, { title: "Type de test", value: r => testCatalogLabel(r.bet_type || "") }, { title: "Montant engagé", value: r => money(r.amount_fcfa), money: true }, { title: "Montant retourné", value: r => money(r.amount_won_fcfa), money: true }, { title: "Issue historique", value: r => testStatusLabel(r.status) }, { title: "Validation actuelle", value: r => validationLabel(r.validation_status) }, { title: "Agent", value: r => person(r.created_by) }, { title: "Site lié", value: site, width: 35 }, { title: "Observations", value: r => r.notes || "", width: 40 },
  ];
  const txColumns: Column[] = [
    { title: "Référence", value: r => r.reference || r.id, width: 28 }, { title: "Date de l’opération", value: r => dateValue(r.date), date: true, width: 14 }, { title: "Heure", value: r => r.time || "", width: 11 }, { title: "Opérateur", value: r => operatorKey(r) || "Non renseigné", width: 26 }, { title: "Support", value: r => testCatalogLabel(r.support || r.platform || "") }, { title: "Moyen de paiement", value: r => r.payment_operator || "Non renseigné" }, { title: "Montant", value: r => money(r.amount_fcfa), money: true }, { title: "Validation actuelle", value: r => validationLabel(r.validation_status) }, { title: "Agent", value: r => person(r.created_by) }, { title: "Site lié", value: site, width: 35 }, { title: "Observations", value: r => r.notes || "", width: 40 },
  ];
  const testSheet = setupSheet(workbook, "Tous les tests", "Tous les tests", snapshot, testColumns.length);
  const testRange = table(testSheet, summary.tests, testColumns, 6, true);
  const depositSheet = setupSheet(workbook, "Dépôts", "Dépôts", snapshot);
  const depositRange = table(depositSheet, summary.deposits, txColumns, 6, true);
  const withdrawalSheet = setupSheet(workbook, "Retraits", "Retraits", snapshot);
  const withdrawalRange = table(withdrawalSheet, summary.withdrawals, txColumns, 6, true);

  function metrics(sheet: ExcelJS.Worksheet, stats: typeof summary) {
    const items = [["Tests", stats.tests.length], ["Engagé renseigné", stats.engaged], ["Retourné renseigné", stats.returned], ["Dépôts renseignés", stats.depositAmount], ["Retraits renseignés", stats.withdrawalAmount], ["Solde des flux connus", stats.balance]] as const;
    items.forEach(([label, value], i) => { const col = i * 2 + 1; sheet.mergeCells(6, col, 6, col + 1); sheet.mergeCells(7, col, 8, col + 1); const title = sheet.getCell(6, col); title.value = label; title.font = { name: "Calibri", size: 11, bold: true, color: { argb: INK } }; title.alignment = { wrapText: true }; const cell = sheet.getCell(7, col); cell.value = value; cell.font = { name: "Calibri", size: 19, bold: true, color: { argb: GREEN } }; if (i) cell.numFmt = MONEY; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE } }; cell.alignment = { vertical: "middle", horizontal: "left" }; });
    sheet.getRow(6).height = 34;
    sheet.mergeCells("A9:L9"); sheet.getCell("A9").value = `Dépôts : ${stats.deposits.length} • Retraits : ${stats.withdrawals.length} • Retours inconnus : ${stats.unknownReturned} • Transactions sans montant : ${stats.unknownTransactionAmounts}`;
    sheet.getCell("A9").alignment = { wrapText: true }; sheet.getRow(9).height = 30;
    sheet.mergeCells("A10:L10"); sheet.getCell("A10").value = `Validation actuelle (tests + transactions) : ${stats.validation.valide} validé(s), ${stats.validation.en_attente} en attente, ${stats.validation.refuse} refusé(s), ${stats.validation.autre} non renseigné(s). Signalements : ${snapshot.role === "AGENT" ? "hors périmètre d’accès" : stats.anomalies.length}`; sheet.getCell("A10").alignment = { wrapText: true }; sheet.getRow(10).height = 30;
  }
  const dailyTable = (sheet: ExcelJS.Worksheet, stats: typeof summary, start = 12) => {
    header(sheet, start, ["Date", "Tests", "Dépôts (FCFA)", "Retraits (FCFA)", "Jour"]);
    stats.daily.forEach((d, i) => { const row = start + i + 1; sheet.getCell(row, 1).value = dateValue(d.date); sheet.getCell(row, 1).numFmt = "dd/mm/yyyy"; sheet.getCell(row, 2).value = d.tests; sheet.getCell(row, 3).value = d.deposits; sheet.getCell(row, 4).value = d.withdrawals; sheet.getCell(row, 3).numFmt = MONEY; sheet.getCell(row, 4).numFmt = MONEY; sheet.getCell(row, 5).value = `${d.date.slice(8)}/${d.date.slice(5, 7)}`; });
    return { first: start + 1, last: start + stats.daily.length };
  };
  const dailyChart = (sheet: ExcelJS.Worksheet, stats: typeof summary, range: { first: number; last: number }, row: number, column: number, activity = false) => {
    charts.push({ sheetId: sheet.id, title: activity ? "Tests par jour" : "Dépôts et retraits par jour", kind: activity ? "line" : "bar", row, column, unit: activity ? "Nombre de tests" : "FCFA", categories: { formula: ref(sheet.name, `$E$${range.first}:$E$${range.last}`), values: stats.daily.map(d => `${d.date.slice(8)}/${d.date.slice(5, 7)}`) }, series: activity ? [{ name: "Tests", formula: ref(sheet.name, `$B$${range.first}:$B$${range.last}`), values: stats.daily.map(d => d.tests), color: GREEN }] : [{ name: "Dépôts", formula: ref(sheet.name, `$C$${range.first}:$C$${range.last}`), values: stats.daily.map(d => d.deposits), color: GREEN }, { name: "Retraits", formula: ref(sheet.name, `$D$${range.first}:$D$${range.last}`), values: stats.daily.map(d => d.withdrawals), color: GOLD }] });
  };
  metrics(synthesis, summary);
  // Link the headline monetary values to the detailed totals (with cached results).
  synthesis.getCell("C7").value = { formula: ref(testSheet.name, `G${testRange.total}`), result: summary.engaged };
  synthesis.getCell("E7").value = { formula: ref(testSheet.name, `H${testRange.total}`), result: summary.returned };
  synthesis.getCell("G7").value = { formula: ref(depositSheet.name, `G${depositRange.total}`), result: summary.depositAmount };
  synthesis.getCell("I7").value = { formula: ref(withdrawalSheet.name, `G${withdrawalRange.total}`), result: summary.withdrawalAmount };
  synthesis.getCell("K7").value = { formula: "G7-I7", result: summary.balance };
  const dailyRange = dailyTable(synthesis, summary);
  summary.daily.forEach((d, i) => { const row = i + 13; const dateCell = `A${row}`; synthesis.getCell(row, 2).value = { formula: `COUNTIFS(${ref(testSheet.name, `$B$${testRange.first}:$B$${testRange.end}`)},${dateCell})`, result: d.tests }; synthesis.getCell(row, 3).value = { formula: `SUMIFS(${ref(depositSheet.name, `$G$${depositRange.first}:$G$${depositRange.end}`)},${ref(depositSheet.name, `$B$${depositRange.first}:$B$${depositRange.end}`)},${dateCell})`, result: d.deposits }; synthesis.getCell(row, 4).value = { formula: `SUMIFS(${ref(withdrawalSheet.name, `$G$${withdrawalRange.first}:$G$${withdrawalRange.end}`)},${ref(withdrawalSheet.name, `$B$${withdrawalRange.first}:$B$${withdrawalRange.end}`)},${dateCell})`, result: d.withdrawals }; });
  const operatorStats = operators.map(operator => ({ operator, stats: aggregateReport({ ...snapshot, tests: summary.tests, transactions: summary.transactions, anomalies: summary.anomalies }, snapshot.filters.period, operator) }));
  header(synthesis, 12, ["Opérateur", "Tests", "Engagé", "Retourné", "Dépôts", "Retraits"], 7);
  operatorStats.forEach(({ operator, stats }, i) => { const row = synthesis.getRow(i + 13); row.height = Math.max(24, Math.ceil((operator || "Non renseigné").length / 18) * 16); row.getCell(7).alignment = { wrapText: true, vertical: "top" }; row.getCell(7).value = { text: safe(operator || "Non renseigné"), hyperlink: `#${quoted(names.get(operator)!)}!A1` }; [stats.tests.length, stats.engaged, stats.returned, stats.depositAmount, stats.withdrawalAmount].forEach((v, j) => { row.getCell(j + 8).value = v; if (j) row.getCell(j + 8).numFmt = MONEY; }); });
  const chartStart = Math.max(dailyRange.last, operatorStats.length + 12) + 3;
  dailyChart(synthesis, summary, dailyRange, chartStart, 0, true); dailyChart(synthesis, summary, dailyRange, chartStart, 6);
  const comparisons = [...operatorStats].sort((a, b) => b.stats.tests.length - a.stats.tests.length).slice(0, 12).map(o => ({ name: o.operator || "Non renseigné", count: o.stats.tests.length }));
  if (operators.length > 12) comparisons.push({ name: "Autres opérateurs", count: [...operatorStats].sort((a, b) => b.stats.tests.length - a.stats.tests.length).slice(12).reduce((s, o) => s + o.stats.tests.length, 0) });
  if (!comparisons.length) comparisons.push({ name: "Aucune donnée", count: 0 });
  const supportRow = chartStart + 39;
  header(synthesis, supportRow, ["Comparaison des opérateurs", "Nombre de tests", "", "Validation actuelle", "Nombre"]);
  comparisons.forEach((c, i) => { synthesis.getCell(supportRow + i + 1, 1).value = safe(c.name); synthesis.getCell(supportRow + i + 1, 2).value = c.count; });
  const validationLabels = ["Validés", "En attente", "Refusés", "Non renseignés"], validationCounts = Object.values(summary.validation);
  validationLabels.forEach((label, i) => { synthesis.getCell(supportRow + i + 1, 4).value = label; synthesis.getCell(supportRow + i + 1, 5).value = validationCounts[i]; });
  charts.push({ sheetId: synthesis.id, title: operators.length > 12 ? "Tests — 12 opérateurs + autres" : "Tests par opérateur", kind: "bar", row: chartStart + 19, unit: "Nombre de tests", categories: { formula: ref(synthesis.name, `$A$${supportRow + 1}:$A$${supportRow + comparisons.length}`), values: comparisons.map(c => c.name) }, series: [{ name: "Tests", color: GREEN, formula: ref(synthesis.name, `$B$${supportRow + 1}:$B$${supportRow + comparisons.length}`), values: comparisons.map(c => c.count) }] });
  charts.push({ sheetId: synthesis.id, title: "Validation actuelle — tests et transactions", kind: "bar", row: chartStart + 19, column: 6, unit: "Nombre d’opérations", categories: { formula: ref(synthesis.name, `$D$${supportRow + 1}:$D$${supportRow + 4}`), values: validationLabels }, series: [{ name: "Opérations", color: GREEN, formula: ref(synthesis.name, `$E$${supportRow + 1}:$E$${supportRow + 4}`), values: validationCounts }] });
  for (const { operator, stats } of operatorStats) {
    const sheet = setupSheet(workbook, names.get(operator)!, operator || "Non renseigné", snapshot, 13); metrics(sheet, stats);
    const range = dailyTable(sheet, stats); const start = range.last + 2; dailyChart(sheet, stats, range, start, 0); charts[charts.length - 1].width = 12;
    let row = start + 21;
    sheet.getCell(row, 1).value = "TESTS"; row = table(sheet, stats.tests, testColumns, row + 1).total + 3;
    sheet.getCell(row, 1).value = "DÉPÔTS"; row = table(sheet, stats.deposits, txColumns, row + 1).total + 3;
    sheet.getCell(row, 1).value = "RETRAITS"; table(sheet, stats.withdrawals, txColumns, row + 1);
    for (let col = 1; col <= 12; col++) sheet.getColumn(col).width = 18;
    sheet.getColumn(13).width = 34;
  }
  const controls = setupSheet(workbook, "Contrôles & anomalies", "Contrôles actuels et signalements", snapshot);
  const controlRows = [...summary.tests.map(r => ({ ...r, report_entity: "Test", report_nature: "Validation actuelle" })), ...summary.transactions.map(r => ({ ...r, report_entity: "Transaction", report_nature: "Validation actuelle" })), ...summary.anomalies.map(r => ({ ...r, report_nature: "Signalement" }))];
  table(controls, controlRows, [{ title: "Élément", value: r => r.report_entity }, { title: "Référence", value: r => r.reference || r.id }, { title: "Opérateur", value: r => operatorKey(r) || "Non renseigné" }, { title: "Date métier", value: r => dateValue(r.date), date: true }, { title: "Nature", value: r => r.report_nature }, { title: "Validation actuelle", value: r => r.report_nature === "Signalement" ? "Signalé (historique)" : validationLabel(r.validation_status) }, { title: "Motif / observation", value: r => r.validation_notes || r.reject_reason || r.notes || "", width: 40 }, { title: "Contrôleur", value: r => person(r.validated_by || r.reviewed_by) }, { title: "Date de décision", value: r => dateValue(r.validated_at || r.reviewed_at), date: true }], 6, true);
  const siteSheet = setupSheet(workbook, "Sites", "Sites effectivement liés aux opérations", snapshot);
  const linked = new Set([...summary.tests, ...summary.transactions].map(r => r.venue_id).filter(Boolean));
  table(siteSheet, snapshot.sites.filter(s => linked.has(s.id)), [{ title: "Identifiant", value: r => r.id, width: 38 }, { title: "Quartier", value: r => r.quartier }, { title: "Opérateur", value: r => operatorKey(r) || "Non renseigné" }, { title: "Localisation", value: r => r.address, width: 45 }, { title: "Types de test", value: r => (r.games || [r.bet_type]).filter(Boolean).map(testCatalogLabel).join(", "), width: 40 }], 6, true);
  const params = setupSheet(workbook, "Paramètres du rapport", "Paramètres et définitions", snapshot);
  const definitions: [string, unknown][] = [
    ["Mois / année", `${snapshot.filters.period.month}/${snapshot.filters.period.year}`], ["Tranche", snapshot.filters.period.tranche], ["Début inclus", snapshot.filters.period.start], ["Fin incluse", snapshot.filters.period.end], ["Fuseau", "Africa/Bamako (UTC+0)"], ["Généré le", snapshot.generatedAt], ["Opérateur", snapshot.filters.operator || "Tous"], ["Validation", snapshot.filters.validation ? validationLabel(snapshot.filters.validation) : "Toutes"], ["Type de transaction", snapshot.filters.transactionType || "Dépôts et retraits"], ["Périmètre", snapshot.filters.scope || "all"], ["Compte / rôle", `${snapshot.userId} / ${snapshot.role}`], ["Accès", snapshot.role === "AGENT" ? "Opérations créées par ce compte ; RLS appliquée" : "Données autorisées par les règles RLS"], ["Date des données", "Tests et transactions : date de l’opération (date), pas created_at. Signalements : date de l’événement."], ["Contrôles", "État actuel des opérations de la période ; pas un historique des décisions ni un filtre sur la date de décision."], ["Anomalies", snapshot.role === "AGENT" ? "Signalements hors périmètre d’accès ; aucune absence d’anomalie n’est déduite." : "Signalements enregistrés dans les tables dédiées, séparés des validations en attente."], ["Montants", "Sommes en centimes exacts, affichées en FCFA. Les valeurs absentes restent vides ; seuls les montants renseignés sont totalisés."], ["Retours inconnus", summary.unknownReturned], ["Transactions sans montant", summary.unknownTransactionAmounts], ["Solde des flux", "Dépôts renseignés moins retraits renseignés. Ce solde n’est pas un bénéfice."], ["Double comptage", "Les feuilles opérateurs reprennent les détails ; elles ne sont pas ajoutées aux totaux généraux. Les montants des tests ne sont pas additionnés aux dépôts."], ["Sites non renseignés", [...summary.tests, ...summary.transactions].filter(r => !r.venue_id).length], ["Liens de site non accessibles", [...linked].filter(id => !sites.has(id)).length], ["Affectation aux sites", "Uniquement venue_id explicitement enregistré ; aucune déduction à partir de l’opérateur."], ["Identités", "Noms autorisés si accessibles, sinon identifiants. Téléphones, secrets et liens de justificatifs exclus."], ["Historique", HISTORICAL_RESULT_NOTICE], ["Graphiques", "Graphiques Excel natifs, modifiables, sans lien externe. Sources dans les tableaux du classeur. Tous les jours de la tranche sont affichés."], ["Comparaison opérateurs", "Tous les opérateurs figurent dans le tableau ; au-delà de 12, le graphique regroupe les suivants dans Autres opérateurs."], ["Instantané", "Lecture paginée à la génération. Les écritures simultanées peuvent nécessiter de relancer le rapport."],
  ];
  header(params, 6, ["Paramètre", "Valeur / définition"]); params.getColumn(1).width = 38; params.getColumn(2).width = 110;
  definitions.forEach(([label, value], i) => { params.getCell(i + 7, 1).value = label; params.getCell(i + 7, 2).value = typeof value === "number" ? value : safe(value); params.getCell(i + 7, 2).alignment = { wrapText: true, vertical: "top" }; params.getRow(i + 7).height = 42; });
  const mappingRow = definitions.length + 9; header(params, mappingRow, ["Feuille", "Nom complet / contenu"]);
  workbook.worksheets.filter(s => ![...names.values()].includes(s.name)).forEach((s, i) => { params.getCell(mappingRow + i + 1, 1).value = { text: s.name, hyperlink: `#${quoted(s.name)}!A1` }; });
  [...names].forEach(([operator, sheet], i) => { const row = mappingRow + 8 + i; params.getCell(row, 1).value = { text: safe(sheet), hyperlink: `#${quoted(sheet)}!A1` }; params.getCell(row, 2).value = safe(operator || "Non renseigné"); });
  const original = await workbook.xlsx.writeBuffer();
  const bytes = await addNativeCharts(new Uint8Array(original), charts);
  return { bytes, filename: `OPEN_rapport_${snapshot.filters.period.start}_${snapshot.filters.period.end}.xlsx`, operators: names, summary };
}
