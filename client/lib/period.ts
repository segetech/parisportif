import dayjs from "@/lib/dayjs";
import { DATE_FORMAT } from "@/lib/dayjs";

export type PeriodKind = "today" | "week" | "month" | "range";

export interface PeriodState {
  kind: PeriodKind;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export function getDefaultPeriod(): PeriodState {
  const d = dayjs();
  return {
    kind: "today",
    start: d.format(DATE_FORMAT),
    end: d.format(DATE_FORMAT),
  };
}

export function computePeriod(
  kind: PeriodKind,
  start?: string,
  end?: string,
): PeriodState {
  const d = dayjs();
  if (kind === "today") {
    const s = d.format(DATE_FORMAT);
    return { kind, start: s, end: s };
  }
  if (kind === "week") {
    const s = d.startOf("week").add(1, "day"); // Monday as start
    const e = d.endOf("week").add(1, "day");
    return { kind, start: s.format(DATE_FORMAT), end: e.format(DATE_FORMAT) };
  }
  if (kind === "month") {
    const s = d.startOf("month");
    const e = d.endOf("month");
    return { kind, start: s.format(DATE_FORMAT), end: e.format(DATE_FORMAT) };
  }
  return {
    kind: "range",
    start: start ?? d.format(DATE_FORMAT),
    end: end ?? d.format(DATE_FORMAT),
  };
}
