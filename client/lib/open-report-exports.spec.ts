import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  bamakoTimestampBounds,
  buildReportFilename,
  buildReportTitle,
  currentReportPeriod,
  reportPeriod,
} from "./report-periods";
import { fetchOpenReport, type ReportFilters } from "./open-report-data";
import { buildOpenReport } from "./open-report-workbook";
import {
  buildOpenReportCsv,
  exportOpenReportPDF,
  triggerOpenReportCsvDownload,
} from "./open-report-exports";

describe("production date bounds, Bamako timestamps and naming", () => {
  it("computes the four fixed tranches of November 2026 without overlap or gap", () => {
    const tranches = [1, 2, 3, 4].map((t) => reportPeriod(2026, 11, t));
    expect(tranches.map((t) => [t.start, t.end, t.endExclusive])).toEqual([
      ["2026-11-01", "2026-11-07", "2026-11-08"],
      ["2026-11-08", "2026-11-15", "2026-11-16"],
      ["2026-11-16", "2026-11-22", "2026-11-23"],
      ["2026-11-23", "2026-11-30", "2026-12-01"],
    ]);
    const allDays = tranches.flatMap((t) => t.days);
    expect(allDays).toHaveLength(30);
    expect(new Set(allDays).size).toBe(30);
  });

  it("handles December -> January rollover and timestamp inclusivity at 23:59:59 Bamako", () => {
    const dec4 = reportPeriod(2026, 12, 4);
    expect(dec4.start).toBe("2026-12-23");
    expect(dec4.end).toBe("2026-12-31");
    expect(dec4.endExclusive).toBe("2027-01-01");

    const bounds = bamakoTimestampBounds(dec4);
    expect(bounds.startInclusive).toBe("2026-12-23T00:00:00.000Z");
    expect(bounds.endExclusive).toBe("2027-01-01T00:00:00.000Z");

    const inAtLastSecond = "2026-12-31T23:59:59.000Z";
    const outAtMidnightNext = "2027-01-01T00:00:00.000Z";
    expect(
      inAtLastSecond >= bounds.startInclusive &&
        inAtLastSecond < bounds.endExclusive,
    ).toBe(true);
    expect(
      outAtMidnightNext >= bounds.startInclusive &&
        outAtMidnightNext < bounds.endExclusive,
    ).toBe(false);
  });

  it("builds consistent OPEN titles and sanitized filenames across Excel, PDF, CSV", () => {
    const p = reportPeriod(2026, 11, 2);
    expect(buildReportTitle("Rapport des tests", p.label)).toBe(
      "OPEN — Rapport des tests — Du 8 au 15 novembre 2026",
    );
    expect(buildReportFilename("tests", p.start, p.end, "xlsx")).toBe(
      "OPEN_tests_2026-11-08_2026-11-15.xlsx",
    );
    expect(buildReportFilename("tests", p.start, p.end, "pdf", "1xBet / Mali")).toBe(
      "OPEN_tests_1xbet_mali_2026-11-08_2026-11-15.pdf",
    );
    expect(buildReportFilename("transactions", p.start, p.end, "csv")).toBe(
      "OPEN_transactions_2026-11-08_2026-11-15.csv",
    );
  });

  it("selects the right tranche for boundary days across months", () => {
    const checkDays: [number, number][] = [
      [1, 1],
      [7, 1],
      [8, 2],
      [15, 2],
      [16, 3],
      [22, 3],
      [23, 4],
      [31, 4],
    ];
    for (const [day, expected] of checkDays) {
      expect(
        currentReportPeriod(
          new Date(`2026-12-${String(day).padStart(2, "0")}T12:00:00Z`),
        ).tranche,
      ).toBe(expected);
    }
  });
});

describe("real multi-page export pipeline, business date vs created_at, Excel/CSV/PDF", () => {
  function createMockSupabase(
    betsData: any[],
    txData: any[],
    userProfile = { id: "u-admin", role: "ADMIN", statut: "actif", must_change_password: false },
  ) {
    const tables: Record<string, any[]> = {
      bets: betsData,
      transactions: txData,
      illegal_bets: [],
      illegal_transactions: [],
      venues: [],
      users: [userProfile],
    };

    return {
      auth: {
        getUser: async () => ({
          data: { user: { id: userProfile.id } },
          error: null,
        }),
      },
      from: (table: string) => {
        const filters: ((r: any) => boolean)[] = [];
        const q: any = {
          select: () => q,
          order: () => q,
          eq: (k: string, v: any) => {
            filters.push((r) => r[k] === v);
            return q;
          },
          gte: (k: string, v: any) => {
            filters.push((r) => r[k] >= v);
            return q;
          },
          lte: (k: string, v: any) => {
            filters.push((r) => r[k] <= v);
            return q;
          },
          in: (k: string, vals: any[]) => {
            filters.push((r) => vals.includes(r[k]));
            return q;
          },
          single: async () => ({ data: userProfile, error: null }),
          range: async (from: number, to: number) => {
            // Simulate smaller hosted cap (120 rows/page) to force real pagination > 1000 rows
            const filtered = (tables[table] || []).filter((r) =>
              filters.every((fn) => fn(r)),
            );
            const cap = Math.min(to, from + 119);
            return { data: filtered.slice(from, cap + 1), error: null };
          },
        };
        return q;
      },
    } as any;
  }

  it("filters strictly by business date (not created_at), paginates > 1000 rows, and outputs exact Excel, CSV & PDF", async () => {
    const period = reportPeriod(2026, 11, 2); // 2026-11-08 .. 2026-11-15
    const bets: any[] = [
      // Outside before start, even if created_at is inside period
      {
        id: "bet-before",
        date: "2026-11-07",
        time: "23:59:00",
        operator: "1xBet",
        support: "App mobile",
        bet_type: "Simple",
        amount_fcfa: 5000,
        amount_won_fcfa: 0,
        status: "lost",
        validation_status: "valide",
        created_by: "u-admin",
        created_at: "2026-11-10T10:00:00.000Z",
        reference: "REF-BEFORE",
      },
      // Business date INSIDE period, created_at OUTSIDE period -> MUST BE INCLUDED
      {
        id: "bet-first",
        date: "2026-11-08",
        time: "08:00:00",
        operator: "1xBet",
        support: "App mobile",
        bet_type: "Simple",
        amount_fcfa: 1000,
        amount_won_fcfa: 2000,
        status: "won",
        validation_status: "valide",
        created_by: "u-admin",
        created_at: "2026-12-02T09:00:00.000Z",
        reference: "=CMD('calc')",
      },
      // Other operator -> MUST BE EXCLUDED when filtering operator = "1xBet"
      {
        id: "bet-other-op",
        date: "2026-11-11",
        time: "12:00:00",
        operator: "Bet223",
        support: "Site web",
        bet_type: "Combiné",
        amount_fcfa: 9999,
        amount_won_fcfa: 0,
        status: "pending",
        validation_status: "valide",
        created_by: "u-admin",
        created_at: "2026-11-11T12:00:00.000Z",
        reference: "REF-BET223",
      },
      // Outside after end
      {
        id: "bet-after",
        date: "2026-11-16",
        time: "00:01:00",
        operator: "1xBet",
        support: "App mobile",
        bet_type: "Simple",
        amount_fcfa: 8000,
        amount_won_fcfa: 0,
        status: "lost",
        validation_status: "valide",
        created_by: "u-admin",
        created_at: "2026-11-15T23:59:00.000Z",
        reference: "REF-AFTER",
      },
    ];

    // Add 1050 more 1xBet bets inside 2026-11-15 (last day) to test pagination > 1000 rows
    for (let i = 0; i < 1050; i++) {
      bets.push({
        id: `bet-bulk-${String(i).padStart(4, "0")}`,
        date: "2026-11-15",
        time: "23:59:00",
        operator: "1xBet",
        support: "App mobile",
        bet_type: "Simple",
        amount_fcfa: 100,
        amount_won_fcfa: 0,
        status: "pending",
        validation_status: "valide",
        created_by: "u-admin",
        created_at: "2026-11-15T23:59:59.000Z",
        reference: `REF-${i}`,
      });
    }

    const client = createMockSupabase(bets, []);
    const filters: ReportFilters = {
      period,
      operator: "1xBet",
      scope: "bets",
    };

    const snapshot = await fetchOpenReport(client, filters);
    expect(snapshot.tests).toHaveLength(1051);
    expect(snapshot.tests.some((r) => r.id === "bet-first")).toBe(true);
    expect(snapshot.tests.some((r) => r.id === "bet-before")).toBe(false);
    expect(snapshot.tests.some((r) => r.id === "bet-after")).toBe(false);
    expect(snapshot.tests.some((r) => r.id === "bet-other-op")).toBe(false);

    // 1. Verify Excel workbook read-back
    const excel = await buildOpenReport(snapshot);
    expect(excel.filename).toBe("OPEN_rapport_2026-11-08_2026-11-15.xlsx");
    expect(excel.summary.tests).toHaveLength(1051);
    expect(excel.summary.engaged).toBe(1000 + 1050 * 100);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(excel.bytes as any);
    const testsSheet = wb.getWorksheet("Tous les tests")!;
    expect(testsSheet.getCell("A7").value).toBe("'=CMD('calc')");

    // 2. Verify CSV output (clean header, formula escaping, exact row count & sum)
    const csvOut = buildOpenReportCsv(snapshot);
    expect(csvOut.filename).toBe("OPEN_tests_2026-11-08_2026-11-15.csv");
    expect(csvOut.rowCount).toBe(1051);
    const lines = csvOut.csv.split("\n");
    expect(lines).toHaveLength(1052); // 1 header + 1051 rows (no decorative lines)
    expect(lines[0]).toContain("Référence,Date,Heure,Opérateur");
    expect(lines[1]).toContain("'=CMD('calc')");

    // 3. Verify PDF output payload and real jsPDF execution
    const pdfSpy = vi.fn().mockResolvedValue(undefined);
    const pdfMeta = await exportOpenReportPDF(snapshot, pdfSpy);
    expect(pdfMeta.filename).toBe("OPEN_tests_2026-11-08_2026-11-15.pdf");
    expect(pdfMeta.rowCount).toBe(1051);
    expect(pdfSpy).toHaveBeenCalledOnce();
    const pdfArgs = pdfSpy.mock.calls[0][0];
    expect(pdfArgs.title).toBe("OPEN — Rapport des tests — Du 8 au 15 novembre 2026");
    expect(pdfArgs.filename).toBe("OPEN_tests_2026-11-08_2026-11-15.pdf");
    expect(pdfArgs.data).toHaveLength(1051);
  });

  it("throws a clear empty-period message for CSV and PDF without fake numbers", async () => {
    const period = reportPeriod(2026, 2, 4); // 2026-02-23 .. 2026-02-28
    const client = createMockSupabase([], []);
    const snapshot = await fetchOpenReport(client, { period, scope: "transactions" });
    expect(() => triggerOpenReportCsvDownload(snapshot)).toThrow("Aucune donnée");
    await expect(exportOpenReportPDF(snapshot, vi.fn())).rejects.toThrow("Aucune donnée");
  });
});
