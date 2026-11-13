import React, { useRef } from "react";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const inputRef = useRef<HTMLInputElement>(null);

  const getToday = () => new Date().toISOString().split("T")[0];
  const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  };

  const formattedDisplay = React.useMemo(() => {
    if (!value) return "";
    const [y, m, d] = value.split("-");
    if (!y || !m || !d) return value;
    return `${d}/${m}/${y}`;
  }, [value]);

  const handleContainerClick = () => {
    if (disabled) return;
    if (inputRef.current) {
      if (typeof (inputRef.current as any).showPicker === "function") {
        try {
          (inputRef.current as any).showPicker();
          return;
        } catch {
          // Fallback to focus
        }
      }
      inputRef.current.focus();
    }
  };

  return (
    <div className={cn("space-y-1.5 w-full min-w-0", className)}>
      {label && (
        <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">
          {label} {required && <span className="text-[#E52329]">*</span>}
        </label>
      )}

      <div
        onClick={handleContainerClick}
        className={cn(
          "relative flex items-center justify-between w-full min-h-[44px] px-3 py-2 bg-white rounded-lg border border-[#D8E6DB] cursor-pointer transition-all duration-150",
          "hover:border-[#006B2D] focus-within:border-[#006B2D] focus-within:ring-2 focus-within:ring-[#006B2D]/20",
          disabled && "opacity-60 cursor-not-allowed bg-slate-50"
        )}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <CalendarIcon className="h-4 w-4 text-[#006B2D] shrink-0" />
          <span
            className={cn(
              "text-sm font-medium tracking-tight select-none",
              value ? "text-[#17251C]" : "text-muted-foreground"
            )}
          >
            {formattedDisplay || "Choisir une date..."}
          </span>
        </div>

        {/* Hidden but accessible native input for rock-solid cross-platform picker */}
        <input
          ref={inputRef}
          type="date"
          value={value || ""}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 !opacity-0 cursor-pointer w-full h-full min-w-0"
          tabIndex={0}
          aria-label={label || "Date"}
        />

        {value && !disabled && !required && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 z-10"
            title="Effacer la date"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showPresets && !disabled && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onChange(getToday())}
            className={cn(
              "text-[11px] font-semibold px-2 py-0.5 rounded border transition-colors",
              value === getToday()
                ? "bg-[#006B2D] text-white border-[#006B2D]"
                : "bg-[#F5F8F5] text-[#006B2D] border-[#D8E6DB] hover:bg-[#E2EDE5]"
            )}
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            onClick={() => onChange(getYesterday())}
            className={cn(
              "text-[11px] font-semibold px-2 py-0.5 rounded border transition-colors",
              value === getYesterday()
                ? "bg-[#006B2D] text-white border-[#006B2D]"
                : "bg-[#F5F8F5] text-[#556B5C] border-[#D8E6DB] hover:bg-[#E2EDE5]"
            )}
          >
            Hier
          </button>
        </div>
      )}
    </div>
  );
}

export interface TimePickerCustomProps {
  label?: string;
  required?: boolean;
  value: string; // Format HH:mm
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
  const inputRef = useRef<HTMLInputElement>(null);

  const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
  };

  const handleContainerClick = () => {
    if (disabled) return;
    if (inputRef.current) {
      if (typeof (inputRef.current as any).showPicker === "function") {
        try {
          (inputRef.current as any).showPicker();
          return;
        } catch {
          // Fallback to focus
        }
      }
      inputRef.current.focus();
    }
  };

  return (
    <div className={cn("space-y-1.5 w-full min-w-0", className)}>
      {label && (
        <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">
          {label} {required && <span className="text-[#E52329]">*</span>}
        </label>
      )}

      <div
        onClick={handleContainerClick}
        className={cn(
          "relative flex items-center justify-between w-full min-h-[44px] px-3 py-2 bg-white rounded-lg border border-[#D8E6DB] cursor-pointer transition-all duration-150",
          "hover:border-[#006B2D] focus-within:border-[#006B2D] focus-within:ring-2 focus-within:ring-[#006B2D]/20",
          disabled && "opacity-60 cursor-not-allowed bg-slate-50"
        )}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Clock className="h-4 w-4 text-[#006B2D] shrink-0" />
          <span
            className={cn(
              "text-sm font-medium tracking-tight select-none",
              value ? "text-[#17251C]" : "text-muted-foreground"
            )}
          >
            {value || "Choisir l'heure..."}
          </span>
        </div>

        {/* Hidden but accessible native time input */}
        <input
          ref={inputRef}
          type="time"
          value={value || ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 !opacity-0 cursor-pointer w-full h-full min-w-0"
          tabIndex={0}
          aria-label={label || "Heure"}
        />

        {value && !disabled && !required && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 z-10"
            title="Effacer l'heure"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showPresets && !disabled && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onChange(getCurrentTime())}
            className="text-[11px] font-semibold px-2 py-0.5 rounded border border-[#D8E6DB] bg-[#F5F8F5] text-[#006B2D] hover:bg-[#E2EDE5] transition-colors"
          >
            Maintenant
          </button>
          <button
            type="button"
            onClick={() => onChange("12:00")}
            className="text-[11px] font-semibold px-2 py-0.5 rounded border border-[#D8E6DB] bg-[#F5F8F5] text-[#556B5C] hover:bg-[#E2EDE5] transition-colors"
          >
            12:00
          </button>
          <button
            type="button"
            onClick={() => onChange("18:00")}
            className="text-[11px] font-semibold px-2 py-0.5 rounded border border-[#D8E6DB] bg-[#F5F8F5] text-[#556B5C] hover:bg-[#E2EDE5] transition-colors"
          >
            18:00
          </button>
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
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}>
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
