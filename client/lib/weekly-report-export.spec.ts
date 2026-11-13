import { describe, expect, it } from "vitest";
import {
  buildWeeklyOfficialWorkbook,
  formatExcelHour,
  normalizeOperatorKey,
} from "./weekly-report-export";

describe("weekly-report-export", () => {
  it("normalizes operator aliases and formats Excel hours as 15H50", () => {
    expect(normalizeOperatorKey("Bet222")).toBe("BET223");
    expect(normalizeOperatorKey("BET233")).toBe("BET223");
    expect(normalizeOperatorKey("1xBet")).toBe("1XBET");
    expect(normalizeOperatorKey("Premier Bet")).toBe("PREMIERBET");

    expect(formatExcelHour("15:50:00")).toBe("15H50");
    expect(formatExcelHour("08:05")).toBe("08H05");
    expect(formatExcelHour("22H53")).toBe("22H53");
  });

  it("groups PARI and DEPOT-RETRAIT sheets into chronologically sorted operator blocks with subtotals and col B matrices", async () => {
    const startDate = "2026-01-16";
    const endDate = "2026-01-22";

    const bets = [
      {
        id: "b-bet223-late",
        date: "2026-01-20",
        time: "18:10:00",
        operator: "Bet223",
        support: "App mobile",
        bet_type: "Live Sport",
        amount_fcfa: 2000,
        phone: "84674233",
        notes: "REF-B223-2",
      },
      {
        id: "b-1x-late",
        date: "2026-01-21",
        time: "19:30:00",
        operator: "1xBet",
        support: "App mobile",
        bet_type: "FIFA",
        amount_fcfa: 1500,
        phone: "51351277",
        notes: "REF-1X-2",
      },
      {
        id: "b-premier",
        date: "2026-01-17",
        time: "12:08:00",
        operator: "PremierBet",
        support: "Site Web",
        bet_type: "Live Sport",
        amount_fcfa: 1000,
        phone: "98932544",
        notes: "REF-PB-1",
      },
      {
        id: "b-bet233-typo",
        date: "2026-01-18",
        time: "09:15:00",
        operator: "BET233",
        support: "App mobile",
        bet_type: "Live Sport",
        amount_fcfa: 2500,
        phone: "84674233",
        notes: "REF-B223-1",
      },
      {
        id: "b-1x-early",
        date: "2026-01-16",
        time: "15:50:00",
        operator: "1xBet",
        support: "App mobile",
        bet_type: "Live Sport",
        amount_fcfa: 2000,
        phone: "51351277",
        notes: "REF-1X-1",
      },
    ];

    const transactions = [
      {
        id: "t-bet233-retrait",
        date: "2026-01-19",
        time: "16:20:00",
        operator: "BET233",
        platform: "App mobile",
        payment_operator: "Orange Money",
        type: "Retrait",
        amount_fcfa: 5000,
        phone: "75123456",
        notes: "TX-B223-RET",
        proof_attachment_url: "https://example.com/proof1.png",
      },
      {
        id: "t-1x-depot",
        date: "2026-01-16",
        time: "14:05:00",
        operator: "1xBet",
        platform: "App mobile",
        payment_operator: "Moov Money",
        type: "Dépôt",
        amount_fcfa: 10000,
        phone: "65123456",
        notes: "TX-1X-DEP",
        proof_status: "non_disponible",
      },
      {
        id: "t-bet223-depot",
        date: "2026-01-17",
        time: "10:30:00",
        operator: "Bet223",
        platform: "App mobile",
        payment_operator: "Orange Money",
        type: "Dépôt",
        amount_fcfa: 15000,
        phone: "75123456",
        notes: "TX-B223-DEP",
        proof_status: "disponible",
      },
      {
        id: "t-1x-retrait",
        date: "2026-01-20",
        time: "21:45:00",
        operator: "1xBet",
        platform: "App mobile",
        payment_operator: "Moov Money",
        type: "Retrait",
        amount_fcfa: 4000,
        phone: "65123456",
        notes: "TX-1X-RET",
        proof: true,
      },
    ];

    const wb = await buildWeeklyOfficialWorkbook({
      startDate,
      endDate,
      bets,
      transactions,
      illegals: [],
      activeOperatorNames: ["1xBet", "Bet223", "PremierBet"],
    });

    // --- FEUILLE PARI ---
    const wsPari = wb.getWorksheet("PARI")!;
    expect(wsPari).toBeDefined();
    expect(wsPari.getCell("C1").value).toBe(
      "RAPPORT DE LA SEMAINE DU 16 AU 22 JANVIER",
    );
    expect(wsPari.getCell("C1").font?.name).toBe("Cambria");

    // Bloc 1: 1xBet (rows 3-4, chronological: 16/01 then 21/01)
    expect(wsPari.getCell("A3").value).toBe(1);
    expect(wsPari.getCell("B3").value).toBe("16/01/2026");
    expect(wsPari.getCell("C3").value).toBe("1xBet");
    expect(wsPari.getCell("G3").value).toBe("15H50");

    expect(wsPari.getCell("A4").value).toBe(2);
    expect(wsPari.getCell("B4").value).toBe("21/01/2026");
    expect(wsPari.getCell("C4").value).toBe("1xBet");
    expect(wsPari.getCell("G4").value).toBe("19H30");

    // Sous-total bloc 1xBet (row 5) + ligne vide (row 6)
    expect(wsPari.getCell("E5").value).toBe("TOTAL");
    expect(wsPari.getCell("F5").value).toEqual({
      formula: "SUM(F3:F4)",
      result: 3500,
    });
    expect(wsPari.getCell("A6").value).toBeNull();
    expect(wsPari.getCell("C6").value).toBeNull();

    // Bloc 2: Bet223 (incluant BET233 normalisé, N° recommence à 1, trié 18/01 puis 20/01)
    expect(wsPari.getCell("A7").value).toBe(1);
    expect(wsPari.getCell("B7").value).toBe("18/01/2026");
    expect(wsPari.getCell("C7").value).toBe("Bet223");
    expect(wsPari.getCell("G7").value).toBe("09H15");

    expect(wsPari.getCell("A8").value).toBe(2);
    expect(wsPari.getCell("B8").value).toBe("20/01/2026");
    expect(wsPari.getCell("C8").value).toBe("Bet223");
    expect(wsPari.getCell("E9").value).toBe("TOTAL");
    expect(wsPari.getCell("F9").value).toEqual({
      formula: "SUM(F7:F8)",
      result: 4500,
    });
    expect(wsPari.getCell("C10").value).toBeNull();

    // Bloc 3: PremierBet (N° recommence à 1)
    expect(wsPari.getCell("A11").value).toBe(1);
    expect(wsPari.getCell("B11").value).toBe("17/01/2026");
    expect(wsPari.getCell("C11").value).toBe("PremierBet");
    expect(wsPari.getCell("E12").value).toBe("TOTAL");
    expect(wsPari.getCell("F12").value).toEqual({
      formula: "SUM(F11:F11)",
      result: 1000,
    });

    // Intro en colonne A puis matrice en colonne B
    let pariMatrixHeaderRow = -1;
    for (let r = 13; r <= wsPari.rowCount; r++) {
      if (wsPari.getCell(`B${r}`).value === "DATE") {
        pariMatrixHeaderRow = r;
        break;
      }
    }
    expect(pariMatrixHeaderRow).toBeGreaterThan(13);
    expect(String(wsPari.getCell(`A${pariMatrixHeaderRow - 2}`).value)).toContain(
      "Récapitulatif clair et structuré",
    );
    expect(wsPari.getCell(`C${pariMatrixHeaderRow}`).value).toBe("1XBET");
    expect(wsPari.getCell(`D${pariMatrixHeaderRow}`).value).toBe("BET223");
    expect(wsPari.getCell(`E${pariMatrixHeaderRow}`).value).toBe("PREMIERBET");

    // --- FEUILLE DEPOT-RETRAIT ---
    const wsTx = wb.getWorksheet("DEPOT-RETRAIT")!;
    expect(wsTx).toBeDefined();
    expect(wsTx.getCell("C1").value).toBe(
      "RAPPORT DE LA SEMAINE DU 16 AU 22 JANVIER",
    );

    // Bloc 1: 1xBet (rows 3-4), N° 1..2, Dispo / Non Dispo
    expect(wsTx.getCell("A3").value).toBe(1);
    expect(wsTx.getCell("C3").value).toBe("1xBet");
    expect(wsTx.getCell("H3").value).toBe("14H05");
    expect(wsTx.getCell("K3").value).toBe("Non Dispo");

    expect(wsTx.getCell("A4").value).toBe(2);
    expect(wsTx.getCell("C4").value).toBe("1xBet");
    expect(wsTx.getCell("H4").value).toBe("21H45");
    expect(wsTx.getCell("K4").value).toBe("Dispo");

    // Deux lignes de sous-totaux pour 1xBet (rows 5-6) + ligne vide (row 7)
    expect(wsTx.getCell("F5").value).toBe("TOTAL DEPOT");
    expect(wsTx.getCell("G5").value).toEqual({
      formula: 'SUMIF(F3:F4,"Dépôt",G3:G4)',
      result: 10000,
    });
    expect(wsTx.getCell("F6").value).toBe("TOTAL RETRAIT");
    expect(wsTx.getCell("G6").value).toEqual({
      formula: 'SUMIF(F3:F4,"Retrait",G3:G4)',
      result: 4000,
    });
    expect(wsTx.getCell("C7").value).toBeNull();

    // Bloc 2: Bet223 (incluant BET233, N° recommence à 1, Dispo pour proof_path & proof_url)
    expect(wsTx.getCell("A8").value).toBe(1);
    expect(wsTx.getCell("B8").value).toBe("17/01/2026");
    expect(wsTx.getCell("C8").value).toBe("Bet223");
    expect(wsTx.getCell("K8").value).toBe("Dispo");

    expect(wsTx.getCell("A9").value).toBe(2);
    expect(wsTx.getCell("B9").value).toBe("19/01/2026");
    expect(wsTx.getCell("C9").value).toBe("Bet223");
    expect(wsTx.getCell("K9").value).toBe("Dispo");

    expect(wsTx.getCell("F10").value).toBe("TOTAL DEPOT");
    expect(wsTx.getCell("G10").value).toEqual({
      formula: 'SUMIF(F8:F9,"Dépôt",G8:G9)',
      result: 15000,
    });
    expect(wsTx.getCell("F11").value).toBe("TOTAL RETRAIT");
    expect(wsTx.getCell("G11").value).toEqual({
      formula: 'SUMIF(F8:F9,"Retrait",G8:G9)',
      result: 5000,
    });

    // Matrice récapitulative DEPOT-RETRAIT dès la colonne B
    let txMatrixHeaderRow = -1;
    for (let r = 12; r <= wsTx.rowCount; r++) {
      if (wsTx.getCell(`B${r}`).value === "DATE") {
        txMatrixHeaderRow = r;
        break;
      }
    }
    expect(txMatrixHeaderRow).toBeGreaterThan(12);
    expect(wsTx.getCell(`C${txMatrixHeaderRow}`).value).toBe("1XBET");
    expect(wsTx.getCell(`C${txMatrixHeaderRow + 1}`).value).toBe("DEPOTS");
    expect(wsTx.getCell(`D${txMatrixHeaderRow + 1}`).value).toBe("RETRAITS");
  });
});
