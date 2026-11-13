import React, { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  Calendar,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePickerCustom } from "@/components/ui/date-picker-custom";

export type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

export interface SmartFilterState {
  search: string;
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
  operator: string;
  platformOrSupport: string;
  paymentOperator: string;
  secondaryType: string; // "Dépôt" | "Retrait" for transactions, or bet_type for tests
  proofFilter: string; // "" | "with" | "without"
  validationStatus: string; // "" | "valide" | "en_attente" | "refuse"
  minAmount: string;
  maxAmount: string;
}

export const INITIAL_SMART_FILTER: SmartFilterState = {
  search: "",
  datePreset: "all",
  startDate: "",
  endDate: "",
  operator: "",
  platformOrSupport: "",
  paymentOperator: "",
  secondaryType: "",
  proofFilter: "",
  validationStatus: "",
  minAmount: "",
  maxAmount: "",
};

/** Normalisation sans accents pour recherche intelligente multi-mots */
export function normalizeForSearch(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Vérifie si tous les mots saisis correspondent à au moins un champ de l'élément */
export function matchesSmartTokens(
  search: string,
  fields: Array<unknown>,
): boolean {
  const cleaned = normalizeForSearch(search);
  if (!cleaned) return true;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields.map(normalizeForSearch).join(" ");
  return tokens.every((token) => haystack.includes(token));
}

export function resolveDateBounds(filter: SmartFilterState): {
  start: string;
  end: string;
} {
  if (filter.datePreset === "all") return { start: "", end: "" };
  const today = new Date();
  const toIso = (d: Date) => d.toISOString().split("T")[0];

  if (filter.datePreset === "today") {
    const t = toIso(today);
    return { start: t, end: t };
  }
  if (filter.datePreset === "7d") {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { start: toIso(start), end: toIso(today) };
  }
  if (filter.datePreset === "30d") {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return { start: toIso(start), end: toIso(today) };
  }
  return { start: filter.startDate, end: filter.endDate };
}

export function applySmartFilter<T extends Record<string, any>>(
  items: T[],
  filter: SmartFilterState,
  mode: "transactions" | "tests",
): T[] {
  const { start, end } = resolveDateBounds(filter);
  const minAmt = filter.minAmount !== "" ? Number(filter.minAmount) : null;
  const maxAmt = filter.maxAmount !== "" ? Number(filter.maxAmount) : null;

  return items.filter((item) => {
    // 1. Recherche multi-mots
    if (
      !matchesSmartTokens(filter.search, [
        item.id,
        item.date,
        item.time,
        item.operator,
        item.platform,
        item.support,
        item.payment_operator,
        item.type,
        item.bet_type,
        item.status,
        item.amount_fcfa,
        item.phone,
        item.reference,
        item.notes,
      ])
    ) {
      return false;
    }

    // 2. Période
    if (start && (!item.date || item.date < start)) return false;
    if (end && (!item.date || item.date > end)) return false;

    // 3. Opérateur
    if (
      filter.operator &&
      normalizeForSearch(item.operator) !== normalizeForSearch(filter.operator)
    ) {
      return false;
    }

    // 4. Plateforme / Support
    if (filter.platformOrSupport) {
      const val =
        mode === "transactions"
          ? item.platform || item.support || ""
          : item.support || "";
      if (normalizeForSearch(val) !== normalizeForSearch(filter.platformOrSupport)) {
        return false;
      }
    }

    // 5. Opérateur de paiement (transactions)
    if (
      mode === "transactions" &&
      filter.paymentOperator &&
      normalizeForSearch(item.payment_operator) !==
        normalizeForSearch(filter.paymentOperator)
    ) {
      return false;
    }

    // 6. Type (Dépôt/Retrait pour transactions, Type de test pour tests)
    if (filter.secondaryType) {
      const target = mode === "transactions" ? item.type : item.bet_type;
      if (normalizeForSearch(target) !== normalizeForSearch(filter.secondaryType)) {
        return false;
      }
    }

    // 7. Preuve (transactions)
    if (mode === "transactions" && filter.proofFilter) {
      const hasProof =
        Boolean(item.proof_attachment_url) || item.proof_status === "disponible";
      if (filter.proofFilter === "with" && !hasProof) return false;
      if (filter.proofFilter === "without" && hasProof) return false;
    }

    // 8. Statut de validation
    if (filter.validationStatus) {
      const vs = item.validation_status || "en_attente";
      if (vs !== filter.validationStatus) return false;
    }

    // 9. Montant min / max
    const amt = Number(item.amount_fcfa) || 0;
    if (minAmt !== null && !Number.isNaN(minAmt) && amt < minAmt) return false;
    if (maxAmt !== null && !Number.isNaN(maxAmt) && amt > maxAmt) return false;

    return true;
  });
}

interface SmartFilterBarProps {
  mode: "transactions" | "tests";
  filter: SmartFilterState;
  onChange: (next: SmartFilterState) => void;
  operators: string[];
  platformsOrSupports: string[];
  paymentOperators?: string[];
  secondaryOptions: string[]; // ["Dépôt", "Retrait"] or betTypes
  totalCount: number;
  filteredCount: number;
  placeholder?: string;
}

export function SmartFilterBar({
  mode,
  filter,
  onChange,
  operators,
  platformsOrSupports,
  paymentOperators = [],
  secondaryOptions,
  totalCount,
  filteredCount,
  placeholder,
}: SmartFilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (filter.datePreset !== "all") {
      const label =
        filter.datePreset === "today"
          ? "Aujourd'hui"
          : filter.datePreset === "7d"
            ? "7 derniers jours"
            : filter.datePreset === "30d"
              ? "30 derniers jours"
              : `${filter.startDate || "..."} → ${filter.endDate || "..."}`;
      chips.push({
        key: "date",
        label: `Période: ${label}`,
        clear: () =>
          onChange({ ...filter, datePreset: "all", startDate: "", endDate: "" }),
      });
    }
    if (filter.operator) {
      chips.push({
        key: "operator",
        label: `Opérateur: ${filter.operator}`,
        clear: () => onChange({ ...filter, operator: "" }),
      });
    }
    if (filter.platformOrSupport) {
      chips.push({
        key: "plat",
        label: `${mode === "transactions" ? "Plateforme" : "Support"}: ${filter.platformOrSupport}`,
        clear: () => onChange({ ...filter, platformOrSupport: "" }),
      });
    }
    if (filter.paymentOperator) {
      chips.push({
        key: "payOp",
        label: `Paiement: ${filter.paymentOperator}`,
        clear: () => onChange({ ...filter, paymentOperator: "" }),
      });
    }
    if (filter.secondaryType) {
      chips.push({
        key: "type",
        label: `${mode === "transactions" ? "Type" : "Type de test"}: ${filter.secondaryType}`,
        clear: () => onChange({ ...filter, secondaryType: "" }),
      });
    }
    if (filter.proofFilter) {
      chips.push({
        key: "proof",
        label:
          filter.proofFilter === "with" ? "Preuve: Disponible" : "Preuve: Absente",
        clear: () => onChange({ ...filter, proofFilter: "" }),
      });
    }
    if (filter.validationStatus) {
      const lbl =
        filter.validationStatus === "valide"
          ? "Validé"
          : filter.validationStatus === "refuse"
            ? "Refusé"
            : "En attente";
      chips.push({
        key: "val",
        label: `Validation: ${lbl}`,
        clear: () => onChange({ ...filter, validationStatus: "" }),
      });
    }
    if (filter.minAmount || filter.maxAmount) {
      chips.push({
        key: "amount",
        label: `Montant: ${filter.minAmount || "0"} – ${filter.maxAmount || "∞"} F`,
        clear: () => onChange({ ...filter, minAmount: "", maxAmount: "" }),
      });
    }
    return chips;
  }, [filter, mode, onChange]);

  const hasAnyFilter = Boolean(filter.search) || activeChips.length > 0;

  return (
    <div className="space-y-3">
      {/* Ligne principale : Recherche multi-mots + sélecteurs rapides + bouton Filtres avancés */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#556B5C]" />
          <Input
            placeholder={
              placeholder ||
              "Recherche intelligente (ex: 1xBet Orange 1500, téléphone, référence...)"
            }
            value={filter.search}
            onChange={(e) => onChange({ ...filter, search: e.target.value })}
            className="pl-10 pr-8 h-10 bg-[#F5F8F5] border-[#D8E6DB] text-xs sm:text-sm text-[#17251C] placeholder:text-[#556B5C]/70 rounded-xl focus-visible:ring-[#006B2D]"
          />
          {filter.search && (
            <button
              type="button"
              onClick={() => onChange({ ...filter, search: "" })}
              aria-label="Effacer la recherche"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#556B5C] hover:text-[#17251C]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Opérateur rapide */}
          <select
            className="h-10 px-3 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] text-xs font-bold text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
            value={filter.operator}
            onChange={(e) => onChange({ ...filter, operator: e.target.value })}
          >
            <option value="">Tous les opérateurs</option>
            {operators.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>

          {/* Type rapide */}
          <select
            className="h-10 px-3 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] text-xs font-bold text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
            value={filter.secondaryType}
            onChange={(e) =>
              onChange({ ...filter, secondaryType: e.target.value })
            }
          >
            <option value="">
              {mode === "transactions" ? "Tous les types" : "Tous types de test"}
            </option>
            {secondaryOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          {/* Bouton Filtres avancés */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setExpanded((prev) => !prev)}
            className={`h-10 text-xs font-bold rounded-xl gap-1.5 ${
              expanded || activeChips.length > 0
                ? "bg-[#EBF7EE] text-[#006B2D] border-[#006B2D]/40"
                : "text-[#17251C] border-[#D8E6DB] hover:bg-[#F5F8F5]"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filtres</span>
            {activeChips.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-[#006B2D] text-white text-[10px] leading-none">
                {activeChips.length}
              </span>
            )}
          </Button>

          {hasAnyFilter && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(INITIAL_SMART_FILTER)}
              className="h-10 text-xs font-bold text-[#E52329] hover:bg-[#FEECEB] hover:text-[#E52329] rounded-xl gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Réinitialiser</span>
            </Button>
          )}
        </div>
      </div>

      {/* Panneau dépliable des filtres avancés */}
      {expanded && (
        <div className="p-4 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] space-y-3">
          {/* Périodes rapides */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-[#556B5C] uppercase tracking-wider flex items-center gap-1 mr-1">
              <Calendar className="h-3.5 w-3.5 text-[#006B2D]" />
              Période :
            </span>
            {(
              [
                { id: "all", label: "Toutes" },
                { id: "today", label: "Aujourd'hui" },
                { id: "7d", label: "7 jours" },
                { id: "30d", label: "30 jours" },
                { id: "custom", label: "Personnalisée" },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...filter,
                    datePreset: preset.id,
                    ...(preset.id !== "custom"
                      ? { startDate: "", endDate: "" }
                      : {}),
                  })
                }
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                  filter.datePreset === preset.id
                    ? "bg-[#006B2D] text-white border-[#006B2D]"
                    : "bg-white text-[#17251C] border-[#D8E6DB] hover:bg-[#EBF7EE]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {filter.datePreset === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
              <DatePickerCustom
                label="Date de début"
                value={filter.startDate}
                onChange={(val) => onChange({ ...filter, startDate: val })}
              />
              <DatePickerCustom
                label="Date de fin"
                value={filter.endDate}
                onChange={(val) => onChange({ ...filter, endDate: val })}
              />
            </div>
          )}

          {/* Facettes détaillées */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                {mode === "transactions" ? "Plateforme" : "Support"}
              </label>
              <select
                className="w-full h-9 px-3 rounded-lg border border-[#D8E6DB] bg-white text-xs font-semibold text-[#17251C]"
                value={filter.platformOrSupport}
                onChange={(e) =>
                  onChange({ ...filter, platformOrSupport: e.target.value })
                }
              >
                <option value="">Toutes</option>
                {platformsOrSupports.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {mode === "transactions" && (
              <div>
                <label className="text-[11px] font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                  Opérateur de paiement
                </label>
                <select
                  className="w-full h-9 px-3 rounded-lg border border-[#D8E6DB] bg-white text-xs font-semibold text-[#17251C]"
                  value={filter.paymentOperator}
                  onChange={(e) =>
                    onChange({ ...filter, paymentOperator: e.target.value })
                  }
                >
                  <option value="">Tous</option>
                  {paymentOperators.map((po) => (
                    <option key={po} value={po}>
                      {po}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mode === "transactions" && (
              <div>
                <label className="text-[11px] font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                  Preuve
                </label>
                <select
                  className="w-full h-9 px-3 rounded-lg border border-[#D8E6DB] bg-white text-xs font-semibold text-[#17251C]"
                  value={filter.proofFilter}
                  onChange={(e) =>
                    onChange({ ...filter, proofFilter: e.target.value })
                  }
                >
                  <option value="">Toutes</option>
                  <option value="with">Preuve disponible / jointe</option>
                  <option value="without">Sans preuve</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                Validation
              </label>
              <select
                className="w-full h-9 px-3 rounded-lg border border-[#D8E6DB] bg-white text-xs font-semibold text-[#17251C]"
                value={filter.validationStatus}
                onChange={(e) =>
                  onChange({ ...filter, validationStatus: e.target.value })
                }
              >
                <option value="">Tous les statuts</option>
                <option value="valide">Validé</option>
                <option value="en_attente">En attente</option>
                <option value="refuse">Refusé</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                  Montant min
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={filter.minAmount}
                  onChange={(e) =>
                    onChange({ ...filter, minAmount: e.target.value })
                  }
                  className="h-9 text-xs bg-white border-[#D8E6DB]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                  Montant max
                </label>
                <Input
                  type="number"
                  placeholder="∞"
                  value={filter.maxAmount}
                  onChange={(e) =>
                    onChange({ ...filter, maxAmount: e.target.value })
                  }
                  className="h-9 text-xs bg-white border-[#D8E6DB]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pilules des filtres actifs + compteur */}
      {(activeChips.length > 0 || filter.search) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EBF7EE] text-[#006B2D] border border-[#86EFAC] text-[11px] font-bold hover:bg-[#D1FAE5] transition-colors"
              >
                <span>{chip.label}</span>
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
          <span className="text-[11px] font-bold text-[#556B5C]">
            {filteredCount} résultat(s) sur {totalCount}
          </span>
        </div>
      )}
    </div>
  );
}
