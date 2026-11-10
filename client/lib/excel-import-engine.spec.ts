import { describe, it, expect } from "vitest";
import {
  normalizeAmount,
  normalizeTime,
  normalizePhone,
  normalizeProofStatus,
  splitTypeAndPayment,
  resolveAlias,
  parseTransactionRow,
  parseBetRow,
  parseVenuesGrouped,
  detectDuplicatesInTransactions,
  sanitizeForSpreadsheet,
  OPERATOR_ALIASES,
  BET_TYPE_ALIASES,
} from "./excel-import-engine";

describe("Excel Import Engine - Normalisation et Règles Métier", () => {
  describe("Normalisation des montants", () => {
    it("convertit les montants textuels avec suffixes F ou FCFA et espaces", () => {
      expect(normalizeAmount("1000F")).toEqual({ value: 1000, raw: "1000F", isValid: true });
      expect(normalizeAmount("900F ")).toEqual({ value: 900, raw: "900F", isValid: true });
      expect(normalizeAmount("2 500 FCFA")).toEqual({ value: 2500, raw: "2 500 FCFA", isValid: true });
      expect(normalizeAmount("500f")).toEqual({ value: 500, raw: "500f", isValid: true });
      expect(normalizeAmount("1500,50 F")).toEqual({ value: 1500.5, raw: "1500,50 F", isValid: true });
    });

    it("rejette les montants vides ou invalides sans inventer de zéro", () => {
      expect(normalizeAmount("")).toEqual({ value: null, raw: "", isValid: false });
      expect(normalizeAmount(null)).toEqual({ value: null, raw: "", isValid: false });
      expect(normalizeAmount("ABC")).toEqual({ value: null, raw: "ABC", isValid: false });
    });
  });

  describe("Normalisation des heures", () => {
    it("convertit les formats 04H38, 4h24, 04:38 en format standard HH:mm", () => {
      expect(normalizeTime("04H38")).toEqual({ value: "04:38", raw: "04H38", isValid: true });
      expect(normalizeTime("4h24")).toEqual({ value: "04:24", raw: "4h24", isValid: true });
      expect(normalizeTime("03H58")).toEqual({ value: "03:58", raw: "03H58", isValid: true });
      expect(normalizeTime("12:29")).toEqual({ value: "12:29", raw: "12:29", isValid: true });
    });

    it("signale les heures hors plage", () => {
      expect(normalizeTime("25H99").isValid).toBe(false);
      expect(normalizeTime("").isValid).toBe(false);
    });
  });

  describe("Préservation des numéros de téléphone et références", () => {
    it("préserve les zéros initiaux comme texte sans conversion numérique", () => {
      expect(normalizePhone("0701020304")).toBe("0701020304");
      expect(normalizePhone("+223 70 12 34 56")).toBe("+22370123456");
      expect(normalizePhone("")).toBe(null);
    });

    it("préserve les références textuelles intactes", () => {
      const row = parseTransactionRow(
        { "Opérateur de jeux": "1xBet", "Montant": "1000F", "Référence": "CI250326.0438.B13742" },
        2,
        "2026-03-26"
      );
      expect(row.reference).toBe("CI250326.0438.B13742");
    });
  });

  describe("Séparation du Type et de l'Opérateur de paiement", () => {
    it("découpe correctement 'Dépôt Orange ' et 'Rétrait '", () => {
      const res1 = splitTypeAndPayment("Dépôt Orange ", "");
      expect(res1.type).toBe("Dépôt");
      expect(res1.payment).toBe("Orange Money");

      const res2 = splitTypeAndPayment("Rétrait ", "moov");
      expect(res2.type).toBe("Retrait");
      expect(res2.payment).toBe("Moov Money");

      const res3 = splitTypeAndPayment("Retrait Orange ", "");
      expect(res3.type).toBe("Retrait");
      expect(res3.payment).toBe("Orange Money");
    });
  });

  describe("Normalisation du statut de la preuve", () => {
    it("distingue 'disponible', 'non_disponible' et 'non_renseignee'", () => {
      expect(normalizeProofStatus("dispo")).toBe("disponible");
      expect(normalizeProofStatus("non dispo ")).toBe("non_disponible");
      expect(normalizeProofStatus("")).toBe("non_renseignee");
      expect(normalizeProofStatus(null)).toBe("non_renseignee");
    });
  });

  describe("Résolution des alias de jeux et d'opérateurs", () => {
    it("résout les fautes d'orthographe et variantes", () => {
      expect(resolveAlias("cheveaux", BET_TYPE_ALIASES)).toBe("Course de chevaux");
      expect(resolveAlias("course de cheveaux", BET_TYPE_ALIASES)).toBe("Course de chevaux");
      expect(resolveAlias("course de chien", BET_TYPE_ALIASES)).toBe("Course de lévriers");
      expect(resolveAlias("spiwin", BET_TYPE_ALIASES)).toBe("Spin 2 Win roulette");
      expect(resolveAlias("Boule 1a80", BET_TYPE_ALIASES)).toBe("Boule 1 à 80");
      expect(resolveAlias("Boule de 1 à 90", BET_TYPE_ALIASES)).toBe("Boule 1 à 90");
      expect(resolveAlias("1xbet", OPERATOR_ALIASES)).toBe("1xBet");
      expect(resolveAlias("bet 223", OPERATOR_ALIASES)).toBe("Bet223");
    });
  });

  describe("Gestion de l'absence de date (ne jamais déduire silencieusement de la référence)", () => {
    it("déclare une anomalie d'erreur si la date n'est pas fournie explicitement", () => {
      const row = parseTransactionRow(
        { "Opérateur de jeux": "1xBet", "Montant": "1000F", "Référence": "CI250326.0438.B13742" },
        2,
        null // Aucune date fournie
      );
      expect(row.isValid).toBe(false);
      const dateAnomaly = row.anomalies.find((a) => a.field === "date");
      expect(dateAnomaly).toBeDefined();
      expect(dateAnomaly?.severity).toBe("error");
    });

    it("devient valide lorsqu'une date explicite est fournie", () => {
      const row = parseTransactionRow(
        { "Opérateur de jeux": "1xBet", "Montant": "1000F", "Référence": "CI250326.0438.B13742" },
        2,
        "2026-03-26"
      );
      expect(row.isValid).toBe(true);
      expect(row.date).toBe("2026-03-26");
    });
  });

  describe("Distinction stricte du résultat du jeu et du gain", () => {
    it("gère un pari gagné avec gain brut", () => {
      const bet = parseBetRow(
        {
          "Opérateur de jeux": "1xBet",
          "Type de Pari": "casino",
          "Montant": "1000F",
          "statut": "gagné",
          "montant gagné": "3500F",
        },
        2,
        "2026-03-26"
      );
      expect(bet.status).toBe("gagné");
      expect(bet.amountWon).toBe(3500);
    });

    it("ne remplace pas un gain inconnu par zéro mais le signale", () => {
      const bet = parseBetRow(
        {
          "Opérateur de jeux": "1xBet",
          "Type de Pari": "casino",
          "Montant": "1000F",
          "statut": "gagné",
          "montant gagné": "", // Inconnu
        },
        2,
        "2026-03-26"
      );
      expect(bet.status).toBe("gagné");
      expect(bet.amountWon).toBe(null);
      const warning = bet.anomalies.find((a) => a.field === "amountWon");
      expect(warning).toBeDefined();
    });

    it("assigne 0 pour un pari perdu", () => {
      const bet = parseBetRow(
        {
          "Opérateur de jeux": "1xBet",
          "Type de Pari": "live sport",
          "Montant": "900F",
          "statut": "perdu",
        },
        3,
        "2026-03-26"
      );
      expect(bet.status).toBe("perdu");
      expect(bet.amountWon).toBe(0);
    });
  });

  describe("Regroupement multi-jeux des Salles de jeux", () => {
    it("regroupe plusieurs lignes de jeux sous une seule et même salle physique", () => {
      const rawRows = [
        {
          rowNumber: 5,
          no: "1",
          quartier: "Niamana",
          operator: "Bet223",
          support: "Salle de jeux",
          betType: "Keno boule",
          localisation: "ancienne poste de 11e arrondissement",
        },
        {
          rowNumber: 6,
          betType: "Spin 2 Win roulette",
        },
        {
          rowNumber: 7,
          betType: "Course de chevaux",
        },
        {
          rowNumber: 8,
          betType: "Course de chien",
        },
        {
          rowNumber: 9,
          no: "2",
          quartier: "yirimadio",
          operator: "Bet223",
          support: "Salle de jeux",
          betType: "Keno boule",
          localisation: "ancienne poste de 11e arrondissement",
        },
      ];

      const venues = parseVenuesGrouped(rawRows);
      // Il doit y avoir 2 établissements distincts, pas 5 !
      expect(venues.length).toBe(2);

      const venue1 = venues[0];
      expect(venue1.venueNumber).toBe(1);
      expect(venue1.quartier).toBe("Niamana");
      expect(venue1.address).toBe("Ancienne poste du 11e arrondissement");
      expect(venue1.games).toEqual([
        "Keno boule",
        "Spin 2 Win roulette",
        "Course de chevaux",
        "Course de lévriers",
      ]);
      expect(venue1.rawRows).toEqual([5, 6, 7, 8]);
    });

    it("signale une localisation suspecte comme '?' sans la propager", () => {
      const rawRows = [
        {
          rowNumber: 157,
          no: "26",
          quartier: "Sotuba",
          operator: "PremierBet",
          support: "Salle de jeux",
          betType: "Course de chien",
          localisation: "?",
        },
      ];

      const venues = parseVenuesGrouped(rawRows);
      expect(venues.length).toBe(1);
      const locWarning = venues[0].anomalies.find((a) => a.field === "address");
      expect(locWarning).toBeDefined();
    });
  });

  describe("Détection des doublons et collisions", () => {
    it("détecte les doublons de référence intra-fichier", () => {
      const txs = [
        parseTransactionRow({ "Opérateur de jeux": "1xBet", "Montant": "1000F", "Référence": "REF_123" }, 2, "2026-03-26"),
        parseTransactionRow({ "Opérateur de jeux": "1xBet", "Montant": "1000F", "Référence": "REF_123" }, 5, "2026-03-26"),
      ];

      const results = detectDuplicatesInTransactions(txs, new Set());
      expect(results[0].isDuplicate).toBe(false);
      expect(results[1].isDuplicate).toBe(true);
      expect(results[1].duplicateType).toBe("exact");
    });

    it("détecte les collisions avec la base existante", () => {
      const txs = [
        parseTransactionRow({ "Opérateur de jeux": "1xBet", "Montant": "1000F", "Référence": "REF_ALREADY_IN_DB" }, 2, "2026-03-26"),
      ];

      const results = detectDuplicatesInTransactions(txs, new Set(["ref_already_in_db"]));
      expect(results[0].isDuplicate).toBe(true);
      expect(results[0].duplicateType).toBe("ref_collision");
    });
  });

  describe("Sécurisation contre l'injection de formules dans les exports Excel/CSV", () => {
    it("neutralise les préfixes potentiellement dangereux (=, +, -, @)", () => {
      expect(sanitizeForSpreadsheet("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
      expect(sanitizeForSpreadsheet("+12345")).toBe("'+12345");
      expect(sanitizeForSpreadsheet("-SUM(A1:A10)")).toBe("'-SUM(A1:A10)");
      expect(sanitizeForSpreadsheet("@SUM(1,2)")).toBe("'@SUM(1,2)");
      expect(sanitizeForSpreadsheet("Normal text")).toBe("Normal text");
      expect(sanitizeForSpreadsheet("1000 FCFA")).toBe("1000 FCFA");
    });
  });
});
