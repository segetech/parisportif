import { describe, it, expect } from "vitest";
import {
  computeWeeklyAnomalyTrend,
  computeDashboardStats,
  toBamakoDateString,
  OFFICIAL_TIMEZONE,
  RawBet,
  RawTransaction,
  RawVenue,
  RawIllegalIncident,
} from "./dashboard-calculator";

describe("Dashboard Business Calculator & Africa/Bamako Timezone Suite", () => {
  describe("1. Timezone and Date Handling (Africa/Bamako)", () => {
    it("should format dates strictly according to Africa/Bamako timezone (UTC+0)", () => {
      // 2026-11-10T00:30:00Z -> 2026-11-10 in Bamako
      const date1 = new Date("2026-11-10T00:30:00Z");
      expect(toBamakoDateString(date1)).toBe("2026-11-10");

      // 2026-11-10T23:59:59Z -> 2026-11-10 in Bamako
      const date2 = new Date("2026-11-10T23:59:59Z");
      expect(toBamakoDateString(date2)).toBe("2026-11-10");
    });

    it("should safely handle null, undefined, or invalid date strings", () => {
      expect(toBamakoDateString(null)).toBeNull();
      expect(toBamakoDateString(undefined)).toBeNull();
      expect(toBamakoDateString("invalid-date-string")).toBeNull();
      expect(toBamakoDateString("")).toBeNull();
    });
  });

  describe("2. computeWeeklyAnomalyTrend (7-Day Rolling Window)", () => {
    const referenceDate = "2026-11-10"; // Mardi 10 Novembre 2026

    it("should generate exactly 7 chronological days ending on the reference date", () => {
      const trend = computeWeeklyAnomalyTrend([], [], referenceDate);

      expect(trend.length).toBe(7);
      expect(trend.map((t) => t.date)).toEqual([
        "2026-11-04", // J-6 (Mercredi)
        "2026-11-05", // J-5 (Jeudi)
        "2026-11-06", // J-4 (Vendredi)
        "2026-11-07", // J-3 (Samedi)
        "2026-11-08", // J-2 (Dimanche)
        "2026-11-09", // J-1 (Lundi)
        "2026-11-10", // J-0 (Mardi)
      ]);
    });

    it("should return a flat 7-point zero curve when there are no anomalies", () => {
      const trend = computeWeeklyAnomalyTrend([], [], referenceDate);

      trend.forEach((point) => {
        expect(point.paris).toBe(0);
        expect(point.transactions).toBe(0);
      });
    });

    it("should strictly exclude ancient events (e.g. 6 January 2020) and future events beyond reference", () => {
      const illegalBets: RawIllegalIncident[] = [
        { id: "old-1", date: "2020-01-06" }, // Ancien hors période
        { id: "old-2", date: "2026-10-31" }, // Hors période (avant le 4 nov)
        { id: "valid-1", date: "2026-11-04" }, // Premier jour inclus (J-6)
        { id: "valid-2", date: "2026-11-10" }, // Dernier jour inclus (J-0)
        { id: "future-1", date: "2026-11-11" }, // Futur hors période
        { id: "invalid", date: "not-a-date" }, // Date invalide
      ];

      const illegalTransactions: RawIllegalIncident[] = [
        { id: "tx-old", date: "2025-12-25" },
        { id: "tx-valid", date: "2026-11-08" }, // Dimanche (J-2)
      ];

      const trend = computeWeeklyAnomalyTrend(illegalBets, illegalTransactions, referenceDate);

      const dayNov4 = trend.find((t) => t.date === "2026-11-04");
      const dayNov8 = trend.find((t) => t.date === "2026-11-08");
      const dayNov10 = trend.find((t) => t.date === "2026-11-10");

      expect(dayNov4?.paris).toBe(1);
      expect(dayNov4?.transactions).toBe(0);

      expect(dayNov8?.paris).toBe(0);
      expect(dayNov8?.transactions).toBe(1);

      expect(dayNov10?.paris).toBe(1);
      expect(dayNov10?.transactions).toBe(0);

      // Le total des paris dans la fenêtre doit être exactement 2 (valid-1 et valid-2)
      const totalWindowBets = trend.reduce((sum, t) => sum + t.paris, 0);
      expect(totalWindowBets).toBe(2);

      // Le total des transactions dans la fenêtre doit être exactement 1 (tx-valid)
      const totalWindowTx = trend.reduce((sum, t) => sum + t.transactions, 0);
      expect(totalWindowTx).toBe(1);
    });

    it("should handle month and year boundaries correctly", () => {
      // Référence au 3 janvier 2027 : la fenêtre chevauche 2026 et 2027
      const newYearRef = "2027-01-03";
      const trend = computeWeeklyAnomalyTrend(
        [
          { id: "nye", date: "2026-12-31" },
          { id: "nyd", date: "2027-01-01" },
        ],
        [],
        newYearRef
      );

      expect(trend.map((t) => t.date)).toEqual([
        "2026-12-28",
        "2026-12-29",
        "2026-12-30",
        "2026-12-31",
        "2027-01-01",
        "2027-01-02",
        "2027-01-03",
      ]);

      const nyePoint = trend.find((t) => t.date === "2026-12-31");
      const nydPoint = trend.find((t) => t.date === "2027-01-01");
      expect(nyePoint?.paris).toBe(1);
      expect(nydPoint?.paris).toBe(1);
    });
  });

  describe("3. computeDashboardStats (Exhaustive Aggregation & 31 Bets Regression)", () => {
    it("should aggregate 31 bets of 100 FCFA all pending validation yielding 31 bets, 3100 FCFA, 31 pending", () => {
      const bets: RawBet[] = [];
      for (let i = 1; i <= 31; i++) {
        bets.push({
          id: `bet-${i}`,
          amount_fcfa: 100,
          validation_status: "en_attente",
          status: "en_cours",
          date: "2026-11-10",
          time: "10:00:00",
          operator: "1xBet",
        });
      }

      const stats = computeDashboardStats({ allBets: bets });

      expect(stats.totalBets).toBe(31);
      expect(stats.totalBetsAmount).toBe(3100);
      expect(stats.pendingValidationsCount).toBe(31);
      // Seuls 30 paris récents doivent être retournés pour la table
      expect(stats.recentBets.length).toBe(30);
    });

    it("should correctly distinguish known winnings from unknown winnings (null vs 0)", () => {
      const bets: RawBet[] = [
        { id: "b1", amount_fcfa: 1000, amount_won_fcfa: 5000, status: "Gagné" },
        { id: "b2", amount_fcfa: 1000, amount_won_fcfa: 0, status: "Perdu" },
        { id: "b3", amount_fcfa: 1000, amount_won_fcfa: null, status: "En cours" }, // Inconnu
      ];

      const stats = computeDashboardStats({ allBets: bets });

      expect(stats.totalBetsAmount).toBe(3000);
      expect(stats.totalKnownWinnings).toBe(5000);
      expect(stats.wonBetsCount).toBe(1);
      expect(stats.lostBetsCount).toBe(1);
      expect(stats.pendingBetsCount).toBe(1);
    });

    it("should accumulate deposits and withdrawals separately from transactions", () => {
      const transactions: RawTransaction[] = [
        { id: "t1", type: "Dépôt", amount_fcfa: 50000, validation_status: "valide" },
        { id: "t2", type: "Dépôt", amount_fcfa: 25000, validation_status: "en_attente" },
        { id: "t3", type: "Retrait", amount_fcfa: 30000, validation_status: "valide" },
      ];

      const stats = computeDashboardStats({ transactions });

      expect(stats.totalDeposits).toBe(75000);
      expect(stats.totalWithdrawals).toBe(30000);
      expect(stats.pendingValidationsCount).toBe(1);
    });

    it("should count distinct operators correctly and group venues by operator", () => {
      const venues: RawVenue[] = [
        { id: "v1", operator: "1xBet", quartier: "Badalabougou" },
        { id: "v2", operator: "1xBet", quartier: "Hamdallaye" },
        { id: "v3", operator: "Bet223", quartier: "Aci 2000" },
      ];

      const stats = computeDashboardStats({ venues });

      expect(stats.totalVenues).toBe(3);
      expect(stats.operatorsCount).toBe(2);
      expect(stats.venuesByOperator).toEqual([
        { name: "1xBet", count: 2 },
        { name: "Bet223", count: 1 },
      ]);
    });
  });
});
