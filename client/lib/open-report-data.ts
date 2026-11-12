import type { SupabaseClient } from "@supabase/supabase-js";
import { reportPeriod, type ReportPeriod } from "./report-periods";

export type ReportRow = { id: string; date: string; operator?: string | null; amount_fcfa?: string | number | null; amount_won_fcfa?: string | number | null; [key: string]: any };
export interface ReportDataset { tests: ReportRow[]; transactions: ReportRow[]; anomalies: ReportRow[]; sites: ReportRow[]; people: { id: string; nom?: string; prenom?: string }[] }
export interface ReportFilters { period: ReportPeriod; operator?: string; operators?: string[]; validation?: string; validations?: string[]; scope?: "all" | "bets" | "transactions"; transactionType?: "Dépôt" | "Retrait" }
export interface ReportSnapshot extends ReportDataset { filters: ReportFilters; generatedAt: string; userId: string; role: string }
export const REPORT_MAX_ROWS = 200_000;

/** Stop only on an empty page: a hosted cap may be smaller than requested. */
export async function reportPages(makeQuery: () => any, progress?: (count: number) => void): Promise<any[]> {
  const result: any[] = [], seen = new Set<string>();
  for (let offset = 0; ; ) {
    const { data, error } = await makeQuery().order("id", { ascending: true }).range(offset, offset + 499);
    if (error) throw new Error(`Lecture du rapport impossible : ${error.message || error.code}`);
    if (!Array.isArray(data)) throw new Error("Réponse de données invalide pour le rapport.");
    if (data.length === 0) return result;
    for (const row of data) {
      if (!row.id || seen.has(row.id)) throw new Error("Les données ont changé pendant la lecture. Relancez l’export.");
      seen.add(row.id); result.push(row);
    }
    if (result.length > REPORT_MAX_ROWS) throw new Error("Rapport trop volumineux. Sélectionnez un opérateur ; aucune donnée n’a été tronquée.");
    offset += data.length; progress?.(result.length);
  }
}

/** Uses the ordinary authenticated client and existing RLS; no privileged key. */
export async function fetchOpenReport(client: SupabaseClient, filters: ReportFilters, progress?: (message: string) => void): Promise<ReportSnapshot> {
  const frozen = structuredClone(filters);
  frozen.period = reportPeriod(frozen.period.year, frozen.period.month, frozen.period.tranche);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Reconnectez-vous avant d’exporter.");
  const { data: profile, error } = await client.from("users").select("id,role,statut,must_change_password").eq("id", auth.user.id).single();
  if (error || !profile || profile.statut !== "actif" || profile.must_change_password || !["ADMIN", "CONTROLEUR", "AGENT"].includes(profile.role)) throw new Error("Ce compte ne peut pas exporter ce rapport.");
  const agent = profile.role === "AGENT";
  const operations = async (table: string, validation = true) => reportPages(() => {
    let q = client.from(table).select("*").gte("date", frozen.period.start).lte("date", frozen.period.end);
    if (agent) q = q.eq("created_by", auth.user!.id);
    if (frozen.operators && frozen.operators.length > 0) {
      if (frozen.operators.length === 1) q = q.eq("operator", frozen.operators[0]);
      else q = q.in("operator", frozen.operators);
    } else if (frozen.operator) {
      q = q.eq("operator", frozen.operator);
    }
    if (validation) {
      if (frozen.validations && frozen.validations.length > 0) {
        if (frozen.validations.length === 1) q = q.eq("validation_status", frozen.validations[0]);
        else q = q.in("validation_status", frozen.validations);
      } else if (frozen.validation) {
        q = q.eq("validation_status", frozen.validation);
      }
    }
    if (table === "transactions" && frozen.transactionType) q = q.eq("type", frozen.transactionType);
    return q;
  }, count => progress?.(`${table === "bets" ? "Tests" : table === "transactions" ? "Transactions" : "Anomalies"} : ${count} lignes lues`));
  const tests = frozen.scope !== "transactions" ? await operations("bets") : [];
  const transactions = frozen.scope !== "bets" ? await operations("transactions") : [];
  // Agents cannot inspect the supervisory signalement tables. Do not claim zero.
  const anomalies = agent ? [] : [
    ...(frozen.scope !== "transactions" ? (await operations("illegal_bets", false)).map(r => ({ ...r, report_entity: "Test signalé" })) : []),
    ...(frozen.scope !== "bets" ? (await operations("illegal_transactions", false)).map(r => ({ ...r, report_entity: "Transaction signalée" })) : []),
  ];
  const siteIds = [...new Set([...tests, ...transactions].map(r => r.venue_id).filter(Boolean))];
  const personIds = [...new Set([...tests, ...transactions].flatMap(r => [r.created_by, r.validated_by || r.reviewed_by]).filter(Boolean))];
  const sites: ReportRow[] = [], people: ReportDataset["people"] = [];
  for (let i = 0; i < siteIds.length; i += 100) sites.push(...await reportPages(() => client.from("venues").select("id,quartier,operator,address,games,bet_type").in("id", siteIds.slice(i, i + 100))));
  for (let i = 0; i < personIds.length; i += 100) people.push(...await reportPages(() => client.from("users").select("id,nom,prenom").in("id", personIds.slice(i, i + 100))));
  if (tests.length + transactions.length + anomalies.length > REPORT_MAX_ROWS) throw new Error("Rapport trop volumineux. Filtrez par opérateur.");
  const finalAuth = await client.auth.getUser();
  if (finalAuth.error || finalAuth.data.user?.id !== auth.user.id) throw new Error("La session a changé. Relancez l’export.");
  const finalProfile = await client.from("users").select("id,role,statut,must_change_password").eq("id", auth.user.id).single();
  if (finalProfile.error || finalProfile.data?.statut !== "actif" || finalProfile.data?.role !== profile.role || finalProfile.data?.must_change_password) throw new Error("Les accès du compte ont changé. Relancez l’export.");
  return { tests, transactions, anomalies, sites, people, filters: frozen, generatedAt: new Date().toISOString(), userId: auth.user.id, role: profile.role };
}

/** Decimal(15,2) money is summed in centimes, never by adding binary floats. */
export function moneyCents(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Montant financier invalide dans les données du rapport.");
  return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0")));
}
export function numericMoney(cents: bigint): number {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("Total trop élevé pour la précision numérique d’Excel.");
  return Number(cents) / 100;
}
export const operatorKey = (row: ReportRow): string => row.operator?.trim() ? row.operator : "";
export function isDeposit(row: ReportRow) { return ["dépôt", "depot"].includes(String(row.type).toLowerCase()); }
export function isWithdrawal(row: ReportRow) { return String(row.type).toLowerCase() === "retrait"; }

export function aggregateReport(data: ReportDataset, period: ReportPeriod, operatorFilter?: string | string[]) {
  const allowedOps = Array.isArray(operatorFilter)
    ? (operatorFilter.length ? new Set(operatorFilter) : null)
    : (operatorFilter !== undefined ? new Set([operatorFilter]) : null);
  const inside = (r: ReportRow) => {
    const d = r.date?.slice(0, 10);
    if (!d || d < period.start || d > period.end) return false;
    if (allowedOps !== null && !allowedOps.has(operatorKey(r))) return false;
    return true;
  };
  const unique = (rows: ReportRow[]) => { const ids = new Set<string>(); return rows.filter(inside).map(r => { if (ids.has(r.id)) throw new Error("Doublon dans le rapport."); ids.add(r.id); return r; }); };
  const tests = unique(data.tests), transactions = unique(data.transactions);
  const anomalies = data.anomalies.filter(inside); // IDs can coincide across the two independent tables.
  const deposits = transactions.filter(isDeposit), withdrawals = transactions.filter(isWithdrawal);
  const unknownTransactions = transactions.filter(r => !isDeposit(r) && !isWithdrawal(r));
  if (unknownTransactions.length) throw new Error("Type de transaction inconnu : impossible de calculer un solde fiable.");
  const sum = (rows: ReportRow[], field: string) => numericMoney(rows.reduce((total, r) => total + (moneyCents(r[field]) ?? 0n), 0n));
  const validation = { valide: 0, en_attente: 0, refuse: 0, autre: 0 };
  for (const r of [...tests, ...transactions]) { const key = r.validation_status as keyof typeof validation; if (["valide", "en_attente", "refuse"].includes(key)) validation[key]++; else validation.autre++; }
  const daily = period.days.map(date => ({ date, tests: tests.filter(r => r.date.slice(0, 10) === date).length, deposits: sum(deposits.filter(r => r.date.slice(0, 10) === date), "amount_fcfa"), withdrawals: sum(withdrawals.filter(r => r.date.slice(0, 10) === date), "amount_fcfa") }));
  const depositAmount = sum(deposits, "amount_fcfa"), withdrawalAmount = sum(withdrawals, "amount_fcfa");
  const balance = numericMoney(deposits.reduce((s, r) => s + (moneyCents(r.amount_fcfa) ?? 0n), 0n) - withdrawals.reduce((s, r) => s + (moneyCents(r.amount_fcfa) ?? 0n), 0n));
  return { tests, transactions, anomalies, deposits, withdrawals, validation, daily, engaged: sum(tests, "amount_fcfa"), returned: sum(tests, "amount_won_fcfa"), depositAmount, withdrawalAmount, balance, unknownReturned: tests.filter(r => moneyCents(r.amount_won_fcfa) === null).length, unknownTransactionAmounts: transactions.filter(r => moneyCents(r.amount_fcfa) === null).length };
}
