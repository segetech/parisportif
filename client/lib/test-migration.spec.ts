import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";
import { buildImportTemplate } from "./excel-export";
import { detectImportEntity, parseBetRow, parseTransactionRow, parseVenuesGrouped } from "./excel-import-engine";
import { testCatalogLabel, testStatusLabel } from "./test-vocabulary";
import { venueFormSchema } from "@/schemas/venue";
import { fetchExportData } from "./exports";

vi.mock("@/data/api", () => ({ default: { bets: { list: vi.fn(async () => [{ id: "historical-export", date: "2026-11-12", time: "10:30", operator: "Opérateur X", support: "Salle de jeux", bet_type: "Paris sportifs (Live)", amount_fcfa: 2500, amount_won_fcfa: 5000, phone: "0700000000", reference: "EXPORT-001", status: "gagné" }]) } } }));

describe("Test naming and existing import compatibility", () => {
  it("exports real amounts, category, reference and phone under Test labels", async () => {
    const rows = await fetchExportData("bets", "Opérateur X", "2026-11-01", "2026-11-30");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ bet_type: "Tests (Live)", support: "Site de test", amount_fcfa: 2500, amount_won_fcfa: 5000, reference: "EXPORT-001", phone: "0700000000", status: "Issue favorable" });
    expect(Object.keys(rows[0]).join(" ")).not.toContain("pari");
  });
  it.each(["Salle de jeux", "Site de test"])("accepts site support %s with the existing persistence contract", (support) => {
    expect(venueFormSchema.parse({ quartier: "Centre", operator: "Opérateur X", support, bet_type: "Test fonctionnel", address: "Site A" }).support).toBe("Salle de jeux");
  });
  it.each(["tests", "pari"] as const)("generates a real readable Test workbook for %s", async (type) => {
    const { buffer, filename, sheetName } = await buildImportTemplate(type);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    const row: Record<string, string> = {};
    sheet.getRow(1).eachCell((cell, column) => { row[cell.text] = sheet.getRow(2).getCell(column).text; });
    expect(filename).toBe("modele_officiel_tests.xlsx");
    expect(sheetName).toBe("Tests");
    expect(detectImportEntity(sheet.name)).toBe("pari");
    expect(Object.keys(row).join(" ")).not.toMatch(/pari|ticket|gagné/i);
    const result = parseBetRow(row, 2, "2026-11-12");
    expect(result.isValid).toBe(true);
    expect(result.betType).toBe("Test fonctionnel");
    expect(result.reference).toBe("CI250326.0438.B13742");
    expect(result.amount).toBe(1000);
    expect(result.amountWon).toBe(3500);
    // Historical storage code stays compatible; no invented conformity verdict.
    expect(result.status).toBe("gagné");
  });

  it("still parses historical headers and values without altering money or references", () => {
    const result = parseBetRow({ "Opérateur de jeux": "1xBet", Support: "En ligne", "Type de Pari": "Casino", Montant: "2500F", Heure: "10h30", Référence: "LEGACY-001", statut: "gagné", "montant gagné": "5000F" }, 2, "2026-11-12");
    expect(result.isValid).toBe(true);
    expect(result).toMatchObject({ operator: "1xBet", betType: "Casino", amount: 2500, amountWon: 5000, reference: "LEGACY-001", status: "gagné" });
  });

  it("preserves financial template round trips", async () => {
    const { buffer } = await buildImportTemplate("depotretrait");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    const row: Record<string, string> = {};
    sheet.getRow(1).eachCell((cell, col) => { row[cell.text] = sheet.getRow(2).getCell(col).text; });
    const result = parseTransactionRow(row, 2, "2026-11-12");
    expect(result.isValid).toBe(true);
    expect(result).toMatchObject({ amount: 1000, type: "Dépôt", reference: "CI250326.0438.B13742" });
  });

  it("preserves site template grouping", async () => {
    const { buffer } = await buildImportTemplate("salles");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(detectImportEntity(sheet.name)).toBe("salles");
    const row = sheet.getRow(2);
    const groups = parseVenuesGrouped([{ rowNumber: 2, no: row.getCell(1).text, quartier: row.getCell(2).text, operator: row.getCell(3).text, support: row.getCell(4).text, betType: row.getCell(5).text, localisation: row.getCell(6).text }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].games).toEqual(["Test fonctionnel"]);
    expect(groups[0].isValid).toBe(true);
  });

  it.each([["pari", "pari"], ["Tests", "pari"], ["Salle jeux", "salles"], ["Sites", "salles"], ["Dépôts & retraits", "depotretrait"]])("detects %s without changing persistent codes", (name, expected) => {
    expect(detectImportEntity(name)).toBe(expected);
  });

  it("adapts presentation without mutating stored historical values", () => {
    const record = { status: "gagné", bet_type: "Paris sportifs (Live)", support: "Salle de jeux" };
    expect(testStatusLabel(record.status)).toBe("Issue favorable");
    expect(testCatalogLabel(record.bet_type)).toBe("Tests (Live)");
    expect(testCatalogLabel(record.support)).toBe("Site de test");
    expect(record.status).toBe("gagné");
    expect(record.bet_type).toBe("Paris sportifs (Live)");
  });
});
