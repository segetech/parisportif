/** Presentation only: persisted codes and historical records remain unchanged. */
export function testStatusLabel(value: string | null | undefined): string {
  const status = value?.toLowerCase().trim();
  if (status === "gagné" || status === "won") return "Issue favorable";
  if (status === "perdu" || status === "lost") return "Issue défavorable";
  if (status === "en_attente" || status === "en attente" || status === "pending") return "En attente";
  if (status === "annulé" || status === "cancelled") return "Annulé";
  return value || "Non renseigné";
}

export const HISTORICAL_RESULT_NOTICE = "Les issues et montants historiques sont conservés. Ils ne constituent pas un verdict de conformité du test.";

/** Readable catalog aliases without modifying the value submitted to the API. */
export function testCatalogLabel(value: string): string {
  return value
    .replace(/\bparis sportifs\b/gi, "Tests")
    .replace(/\btype de pari\b/gi, "Type de test")
    .replace(/\bparis\b/gi, "Tests")
    .replace(/\bpari\b/gi, "Test")
    .replace(/\bsalle de jeux\b/gi, "Site de test")
    .replace(/\bjeux virtuels\b/gi, "Tests virtuels");
}

/** Only format known structured fields; free observations and real names stay intact. */
export function testExportValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (key === "status" || key === "statut") return testStatusLabel(value);
  if (["bet_type", "type_pari", "support"].includes(key)) return testCatalogLabel(value);
  return value;
}

export function importEntityLabel(value: string): string {
  return value === "pari" ? "Tests" : value === "salles" ? "Sites de test" : value === "depotretrait" ? "Transactions" : value;
}

// Deployment compatibility: retain bets/bet_types/illegal_bets, audit entity "Pari",
// import entity "pari", result codes and ps.* cache/draft keys. These are private
// persistence contracts, not public vocabulary. No SQL/data migration is needed.
