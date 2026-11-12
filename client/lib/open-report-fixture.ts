import type { ReportSnapshot } from "./open-report-data";
import { reportPeriod } from "./report-periods";

// Synthetic data only, used by the regression tests and downloadable demonstration.
export function reportFixture(): ReportSnapshot {
  const common = { created_by: "agent-A", validation_status: "en_attente", operator: "Alpha", time: "12:30", support: "En ligne" };
  return { userId: "admin", role: "ADMIN", generatedAt: "2026-11-12T12:00:00Z", filters: { period: reportPeriod(2026, 11, 2), scope: "all" }, people: [{ id: "agent-A", nom: "Agent fictif" }],
    tests: [
      { ...common, id: "before", date: "2026-11-07", amount_fcfa: 999999 },
      { ...common, id: "first", reference: "TEST-08", date: "2026-11-08", created_at: "2026-12-01T00:00:00Z", amount_fcfa: "100.10", amount_won_fcfa: null, bet_type: "Fonctionnel", venue_id: "site-A", notes: "=HYPERLINK(\"https://example.invalid\")" },
      { ...common, id: "last", date: "2026-11-15", amount_fcfa: "200.20", amount_won_fcfa: "500.55", validation_status: "valide" },
      { ...common, id: "beta", date: "2026-11-10", operator: "Bêta / Équipe très longue pour la feuille", amount_fcfa: "0.10", amount_won_fcfa: 0 },
      { ...common, id: "after", date: "2026-11-16", created_at: "2026-11-10T00:00:00Z", amount_fcfa: 999999 },
    ], transactions: [
      { ...common, id: "dep-08", reference: "DEP-08", date: "2026-11-08", type: "Dépôt", amount_fcfa: "1000.10", venue_id: "site-A" },
      { ...common, id: "ret-15", reference: "RET-15", date: "2026-11-15", type: "Retrait", amount_fcfa: "200.20", validation_status: "refuse" },
      { ...common, id: "dep-beta", date: "2026-11-10", operator: "Bêta / Équipe très longue pour la feuille", type: "Dépôt", amount_fcfa: "300.30" },
      { ...common, id: "unknown-op", date: "2026-11-11", operator: null, type: "Dépôt", amount_fcfa: "50.05" },
      { ...common, id: "outside", date: "2026-11-16", type: "Dépôt", amount_fcfa: 999999 },
    ], anomalies: [{ ...common, id: "anomaly", date: "2026-11-08", report_entity: "Test signalé", reference: "AN-08" }], sites: [
      { id: "site-A", date: "", operator: "Alpha", quartier: "Centre", address: "Site fictif A", games: ["Fonctionnel"] },
      { id: "unrelated", date: "", operator: "Alpha", quartier: "Autre", address: "Site sans lien" },
    ] };
}
