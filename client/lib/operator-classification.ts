/**
 * Référentiel des statuts juridiques des opérateurs de jeux (Mali / OPEN)
 *
 * Les opérateurs légaux (agréés et autorisés par la régulation nationale) :
 * - 1xBet
 * - Bet223
 * - PremierBet
 * - MALIBET
 * (et PMU Mali)
 *
 * Tous les autres opérateurs sont classés comme non agréés / illégaux.
 */

export const LEGAL_OPERATOR_CANONICAL = [
  "1xBet",
  "Bet223",
  "PremierBet",
  "MALIBET",
  "PMU Mali",
] as const;

const NORMALIZED_LEGAL_KEYS = new Set([
  "1xbet",
  "1x bet",
  "bet223",
  "bet 223",
  "premierbet",
  "premier bet",
  "malibet",
  "mali bet",
  "pmumali",
  "pmu mali",
  "pmu",
]);

export function isLegalOperator(operatorName?: string | null): boolean {
  if (!operatorName) return false;
  const clean = operatorName.trim().toLowerCase().replace(/\s+/g, " ");
  const stripped = clean.replace(/[\s_-]+/g, "");
  return NORMALIZED_LEGAL_KEYS.has(clean) || NORMALIZED_LEGAL_KEYS.has(stripped);
}

export function operatorLegalityLabel(operatorName?: string | null): "Légal" | "Illégal" {
  return isLegalOperator(operatorName) ? "Légal" : "Illégal";
}
