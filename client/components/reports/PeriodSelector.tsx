import { useMemo, useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DatePickerCustom } from "@/components/ui/date-picker-custom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  availableYears?: number[];
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
  availableYears,
  disabled = false,
  className,
}: PeriodSelectorProps) {
  const [yearMenuOpen, setYearMenuOpen] = useState(false);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const base =
      availableYears && availableYears.length > 0
        ? availableYears
        : [currentYear, currentYear - 1, currentYear - 2];
    const set = new Set<number>(base.filter((y) => Number.isFinite(y) && y >= 1900 && y <= 9998));
    if (Number.isFinite(year) && year >= 1900 && year <= 9998) {
      set.add(year);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [availableYears, year]);
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

          <div className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
            <span>Année</span>
            <Popover open={yearMenuOpen} onOpenChange={setYearMenuOpen}>
              <div className="relative flex items-center rounded-lg border border-[#D8E6DB] bg-white focus-within:border-[#006B2D]">
                <Input
                  aria-label="Année du rapport"
                  disabled={disabled}
                  className="min-h-11 border-0 bg-transparent pr-10 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  type="number"
                  min={1900}
                  max={9998}
                  value={year || ""}
                  onChange={(e) => onYearChange(Number(e.target.value))}
                  placeholder="Ex. 2026"
                />
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label="Choisir une année disponible"
                    className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-md text-[#556B5C] hover:bg-[#F5F8F5] hover:text-[#17251C] disabled:opacity-50"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
              </div>
              <PopoverContent
                align="start"
                className="w-[180px] p-1.5 bg-white border border-[#D8E6DB] rounded-xl shadow-md"
              >
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#556B5C]">
                  Années disponibles
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {yearOptions.map((y) => {
                    const selected = y === year;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          onYearChange(y);
                          setYearMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors",
                          selected
                            ? "bg-[#006B2D] text-white"
                            : "text-[#17251C] hover:bg-[#F5F8F5]",
                        )}
                      >
                        <span className="tabular-nums">{y}</span>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

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
