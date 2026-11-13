export const REPORT_MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
export const REPORT_TRANCHES = ["Du 1er au 7", "Du 8 au 15", "Du 16 au 22", "Du 23 à la fin du mois"];
export type ReportTranche = 1 | 2 | 3 | 4;
export interface ReportPeriod {
  year: number;
  month: number;
  tranche: ReportTranche;
  start: string;
  end: string;
  endExclusive: string;
  startTimestamp: string;
  endExclusiveTimestamp: string;
  days: string[];
  label: string;
  isCustom?: boolean;
}
const iso = (year: number, month: number, day: number) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Month is 1..12; UTC arithmetic models the civil dates of Africa/Bamako (UTC+0, no DST). */
export function reportPeriod(year: number, month: number, tranche: number): ReportPeriod {
  if (!Number.isInteger(year) || year < 1900 || year > 9998 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(tranche) || tranche < 1 || tranche > 4) throw new Error("Mois, année ou période invalide.");
  const first = [1, 8, 16, 23][tranche - 1];
  const last = [7, 15, 22, new Date(Date.UTC(year, month, 0)).getUTCDate()][tranche - 1];
  const next = new Date(Date.UTC(year, month - 1, last + 1));
  const start = iso(year, month, first);
  const end = iso(year, month, last);
  const endExclusive = iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return {
    year,
    month,
    tranche: tranche as ReportTranche,
    start,
    end,
    endExclusive,
    startTimestamp: `${start}T00:00:00.000Z`,
    endExclusiveTimestamp: `${endExclusive}T00:00:00.000Z`,
    days: Array.from({ length: last - first + 1 }, (_, i) => iso(year, month, first + i)),
    label: `Du ${first} au ${last} ${REPORT_MONTHS[month - 1].toLowerCase()} ${year}`,
  };
}

export function currentReportPeriod(now = new Date()): ReportPeriod {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Bamako", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
  const day = part("day");
  return reportPeriod(part("year"), part("month"), day <= 7 ? 1 : day <= 15 ? 2 : day <= 22 ? 3 : 4);
}

/** Custom inclusive date range [start, end] in YYYY-MM-DD (Africa/Bamako civil dates). */
export function customReportPeriod(start: string, end: string): ReportPeriod {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new Error("Période personnalisée invalide.");
  }
  const sDate = new Date(`${start}T00:00:00Z`);
  const eDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(sDate.getTime()) || Number.isNaN(eDate.getTime())) {
    throw new Error("Dates personnalisées invalides.");
  }
  const diffDays = Math.round((eDate.getTime() - sDate.getTime()) / 86_400_000) + 1;
  if (diffDays < 1 || diffDays > 366) {
    throw new Error("La période personnalisée ne peut pas dépasser 366 jours.");
  }
  const days = Array.from({ length: diffDays }, (_, i) => {
    const d = new Date(sDate.getTime() + i * 86_400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  });
  const next = new Date(eDate.getTime() + 86_400_000);
  const endExclusive = iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" }).format(d);
  return {
    year: sDate.getUTCFullYear(),
    month: sDate.getUTCMonth() + 1,
    tranche: 1,
    start,
    end,
    endExclusive,
    startTimestamp: `${start}T00:00:00.000Z`,
    endExclusiveTimestamp: `${endExclusive}T00:00:00.000Z`,
    days,
    label: `Du ${fmt(sDate)} au ${fmt(eDate)}`,
    isCustom: true,
  };
}

/** Returns [startInclusive, endExclusive) UTC/Bamako timestamps for SQL timestamp columns. */
export function bamakoTimestampBounds(period: Pick<ReportPeriod, "start" | "endExclusive">): {
  startInclusive: string;
  endExclusive: string;
} {
  return {
    startInclusive: `${period.start}T00:00:00.000Z`,
    endExclusive: `${period.endExclusive}T00:00:00.000Z`,
  };
}

export function sanitizeFilenameSegment(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function buildReportTitle(reportTypeLabel: string, periodLabel: string, filterSummary?: string): string {
  const base = `OPEN — ${reportTypeLabel} — ${periodLabel}`;
  return filterSummary ? `${base} (${filterSummary})` : base;
}

export function buildReportFilename(
  reportSlug: string,
  start: string,
  end: string,
  ext: "xlsx" | "pdf" | "csv",
  suffix?: string,
): string {
  const cleanSlug = sanitizeFilenameSegment(reportSlug.toLowerCase()) || "rapport";
  const cleanSuffix = suffix ? `_${sanitizeFilenameSegment(suffix.toLowerCase())}` : "";
  return `OPEN_${cleanSlug}${cleanSuffix}_${start}_${end}.${ext}`;
}

export function formatBamakoDateTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Bamako",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
