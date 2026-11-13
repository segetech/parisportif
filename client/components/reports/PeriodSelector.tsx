import { useMemo } from "react";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DatePickerCustom } from "@/components/ui/date-picker-custom";
import {
  REPORT_MONTHS,
  REPORT_TRANCHES,
  reportPeriod,
  type ReportPeriod,
} from "@/lib/report-periods";
import { cn } from "@/lib/utils";

export type PeriodMode = "fixed" | "custom";

export interface PeriodSelectorProps {
  year: number;
  month: number;
  tranche: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onTrancheChange: (tranche: number) => void;
  mode?: PeriodMode;
  onModeChange?: (mode: PeriodMode) => void;
  allowCustomMode?: boolean;
  customStart?: string;
  customEnd?: string;
  onCustomStartChange?: (value: string) => void;
  onCustomEndChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function PeriodSelector({
  year,
  month,
  tranche,
  onYearChange,
  onMonthChange,
  onTrancheChange,
  mode = "fixed",
  onModeChange,
  allowCustomMode = false,
  customStart = "",
  customEnd = "",
  onCustomStartChange,
  onCustomEndChange,
  disabled = false,
  className,
}: PeriodSelectorProps) {
  const period: ReportPeriod | null = useMemo(() => {
    try {
      return reportPeriod(year, month, tranche);
    } catch {
      return null;
    }
  }, [year, month, tranche]);

  const customValid =
    mode === "custom" &&
    /^\d{4}-\d{2}-\d{2}$/.test(customStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(customEnd) &&
    customStart <= customEnd;

  return (
    <div className={cn("space-y-3", className)}>
      {allowCustomMode && onModeChange && (
        <div
          className="inline-flex w-full sm:w-auto rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-1 gap-1"
          role="group"
          aria-label="Mode de sélection de période"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onModeChange("fixed")}
            className={cn(
              "flex-1 sm:flex-initial min-h-10 px-3 rounded-md text-xs font-bold transition-colors",
              mode === "fixed"
                ? "bg-[#006B2D] text-white"
                : "text-[#556B5C] hover:bg-white hover:text-[#17251C]",
            )}
          >
            Tranches mensuelles fixes
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onModeChange("custom")}
            className={cn(
              "flex-1 sm:flex-initial min-h-10 px-3 rounded-md text-xs font-bold transition-colors",
              mode === "custom"
                ? "bg-[#006B2D] text-white"
                : "text-[#556B5C] hover:bg-white hover:text-[#17251C]",
            )}
          >
            Période personnalisée
          </button>
        </div>
      )}

      {mode === "fixed" ? (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
            <span>Mois</span>
            <select
              aria-label="Mois du rapport"
              disabled={disabled}
              className="min-h-11 rounded-lg border border-[#D8E6DB] bg-white px-3 text-sm text-[#17251C] focus:border-[#006B2D] focus:outline-none"
              value={month}
              onChange={(e) => onMonthChange(Number(e.target.value))}
            >
              {REPORT_MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
            <span>Année</span>
            <Input
              aria-label="Année du rapport"
              disabled={disabled}
              className="min-h-11 rounded-lg border-[#D8E6DB] bg-white text-sm"
              type="number"
              min={1900}
              max={9998}
              value={year || ""}
              onChange={(e) => onYearChange(Number(e.target.value))}
              placeholder="Ex. 2026"
            />
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
            <span>Période mensuelle fixe</span>
            <select
              aria-label="Période du rapport"
              disabled={disabled}
              className="min-h-11 rounded-lg border border-[#D8E6DB] bg-white px-3 text-sm text-[#17251C] focus:border-[#006B2D] focus:outline-none"
              value={tranche}
              onChange={(e) => onTrancheChange(Number(e.target.value))}
            >
              {REPORT_TRANCHES.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <DatePickerCustom
            label="Date de début"
            value={customStart}
            onChange={(val) => onCustomStartChange?.(val)}
            showPresets={false}
          />
          <DatePickerCustom
            label="Date de fin"
            value={customEnd}
            onChange={(val) => onCustomEndChange?.(val)}
            showPresets={false}
          />
        </div>
      )}

      <div
        className="flex items-start gap-2 rounded-lg bg-[#E8F3EC] p-3.5 text-xs sm:text-sm text-[#004D20] font-medium border border-[#C2DEC9]"
        aria-live="polite"
      >
        <Calendar className="h-4 w-4 shrink-0 mt-0.5 text-[#006B2D]" />
        <span>
          {mode === "fixed"
            ? period
              ? `${period.label} — dates incluses (${period.start} → ${period.end}), heure de Bamako.`
              : "Sélectionnez un mois (1–12) et une année valides (1900–9998)."
            : customValid
              ? `Période personnalisée — dates incluses (${customStart} → ${customEnd}), heure de Bamako.`
              : "Sélectionnez une date de début et une date de fin valides."}
        </span>
      </div>
    </div>
  );
}
