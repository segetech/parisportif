import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { reportPeriod, currentReportPeriod } from "./report-periods";
import { aggregateReport, fetchOpenReport, moneyCents, numericMoney, reportPages, type ReportSnapshot } from "./open-report-data";
import { buildOpenReport, reportSheetNames } from "./open-report-workbook";
import { isLegalOperator, operatorLegalityLabel } from "./operator-classification";

import { reportFixture } from "./open-report-fixture";

describe("four fixed reporting periods", () => {
  it.each([[2026, 2, 28], [2028, 2, 29], [2000, 2, 29], [2100, 2, 28], [2026, 4, 30], [2026, 12, 31]])("covers %s-%s exactly once (%s days)", (year, month, days) => {
    const periods = [1, 2, 3, 4].map(part => reportPeriod(year, month, part));
    const all = periods.flatMap(p => p.days);
    expect(all).toHaveLength(days); expect(new Set(all).size).toBe(days);
    expect(periods.map(p => Number(p.start.slice(8)))).toEqual([1, 8, 16, 23]);
    expect(periods.map(p => Number(p.end.slice(8)))).toEqual([7, 15, 22, days]);
    expect(periods[3].endExclusive).toBe(month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`);
  });
  it.each([[1, 1], [7, 1], [8, 2], [15, 2], [16, 3], [22, 3], [23, 4], [30, 4]])("selects the correct current tranche for day %s", (day, part) => {
    expect(currentReportPeriod(new Date(`2026-11-${String(day).padStart(2, "0")}T00:00:00Z`)).tranche).toBe(part);
  });
  it.each([[0, 1, 1], [2026, 0, 1], [2026, 13, 1], [2026, 1, 0], [2026, 1, 5], [NaN, 1, 1], [2026.1, 1, 1]])("rejects invalid parameters", (year, month, tranche) => expect(() => reportPeriod(year, month, tranche)).toThrow());
  it("uses Bamako dates even for an offset timestamp near midnight", () => {
    expect(currentReportPeriod(new Date("2026-11-08T00:30:00+02:00")).tranche).toBe(1);
  });
});

describe("production aggregation and pagination", () => {
  it("uses inclusive business dates, exact cents, and zero days without double counting", () => {
    const data = reportFixture(), result = aggregateReport(data, data.filters.period);
    expect(result.tests.map(r => r.id)).toEqual(["first", "last", "beta"]);
    expect(result.engaged).toBe(300.40); expect(result.returned).toBe(500.55);
    expect(result.depositAmount).toBe(1350.45); expect(result.withdrawalAmount).toBe(200.20); expect(result.balance).toBe(1150.25);
    expect(result.unknownReturned).toBe(1); expect(result.validation).toEqual({ valide: 1, en_attente: 5, refuse: 1, autre: 0 });
    expect(result.daily).toHaveLength(8); expect(result.daily.find(d => d.date === "2026-11-09")).toMatchObject({ tests: 0, deposits: 0, withdrawals: 0 });
    expect(aggregateReport(data, data.filters.period, "Alpha").tests).toHaveLength(2);
    expect(aggregateReport(data, data.filters.period, ["Alpha", "Bêta / Équipe très longue pour la feuille"]).tests).toHaveLength(3);
    expect(aggregateReport(data, data.filters.period, ["Bêta / Équipe très longue pour la feuille"]).tests).toHaveLength(1);
    expect(aggregateReport(data, data.filters.period, "").deposits).toHaveLength(1);

    // Classification et filtrage légaux / illégaux
    expect(isLegalOperator("1xBet")).toBe(true);
    expect(isLegalOperator("Bet223")).toBe(true);
    expect(isLegalOperator("PremierBet")).toBe(true);
    expect(isLegalOperator("MALIBET")).toBe(true);
    expect(isLegalOperator("PMU Mali")).toBe(true);
    expect(isLegalOperator("1WIN")).toBe(false);
    expect(isLegalOperator("Stake")).toBe(false);
    expect(isLegalOperator("Alpha")).toBe(false);

    expect(operatorLegalityLabel("1xBet")).toBe("Légal");
    expect(operatorLegalityLabel("1WIN")).toBe("Illégal");

    // Filtrage category dans aggregateReport
    const legalAgg = aggregateReport(data, data.filters.period, undefined, "legal");
    expect(legalAgg.tests.every(t => isLegalOperator(t.operator || ""))).toBe(true);

    const illegalAgg = aggregateReport(data, data.filters.period, undefined, "illegal");
    expect(illegalAgg.tests.every(t => !isLegalOperator(t.operator || ""))).toBe(true);
  });
  it("preserves unknown and zero money and rejects precision loss", () => {
    expect(moneyCents(null)).toBeNull(); expect(moneyCents(0)).toBe(0n);
    expect(numericMoney(moneyCents("0.10")! + moneyCents("0.20")!)).toBe(0.30);
    expect(() => moneyCents("NaN")).toThrow(); expect(() => numericMoney(9007199254740992n)).toThrow();
  });
  it("reads beyond 1000 rows even with a smaller hosted cap", async () => {
    const source = Array.from({ length: 1101 }, (_, i) => ({ id: `r${i}` }));
    const result = await reportPages(() => ({ order() { return this; }, range(from: number) { return Promise.resolve({ data: source.slice(from, from + 73), error: null }); } }));
    expect(result).toHaveLength(1101); expect(result[1100].id).toBe("r1100");
  });
  it("fails rather than downloading partial or repeated pages", async () => {
    let calls = 0;
    await expect(reportPages(() => ({ order() { return this; }, range() { return Promise.resolve(++calls === 1 ? { data: [{ id: "first" }], error: null } : { data: null, error: { message: "network" } }); } }))).rejects.toThrow("network");
    await expect(reportPages(() => ({ order() { return this; }, range() { return Promise.resolve({ data: [{ id: "same" }], error: null }); } }))).rejects.toThrow("changé");
  });
});

describe("the actual generated XLSX file", () => {
  it("contains all requested sheets, correct totals, safe texts and native charts with source references", async () => {
    const report = await buildOpenReport(reportFixture());
    const zip = await JSZip.loadAsync(report.bytes);
    expect(report.filename).toBe("OPEN_rapport_2026-11-08_2026-11-15.xlsx");
    const chartFiles = Object.keys(zip.files).filter(f => /^xl\/charts\/report\d+\.xml$/.test(f));
    expect(chartFiles).toHaveLength(7); // Four summary charts + three operators.
    for (const file of chartFiles) {
      const content = await zip.file(file)!.async("string");
      expect(content).toContain("<c:f>"); expect(content).not.toContain("externalData"); expect(content).not.toContain("NaN");
    }
    const firstChart = await zip.file(chartFiles[0])!.async("string");
    expect(firstChart).toContain("Tests par jour"); expect(firstChart).toContain("<c:ptCount val=\"8\"/>"); expect(firstChart).toContain("08/11"); expect(firstChart).toContain("15/11");
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(report.bytes as any);
    expect(wb.worksheets.map(s => s.name)).toEqual(["Synthèse", "Tous les tests", "Dépôts", "Retraits", ...report.operators.values(), "Contrôles & anomalies", "Sites", "Paramètres du rapport"]);
    const synthesis = wb.getWorksheet("Synthèse")!;
    expect(synthesis.getCell("C7").result).toBe(300.4); expect(synthesis.getCell("G7").result).toBe(1350.45); expect(synthesis.getCell("K7").result).toBe(1150.25);
    const tests = wb.getWorksheet("Tous les tests")!;
    expect(tests.getCell("A7").value).toBe("TEST-08"); expect(tests.getCell("B7").value).toEqual(new Date("2026-11-08T00:00:00Z"));
    expect(tests.getCell("H7").value).toBeNull(); expect(tests.getCell("M7").value).toBe('\'=HYPERLINK("https://example.invalid")');
    expect(wb.getWorksheet("Sites")!.getCell("A7").value).toBe("site-A"); expect(wb.getWorksheet("Sites")!.getCell("A8").value).not.toBe("unrelated");
    const shared = await zip.file("xl/sharedStrings.xml")!.async("string");
    expect(shared).not.toContain("Site sans lien"); expect(shared).not.toContain("999999");
    expect(Object.keys(zip.files).filter(f => /drawings\/_rels\/.*\.rels$/.test(f))).toHaveLength(4);
  });
  it("generates an empty, explicitly zero report without fake operators", async () => {
    const data = reportFixture(); data.tests = []; data.transactions = []; data.anomalies = [];
    const result = await buildOpenReport(data); expect(result.operators.size).toBe(0); expect(result.summary.balance).toBe(0);
    const zip = await JSZip.loadAsync(result.bytes); expect(Object.keys(zip.files).filter(f => /^xl\/charts\/report\d+\.xml$/.test(f))).toHaveLength(4);
  });
  it("creates deterministic unique sheet names, including reserved/colliding names", () => {
    const names = [...reportSheetNames(["Alpha/Beta", "Alpha:Beta", "synthèse", "HISTORY", "'", "A".repeat(40), "A".repeat(39) + "B"]).values()];
    expect(new Set(names.map(n => n.toLowerCase())).size).toBe(names.length);
    expect(names.every(n => n.length <= 31 && !/[\\/:*?\[\]]/.test(n))).toBe(true);
    expect(names).toEqual([...reportSheetNames(["Alpha/Beta", "Alpha:Beta", "synthèse", "HISTORY", "'", "A".repeat(40), "A".repeat(39) + "B"]).values()]);
  });
});
