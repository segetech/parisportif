import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useRecordFormReadOnly } from "@/components/common/RecordForm";

const MONTHS_FR_FULL = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const MONTHS_FR_SHORT = [
  "JAN.",
  "FÉV.",
  "MAR.",
  "AVR.",
  "MAI",
  "JUIN",
  "JUIL.",
  "AOÛT",
  "SEP.",
  "OCT.",
  "NOV.",
  "DÉC.",
];

const WEEKDAYS_FR_SHORT = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const WEEKDAYS_HEADER = ["LU", "MA", "ME", "JE", "VE", "SA", "DI"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoDate(value?: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function shiftIsoDate(value: string, deltaDays: number): string {
  const base = parseIsoDate(value) || new Date();
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return toLocalIsoDate(next);
}

function clampIsoDate(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

function isIsoWithinBounds(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

function getRelativeDayLabel(iso?: string): string | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (parsed.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === -1) return "Hier";
  if (diffDays === 1) return "Demain";
  if (diffDays < 0 && diffDays >= -30) return `Il y a ${Math.abs(diffDays)} j`;
  if (diffDays > 0 && diffDays <= 30) return `Dans ${diffDays} j`;
  return null;
}

function parseFrDisplayDate(input: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return parseIsoDate(iso) ? iso : null;
}

function formatFrDisplayDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return "";
  return `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
}

function buildCalendarCells(viewYear: number, viewMonth: number) {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  // Monday-first offset: Monday=0 ... Sunday=6
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const cells: Array<{
    iso: string;
    day: number;
    inCurrentMonth: boolean;
    isWeekend: boolean;
  }> = [];

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(viewYear, viewMonth, 1 - startOffset + i);
    const dayOfWeek = cellDate.getDay();
    cells.push({
      iso: toLocalIsoDate(cellDate),
      day: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === viewMonth,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });
  }
  return cells;
}

export interface DatePickerCustomProps {
  label?: string;
  required?: boolean;
  value: string; // Format YYYY-MM-DD
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  min?: string;
  max?: string;
  showPresets?: boolean;
}

export function DatePickerCustom({
  label,
  required,
  value,
  onChange,
  disabled,
  className,
  min,
  max,
  showPresets = true,
}: DatePickerCustomProps) {
  const [open, setOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"days" | "months">("days");

  const todayIso = toLocalIsoDate(new Date());
  const yesterdayIso = shiftIsoDate(todayIso, -1);

  const selectedDate = useMemo(() => parseIsoDate(value), [value]);

  const [viewYear, setViewYear] = useState<number>(() =>
    (selectedDate || new Date()).getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState<number>(() =>
    (selectedDate || new Date()).getMonth(),
  );
  const [manualInput, setManualInput] = useState<string>(() =>
    formatFrDisplayDate(value),
  );

  useEffect(() => {
    setManualInput(formatFrDisplayDate(value));
    const parsed = parseIsoDate(value);
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [value]);

  useEffect(() => {
    if (open) {
      setPickerMode("days");
      const base = parseIsoDate(value) || new Date();
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
    }
  }, [open, value]);

  const cells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const relativeBadge = useMemo(() => getRelativeDayLabel(value), [value]);

  const editorialTitle = useMemo(() => {
    if (!selectedDate) return null;
    const weekday = WEEKDAYS_FR_SHORT[selectedDate.getDay()];
    const day = selectedDate.getDate();
    const monthName = MONTHS_FR_FULL[selectedDate.getMonth()].toLowerCase();
    return `${weekday} ${day} ${monthName} ${selectedDate.getFullYear()}`;
  }, [selectedDate]);

  const commitDate = (iso: string, closePopover = true) => {
    if (!isIsoWithinBounds(iso, min, max)) return;
    onChange(iso);
    if (closePopover) setOpen(false);
  };

  const handleStepDay = (delta: number) => {
    if (disabled) return;
    const target = clampIsoDate(shiftIsoDate(value || todayIso, delta), min, max);
    onChange(target);
  };

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const quickDates = useMemo(() => {
    const firstOfMonth = `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}-01`;
    return [
      { label: "Aujourd'hui", iso: todayIso },
      { label: "Hier", iso: yesterdayIso },
      { label: "Avant-hier", iso: shiftIsoDate(todayIso, -2) },
      { label: "Il y a 7j", iso: shiftIsoDate(todayIso, -7) },
      { label: "1er du mois", iso: firstOfMonth },
    ].filter((item) => isIsoWithinBounds(item.iso, min, max));
  }, [todayIso, yesterdayIso, min, max]);

  const isReadOnly = Boolean(disabled || useRecordFormReadOnly());

  if (isReadOnly) {
    return (
      <div className={cn("space-y-1.5 w-full min-w-0", className)}>
        {label && (
          <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">
            {label} {required && <span className="text-[#E52329]">*</span>}
          </label>
        )}
        <div className="flex items-center gap-2 min-h-[42px] px-3 py-2 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] text-sm font-medium text-[#17251C]">
          <CalendarIcon className="h-4 w-4 text-[#556B5C] shrink-0" />
          <span className="truncate tabular-nums">
            {selectedDate ? formatFrDisplayDate(value) : "Non renseignée"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5 w-full min-w-0", className)}>
      {label && (
        <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">
          {label} {required && <span className="text-[#E52329]">*</span>}
        </label>
      )}

      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <div
          className={cn(
            "flex items-center w-full min-h-[46px] bg-white rounded-xl border border-[#D8E6DB] transition-all duration-150 overflow-hidden",
            "hover:border-[#006B2D] focus-within:border-[#006B2D] focus-within:ring-2 focus-within:ring-[#006B2D]/20",
            open && "border-[#006B2D] ring-2 ring-[#006B2D]/20",
            disabled && "opacity-60 cursor-not-allowed bg-slate-50",
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={label || "Date"}
              className="flex items-center gap-2.5 flex-1 min-w-0 px-2.5 py-1.5 text-left focus:outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              {selectedDate ? (
                <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-[#004D20] text-white shrink-0 border-b-2 border-[#FFD000]">
                  <span className="text-sm font-extrabold leading-none">
                    {pad2(selectedDate.getDate())}
                  </span>
                  <span className="text-[9px] font-bold tracking-wider text-[#FFD000] leading-none mt-0.5">
                    {MONTHS_FR_SHORT[selectedDate.getMonth()]}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#F5F8F5] border border-[#D8E6DB] text-[#006B2D] shrink-0">
                  <CalendarIcon className="h-4 w-4" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-[13px] sm:text-sm font-semibold tracking-tight leading-snug truncate",
                    selectedDate ? "text-[#17251C]" : "text-muted-foreground",
                  )}
                  title={editorialTitle || undefined}
                >
                  {editorialTitle || "Choisir une date..."}
                </div>
                {selectedDate && (
                  <p className="text-[11px] font-medium text-[#556B5C] tabular-nums mt-0.5 whitespace-nowrap">
                    {formatFrDisplayDate(value)}
                  </p>
                )}
              </div>
            </button>
          </PopoverTrigger>

          {!disabled && selectedDate && (
            <div className="flex items-center gap-0.5 pr-2 shrink-0">
              <button
                type="button"
                onClick={() => handleStepDay(-1)}
                title="Jour précédent (-1j)"
                aria-label="Jour précédent"
                className="h-7 px-1.5 rounded-md text-[11px] font-bold text-[#556B5C] hover:text-[#004D20] hover:bg-[#E8F3EC] transition-colors"
              >
                -1j
              </button>
              <button
                type="button"
                onClick={() => handleStepDay(1)}
                title="Jour suivant (+1j)"
                aria-label="Jour suivant"
                className="h-7 px-1.5 rounded-md text-[11px] font-bold text-[#556B5C] hover:text-[#004D20] hover:bg-[#E8F3EC] transition-colors"
              >
                +1j
              </button>
              {value && !required && (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  title="Effacer la date"
                  aria-label="Effacer la date"
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="w-[min(calc(100vw-1.5rem),344px)] max-h-[min(calc(100dvh-2rem),540px)] overflow-y-auto p-0 border-[#D8E6DB] bg-white shadow-xl rounded-xl z-50"
        >
          {/* Solid OPEN Header */}
          <div className="bg-[#004D20] text-white px-4 py-3 border-b-4 border-[#FFD000]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">
                Calendrier OPEN
              </span>
              {relativeBadge && (
                <span className="px-2 py-0.5 rounded-full bg-[#FFD000] text-[#004D20] text-[10px] font-extrabold">
                  {relativeBadge}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <div className="text-base font-extrabold tracking-tight capitalize truncate">
                {editorialTitle || "Sélectionnez un jour"}
              </div>
              <button
                type="button"
                onClick={() =>
                  setPickerMode((m) => (m === "days" ? "months" : "days"))
                }
                className="px-2.5 py-1 rounded-md bg-[#006B2D] hover:bg-emerald-700 text-white text-xs font-bold border border-emerald-500 shrink-0 transition-colors"
              >
                {pickerMode === "days"
                  ? `${MONTHS_FR_FULL[viewMonth].slice(0, 4)}. ${viewYear} ▾`
                  : "Retour jours"}
              </button>
            </div>
          </div>

          {/* Quick Jump Strip */}
          {quickDates.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 px-3 py-2 bg-[#F5F8F5] border-b border-[#D8E6DB]">
              {quickDates.map((item) => {
                const active = value === item.iso;

  return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => commitDate(item.iso)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition-colors border",
                      active
                        ? "bg-[#006B2D] text-white border-[#006B2D]"
                        : "bg-white text-[#004D20] border-[#D8E6DB] hover:bg-[#E8F3EC]",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {pickerMode === "days" ? (
            <div className="p-3">
              {/* Month/Year Navigation Bar */}
              <div className="flex items-center justify-between mb-2.5">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  aria-label="Mois précédent"
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] hover:bg-[#E8F3EC] text-[#004D20]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPickerMode("months")}
                  className="text-sm font-extrabold text-[#17251C] hover:text-[#006B2D] px-2 py-1 rounded-md hover:bg-[#F5F8F5]"
                >
                  {MONTHS_FR_FULL[viewMonth]} {viewYear}
                </button>
                <button
                  type="button"
                  onClick={goNextMonth}
                  aria-label="Mois suivant"
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] hover:bg-[#E8F3EC] text-[#004D20]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS_HEADER.map((wd) => (
                  <div
                    key={wd}
                    className="text-center text-[10px] font-extrabold tracking-wider text-[#556B5C] py-1"
                  >
                    {wd}
                  </div>
                ))}
              </div>

              {/* 42-cell Monthly Grid */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell) => {
                  const isSelected = value === cell.iso;
                  const isToday = todayIso === cell.iso;
                  const allowed = isIsoWithinBounds(cell.iso, min, max);


  return (
                    <button
                      key={cell.iso}
                      type="button"
                      disabled={!allowed}
                      onClick={() => commitDate(cell.iso)}
                      aria-label={`Choisir le ${formatFrDisplayDate(cell.iso)}`}
                      className={cn(
                        "relative h-9 rounded-lg text-xs font-semibold tabular-nums flex items-center justify-center transition-colors",
                        !cell.inCurrentMonth && "text-slate-400",
                        cell.inCurrentMonth &&
                          !isSelected &&
                          (cell.isWeekend
                            ? "bg-[#F5F8F5] text-[#17251C]"
                            : "text-[#17251C]"),
                        !isSelected &&
                          allowed &&
                          "hover:bg-[#E8F3EC] hover:text-[#004D20]",
                        isToday &&
                          !isSelected &&
                          "ring-2 ring-[#FFD000] font-extrabold text-[#004D20]",
                        isSelected &&
                          "bg-[#006B2D] text-white font-extrabold shadow-sm",
                        !allowed && "opacity-35 cursor-not-allowed",
                      )}
                    >
                      {cell.day}
                      {isToday && (
                        <span
                          className={cn(
                            "absolute bottom-1 h-1 w-1 rounded-full",
                            isSelected ? "bg-[#FFD000]" : "bg-[#006B2D]",
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {/* Year Switcher */}
              <div className="flex items-center justify-between bg-[#F5F8F5] border border-[#D8E6DB] rounded-lg px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y - 1)}
                  aria-label="Année précédente"
                  className="h-7 w-7 flex items-center justify-center rounded bg-white border border-[#D8E6DB] text-[#004D20] hover:bg-[#E8F3EC]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-extrabold text-[#004D20] tabular-nums">
                  {viewYear}
                </span>
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y + 1)}
                  aria-label="Année suivante"
                  className="h-7 w-7 flex items-center justify-center rounded bg-white border border-[#D8E6DB] text-[#004D20] hover:bg-[#E8F3EC]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* 12 Months Grid */}
              <div className="grid grid-cols-3 gap-2">
                {MONTHS_FR_FULL.map((mName, idx) => {
                  const isActiveMonth = idx === viewMonth;

  return (
                    <button
                      key={mName}
                      type="button"
                      onClick={() => {
                        setViewMonth(idx);
                        setPickerMode("days");
                      }}
                      className={cn(
                        "py-2 px-2 rounded-lg text-xs font-bold border transition-colors",
                        isActiveMonth
                          ? "bg-[#006B2D] text-white border-[#006B2D]"
                          : "bg-white text-[#17251C] border-[#D8E6DB] hover:bg-[#E8F3EC] hover:text-[#004D20]",
                      )}
                    >
                      {mName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Direct Keyboard Input Footer */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-[#F5F8F5] border-t border-[#D8E6DB]">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[11px] font-bold text-[#556B5C] shrink-0">
                Saisie :
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="JJ/MM/AAAA"
                value={manualInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setManualInput(val);
                  const iso = parseFrDisplayDate(val);
                  if (iso && isIsoWithinBounds(iso, min, max)) {
                    onChange(iso);
                  }
                }}
                className="w-28 h-7 px-2 text-xs font-semibold tabular-nums rounded border border-[#D8E6DB] bg-white text-[#17251C] focus:outline-none focus:border-[#006B2D]"
                aria-label="Saisie directe JJ/MM/AAAA"
              />
            </div>
            <button
              type="button"
              onClick={() => commitDate(todayIso)}
              disabled={!isIsoWithinBounds(todayIso, min, max)}
              className="px-2.5 py-1 rounded-md bg-[#004D20] text-white text-[11px] font-bold hover:bg-[#006B2D] disabled:opacity-40 transition-colors"
            >
              Aujourd'hui
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {showPresets && !disabled && (
        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => commitDate(todayIso, false)}
            className={cn(
              "text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors",
              value === todayIso
                ? "bg-[#006B2D] text-white border-[#006B2D]"
                : "bg-[#F5F8F5] text-[#006B2D] border-[#D8E6DB] hover:bg-[#E2EDE5]",
            )}
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            onClick={() => commitDate(yesterdayIso, false)}
            className={cn(
              "text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors",
              value === yesterdayIso
                ? "bg-[#006B2D] text-white border-[#006B2D]"
                : "bg-[#F5F8F5] text-[#556B5C] border-[#D8E6DB] hover:bg-[#E2EDE5]",
            )}
          >
            Hier
          </button>
        </div>
      )}
    </div>
  );
}

type DayPeriod = "nuit" | "matin" | "apres_midi" | "soir";

function normalizeTimeValue(raw?: string): { hour: number; minute: number; formatted: string } | null {
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m, formatted: `${pad2(h)}:${pad2(m)}` };
}

function getDayPeriodInfo(hour: number): {
  id: DayPeriod;
  label: string;
  Icon: typeof Sun;
} {
  if (hour >= 6 && hour < 12) return { id: "matin", label: "Matin", Icon: Sunrise };
  if (hour >= 12 && hour < 18) return { id: "apres_midi", label: "Après-midi", Icon: Sun };
  if (hour >= 18) return { id: "soir", label: "Soir", Icon: Sunset };
  return { id: "nuit", label: "Nuit", Icon: Moon };
}

const PERIOD_BLOCKS: Array<{
  id: DayPeriod;
  label: string;
  range: [number, number];
}> = [
  { id: "matin", label: "Matin", range: [6, 11] },
  { id: "apres_midi", label: "Après-midi", range: [12, 17] },
  { id: "soir", label: "Soirée", range: [18, 23] },
  { id: "nuit", label: "Nuit", range: [0, 5] },
];

const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export interface TimePickerCustomProps {
  label?: string;
  required?: boolean;
  value: string; // Format HH:mm (or HH:mm:ss)
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  showPresets?: boolean;
}

export function TimePickerCustom({
  label,
  required,
  value,
  onChange,
  disabled,
  className,
  showPresets = true,
}: TimePickerCustomProps) {
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => normalizeTimeValue(value), [value]);
  const activeHour = parsed?.hour ?? new Date().getHours();
  const activeMinute = parsed?.minute ?? 0;

  const [focusedPeriod, setFocusedPeriod] = useState<DayPeriod>(
    () => getDayPeriodInfo(activeHour).id,
  );
  const [manualTime, setManualTime] = useState<string>(parsed?.formatted || "");

  useEffect(() => {
    setManualTime(parsed?.formatted || "");
    if (parsed) {
      setFocusedPeriod(getDayPeriodInfo(parsed.hour).id);
    }
  }, [parsed]);

  const getCurrentTime = () => {
    const now = new Date();
    return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  };

  const commitTime = (h: number, m: number, closeAfter = false) => {
    const clampedH = ((h % 24) + 24) % 24;
    const clampedM = ((m % 60) + 60) % 60;
    onChange(`${pad2(clampedH)}:${pad2(clampedM)}`);
    if (closeAfter) setOpen(false);
  };

  const stepMinutes = (delta: number) => {
    if (disabled) return;
    const baseTotal = parsed ? parsed.hour * 60 + parsed.minute : activeHour * 60 + activeMinute;
    const nextTotal = ((baseTotal + delta) % 1440 + 1440) % 1440;
    commitTime(Math.floor(nextTotal / 60), nextTotal % 60);
  };

  const periodInfo = parsed ? getDayPeriodInfo(parsed.hour) : null;
  const PeriodIcon = periodInfo ? periodInfo.Icon : Clock;

  const isReadOnly = Boolean(disabled || useRecordFormReadOnly());

  if (isReadOnly) {
    return (
      <div className={cn("space-y-1.5 w-full min-w-0", className)}>
        {label && (
          <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">
            {label} {required && <span className="text-[#E52329]">*</span>}
          </label>
        )}
        <div className="flex items-center gap-2 min-h-[42px] px-3 py-2 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] text-sm font-medium text-[#17251C]">
          <Clock className="h-4 w-4 text-[#556B5C] shrink-0" />
          <span className="truncate tabular-nums">
            {parsed ? `${pad2(parsed.hour)}:${pad2(parsed.minute)}` : "Non renseignée"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5 w-full min-w-0", className)}>
      {label && (
        <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">
          {label} {required && <span className="text-[#E52329]">*</span>}
        </label>
      )}

      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <div
          className={cn(
            "flex items-center w-full min-h-[46px] bg-white rounded-xl border border-[#D8E6DB] transition-all duration-150 overflow-hidden",
            "hover:border-[#006B2D] focus-within:border-[#006B2D] focus-within:ring-2 focus-within:ring-[#006B2D]/20",
            open && "border-[#006B2D] ring-2 ring-[#006B2D]/20",
            disabled && "opacity-60 cursor-not-allowed bg-slate-50",
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={label || "Heure"}
              className="flex items-center gap-2.5 flex-1 min-w-0 px-2.5 py-1.5 text-left focus:outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
                  parsed
                    ? "bg-[#004D20] text-[#FFD000] border-b-2 border-[#FFD000]"
                    : "bg-[#F5F8F5] border border-[#D8E6DB] text-[#006B2D]",
                )}
              >
                <PeriodIcon className="h-4 w-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-sm font-bold tracking-tight tabular-nums whitespace-nowrap",
                    parsed ? "text-[#17251C]" : "text-muted-foreground font-semibold truncate",
                  )}
                >
                  {parsed ? `${pad2(parsed.hour)} : ${pad2(parsed.minute)}` : "Choisir l'heure..."}
                </div>
              </div>
            </button>
          </PopoverTrigger>

          {!disabled && parsed && (
            <div className="flex items-center gap-0.5 pr-2 shrink-0">
              <button
                type="button"
                onClick={() => stepMinutes(-15)}
                title="Reculer de 15 min"
                aria-label="Reculer de 15 minutes"
                className="h-7 px-1.5 rounded-md text-[11px] font-bold text-[#556B5C] hover:text-[#004D20] hover:bg-[#E8F3EC] transition-colors"
              >
                -15m
              </button>
              <button
                type="button"
                onClick={() => stepMinutes(15)}
                title="Avancer de 15 min"
                aria-label="Avancer de 15 minutes"
                className="h-7 px-1.5 rounded-md text-[11px] font-bold text-[#556B5C] hover:text-[#004D20] hover:bg-[#E8F3EC] transition-colors"
              >
                +15m
              </button>
              {value && !required && (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  title="Effacer l'heure"
                  aria-label="Effacer l'heure"
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="w-[min(calc(100vw-1.5rem),356px)] max-h-[min(calc(100dvh-2rem),540px)] overflow-y-auto p-0 border-[#D8E6DB] bg-white shadow-xl rounded-xl z-50"
        >
          {/* Solid OPEN Digital Header */}
          <div className="bg-[#004D20] text-white px-4 py-3 border-b-4 border-[#FFD000]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">
                Horloge OPEN 24H
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange(getCurrentTime());
                  setOpen(false);
                }}
                className="px-2.5 py-0.5 rounded-full bg-[#FFD000] text-[#004D20] text-[11px] font-extrabold hover:bg-amber-300 transition-colors"
              >
                Maintenant
              </button>
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1.5 tabular-nums">
                <span className="px-2.5 py-1 rounded-lg bg-[#006B2D] border border-emerald-500 text-2xl font-extrabold leading-none">
                  {pad2(activeHour)}
                </span>
                <span className="text-xl font-black text-[#FFD000]">:</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#006B2D] border border-emerald-500 text-2xl font-extrabold leading-none">
                  {pad2(activeMinute)}
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-100">
                {getDayPeriodInfo(activeHour).label}
              </span>
            </div>
          </div>

          {/* Day Period Quick Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 p-2 bg-[#F5F8F5] border-b border-[#D8E6DB]">
            {PERIOD_BLOCKS.map((block) => {
              const active = focusedPeriod === block.id;

  return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => {
                    setFocusedPeriod(block.id);
                    if (
                      activeHour < block.range[0] ||
                      activeHour > block.range[1]
                    ) {
                      commitTime(block.range[0], activeMinute);
                    }
                  }}
                  className={cn(
                    "py-1 px-1.5 rounded-md text-[11px] font-bold transition-colors border",
                    active
                      ? "bg-[#006B2D] text-white border-[#006B2D]"
                      : "bg-white text-[#556B5C] border-[#D8E6DB] hover:bg-[#E8F3EC]",
                  )}
                >
                  {block.label}
                </button>
              );
            })}
          </div>

          {/* 24-Hour Tactile Matrix (6x4) */}
          <div className="p-3 space-y-3">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#556B5C] mb-1.5">
                Heures (00h – 23h)
              </div>
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 24 }, (_, h) => {
                  const isSelectedHour = parsed?.hour === h;
                  const periodRange = PERIOD_BLOCKS.find(
                    (b) => b.id === focusedPeriod,
                  )?.range;
                  const inFocusedRange =
                    periodRange && h >= periodRange[0] && h <= periodRange[1];


  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => commitTime(h, activeMinute)}
                      aria-label={`Heure ${pad2(h)}`}
                      className={cn(
                        "h-8 rounded-lg text-xs font-bold tabular-nums border transition-colors",
                        isSelectedHour
                          ? "bg-[#006B2D] text-white border-[#006B2D]"
                          : inFocusedRange
                            ? "bg-[#E8F3EC] text-[#004D20] border-[#C2DEC9] hover:bg-[#006B2D] hover:text-white"
                            : "bg-white text-slate-600 border-[#D8E6DB] hover:bg-[#F5F8F5]",
                      )}
                    >
                      {pad2(h)}h
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dual-Speed Minute Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#556B5C]">
                  Minutes (pas de 5 min & ajustement fin)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => stepMinutes(-1)}
                    aria-label="Reculer de 1 minute"
                    className="px-2 py-0.5 rounded border border-[#D8E6DB] bg-[#F5F8F5] text-[11px] font-bold text-[#004D20] hover:bg-[#E8F3EC]"
                  >
                    -1m
                  </button>
                  <button
                    type="button"
                    onClick={() => stepMinutes(1)}
                    aria-label="Avancer de 1 minute"
                    className="px-2 py-0.5 rounded border border-[#D8E6DB] bg-[#F5F8F5] text-[11px] font-bold text-[#004D20] hover:bg-[#E8F3EC]"
                  >
                    +1m
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-1">
                {MINUTE_STEPS.map((minStep) => {
                  const isSelectedMin = parsed?.minute === minStep;

  return (
                    <button
                      key={minStep}
                      type="button"
                      onClick={() => commitTime(activeHour, minStep)}
                      aria-label={`Minute ${pad2(minStep)}`}
                      className={cn(
                        "h-8 rounded-lg text-xs font-bold tabular-nums border transition-colors",
                        isSelectedMin
                          ? "bg-[#004D20] text-[#FFD000] border-[#004D20]"
                          : "bg-[#F5F8F5] text-[#17251C] border-[#D8E6DB] hover:bg-[#E8F3EC]",
                      )}
                    >
                      :{pad2(minStep)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Direct Input Footer + Done */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-[#F5F8F5] border-t border-[#D8E6DB]">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-[#556B5C]">
                Précis :
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={manualTime}
                onChange={(e) => {
                  const val = e.target.value;
                  setManualTime(val);
                  const norm = normalizeTimeValue(val);
                  if (norm) onChange(norm.formatted);
                }}
                className="w-20 h-7 px-2 text-xs font-bold tabular-nums rounded border border-[#D8E6DB] bg-white text-[#17251C] focus:outline-none focus:border-[#006B2D]"
                aria-label="Saisie directe HH:MM"
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 rounded-md bg-[#006B2D] text-white text-[11px] font-bold hover:bg-[#004D20] transition-colors"
            >
              Valider
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {showPresets && !disabled && (
        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => onChange(getCurrentTime())}
            className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-[#D8E6DB] bg-[#F5F8F5] text-[#006B2D] hover:bg-[#E2EDE5] transition-colors"
          >
            Maintenant
          </button>
          {["09:00", "12:00", "15:00", "18:00", "21:00"].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={cn(
                "text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors tabular-nums",
                parsed?.formatted === preset
                  ? "bg-[#006B2D] text-white border-[#006B2D]"
                  : "bg-[#F5F8F5] text-[#556B5C] border-[#D8E6DB] hover:bg-[#E2EDE5]",
              )}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface DateTimeRowProps {
  date: string;
  time: string;
  onDateChange: (val: string) => void;
  onTimeChange: (val: string) => void;
  dateLabel?: string;
  timeLabel?: string;
  requiredDate?: boolean;
  requiredTime?: boolean;
  disabled?: boolean;
  className?: string;
}

export function DateTimeRow({
  date,
  time,
  onDateChange,
  onTimeChange,
  dateLabel = "Date",
  timeLabel = "Heure",
  requiredDate = true,
  requiredTime = false,
  disabled = false,
  className,
}: DateTimeRowProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-3", className)}>
      <DatePickerCustom
        label={dateLabel}
        required={requiredDate}
        value={date}
        onChange={onDateChange}
        disabled={disabled}
      />
      <TimePickerCustom
        label={timeLabel}
        required={requiredTime}
        value={time}
        onChange={onTimeChange}
        disabled={disabled}
      />
    </div>
  );
}
