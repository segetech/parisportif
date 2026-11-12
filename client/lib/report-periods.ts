export const REPORT_MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
export const REPORT_TRANCHES = ["Du 1er au 7", "Du 8 au 15", "Du 16 au 22", "Du 23 à la fin du mois"];
export type ReportTranche = 1 | 2 | 3 | 4;
export interface ReportPeriod { year: number; month: number; tranche: ReportTranche; start: string; end: string; endExclusive: string; days: string[]; label: string }
const iso = (year: number, month: number, day: number) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Month is 1..12; UTC arithmetic models the civil dates of Africa/Bamako. */
export function reportPeriod(year: number, month: number, tranche: number): ReportPeriod {
  if (!Number.isInteger(year) || year < 1900 || year > 9998 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(tranche) || tranche < 1 || tranche > 4) throw new Error("Mois, année ou période invalide.");
  const first = [1, 8, 16, 23][tranche - 1];
  const last = [7, 15, 22, new Date(Date.UTC(year, month, 0)).getUTCDate()][tranche - 1];
  const next = new Date(Date.UTC(year, month - 1, last + 1));
  return { year, month, tranche: tranche as ReportTranche, start: iso(year, month, first), end: iso(year, month, last), endExclusive: iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()), days: Array.from({ length: last - first + 1 }, (_, i) => iso(year, month, first + i)), label: `Du ${first} au ${last} ${REPORT_MONTHS[month - 1].toLowerCase()} ${year}` };
}

export function currentReportPeriod(now = new Date()): ReportPeriod {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Bamako", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
  const day = part("day");
  return reportPeriod(part("year"), part("month"), day <= 7 ? 1 : day <= 15 ? 2 : day <= 22 ? 3 : 4);
}
