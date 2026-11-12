import { describe, expect, it, vi } from "vitest";
import { fetchOpenReport } from "./open-report-data";
import { reportPeriod } from "./report-periods";

function transport(role = "ADMIN", options: { errorTable?: string; changedAccount?: boolean; revoked?: boolean; noAuth?: boolean } = {}) {
  const calls: { table: string; column?: string; value?: unknown }[] = [];
  let profileReads = 0;
  const records: Record<string, any[]> = {
    bets: [
      { id: "first", date: "2026-11-08", operator: "Alpha", created_by: "agent-A", validation_status: "valide", venue_id: "linked", amount_fcfa: 100 },
      { id: "last", date: "2026-11-15", operator: "Alpha", created_by: "agent-B", validation_status: "en_attente", amount_fcfa: 200 },
      { id: "before", date: "2026-11-07", operator: "Alpha", created_by: "agent-A", amount_fcfa: 9999 },
      { id: "after", date: "2026-11-16", operator: "Alpha", created_by: "agent-A", amount_fcfa: 9999 },
      { id: "other-operator", date: "2026-11-10", operator: "Beta", created_by: "agent-A", validation_status: "valide", amount_fcfa: 300 },
    ], transactions: [{ id: "dep", date: "2026-11-08", operator: "Alpha", created_by: "agent-A", type: "Dépôt", validation_status: "valide", amount_fcfa: 1000 }],
    illegal_bets: [{ id: "signal", date: "2026-11-10", operator: "Alpha" }], illegal_transactions: [],
    venues: [{ id: "linked", operator: "Alpha", quartier: "Site lié" }, { id: "not-linked", operator: "Alpha", quartier: "Même opérateur sans lien" }],
    users: [{ id: "agent-A", nom: "A" }, { id: "agent-B", nom: "B" }],
  };
  const client = {
    auth: { getUser: vi.fn().mockImplementation(async () => ({ data: { user: options.noAuth ? null : { id: options.changedAccount && profileReads ? "another-user" : "agent-A" } }, error: null })) },
    from(table: string) {
      calls.push({ table });
      const filters: ((r: any) => boolean)[] = [];
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => { calls.push({ table, column, value }); filters.push(r => r[column] === value); return query; },
        in: (column: string, values: unknown[]) => { filters.push(r => values.includes(r[column])); return query; },
        gte: (column: string, value: any) => { calls.push({ table, column, value }); filters.push(r => r[column] >= value); return query; },
        lte: (column: string, value: any) => { calls.push({ table, column, value }); filters.push(r => r[column] <= value); return query; },
        order: () => query,
        single: async () => { profileReads++; return { data: { id: "agent-A", role, statut: options.revoked && profileReads > 1 ? "suspendu" : "actif", must_change_password: false }, error: null }; },
        range: async (first: number, last: number) => options.errorTable === table ? { data: null, error: { message: "Accès ou réseau refusé" } } : { data: (records[table] || []).filter(r => filters.every(f => f(r))).slice(first, Math.min(last + 1, first + 2)), error: null },
      };
      return query;
    },
  };
  return { client: client as any, calls };
}
const filters = { period: reportPeriod(2026, 11, 2), operator: "Alpha", scope: "all" as const };

describe("production report reads, permissions and filters", () => {
  it("reads all inclusive business-date rows and only explicitly linked sites", async () => {
    const { client, calls } = transport(); const report = await fetchOpenReport(client, filters);
    expect(report.tests.map(r => r.id)).toEqual(["first", "last"]);
    expect(report.transactions.map(r => r.id)).toEqual(["dep"]);
    expect(report.sites.map(r => r.id)).toEqual(["linked"]);
    expect(report.anomalies).toHaveLength(1);
    expect(calls).toContainEqual({ table: "bets", column: "date", value: "2026-11-08" });
    expect(calls).toContainEqual({ table: "bets", column: "date", value: "2026-11-15" });
    expect(calls.filter(c => c.column === "created_at")).toHaveLength(0);
  });
  it("uses the database role and limits an agent to their own operations", async () => {
    const { client, calls } = transport("AGENT");
    const report = await fetchOpenReport(client, { ...filters, role: "ADMIN" } as any);
    expect(report.tests.map(r => r.id)).toEqual(["first"]);
    expect(report.role).toBe("AGENT"); expect(report.anomalies).toEqual([]);
    expect(calls).toContainEqual({ table: "bets", column: "created_by", value: "agent-A" });
    expect(calls.some(c => c.table.startsWith("illegal_"))).toBe(false);
  });
  it("applies validation and selected data scope without querying excluded operations", async () => {
    const { client, calls } = transport("CONTROLEUR");
    const report = await fetchOpenReport(client, { ...filters, scope: "bets", validation: "valide" });
    expect(report.tests.map(r => r.id)).toEqual(["first"]); expect(report.transactions).toEqual([]);
    expect(calls).toContainEqual({ table: "bets", column: "validation_status", value: "valide" });
    expect(calls.some(c => c.table === "transactions" || c.table === "illegal_transactions")).toBe(false);
  });
  it.each([{ noAuth: true }, { errorTable: "transactions" }, { changedAccount: true }, { revoked: true }])("fails the whole export when auth, network or account access changes: %o", async options => {
    const { client } = transport("ADMIN", options); await expect(fetchOpenReport(client, filters)).rejects.toThrow();
  });
});
