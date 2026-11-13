import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  Filter,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Download,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useLookups } from "@/hooks/use-data-queries";
import { useSettings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import {
  currentReportPeriod,
  customReportPeriod,
  reportPeriod,
} from "@/lib/report-periods";
import {
  fetchOpenReport,
  fetchPeriodOperatorSummary,
  type PeriodOperatorSummary,
  type ReportFilters,
} from "@/lib/open-report-data";
import {
  exportOpenReportPDF,
  triggerOpenReportCsvDownload,
} from "@/lib/open-report-exports";
import { isLegalOperator } from "@/lib/operator-classification";
import { PeriodSelector, type PeriodMode } from "@/components/reports/PeriodSelector";
import { cn } from "@/lib/utils";

export interface OpenReportSelection {
  start: string;
  end: string;
  label: string;
  selectedOperators: string[];
  scope: ReportFilters["scope"];
  selectedValidations: string[];
}

export function OpenReportExport({
  initialOperator = "",
  onBusyChange,
  onSelectionChange,
}: {
  initialOperator?: string;
  onBusyChange?: (busy: boolean) => void;
  onSelectionChange?: (selection: OpenReportSelection) => void;
}) {
  const initial = useMemo(() => currentReportPeriod(), []);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("fixed");
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [tranche, setTranche] = useState<number>(initial.tranche);
  const [customStart, setCustomStart] = useState(initial.start);
  const [customEnd, setCustomEnd] = useState(initial.end);

  const [operator, setOperator] = useState(initialOperator);
  const [selectedOperators, setSelectedOperators] = useState<string[]>(() =>
    initialOperator ? [initialOperator] : [],
  );
  const [operatorCategory, setOperatorCategory] = useState<
    "all" | "legal" | "illegal"
  >("all");
  const [operatorDisplayFilter, setOperatorDisplayFilter] = useState<
    "all" | "legal" | "illegal"
  >("all");
  const [showZeroOperators, setShowZeroOperators] = useState(false);

  const [validation, setValidation] = useState("");
  const [selectedValidations, setSelectedValidations] = useState<string[]>([]);
  const [scope, setScope] = useState<ReportFilters["scope"]>("all");

  const [periodSummary, setPeriodSummary] =
    useState<PeriodOperatorSummary | null>(null);
  const [scanning, setScanning] = useState(false);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const lock = useRef(false);
  const mounted = useRef(true);
  const scanReqId = useRef(0);
  const manualSelectionKeyRef = useRef<string | null>(
    initialOperator ? "__initial__" : null,
  );

  const { user } = useAuth();
  const { settings } = useSettings();
  const activeUser = useRef(user);
  activeUser.current = user;
  const { data: lookups } = useLookups();

  const allKnownOperators = useMemo(() => {
    const detected = periodSummary?.detectedOperators || [];
    const list = [
      ...new Set([
        ...(lookups?.operatorNames || []),
        ...detected,
        ...(initialOperator ? [initialOperator] : []),
      ]),
    ].filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b, "fr"));
  }, [lookups?.operatorNames, periodSummary?.detectedOperators, initialOperator]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const period = useMemo(() => {
    try {
      return periodMode === "custom"
        ? customReportPeriod(customStart, customEnd)
        : reportPeriod(year, month, tranche);
    } catch {
      return null;
    }
  }, [periodMode, customStart, customEnd, year, month, tranche]);

  useEffect(() => {
    if (!onSelectionChange || !period) return;
    onSelectionChange({
      start: period.start,
      end: period.end,
      label: period.label,
      selectedOperators,
      scope,
      selectedValidations,
    });
  }, [onSelectionChange, period, selectedOperators, scope, selectedValidations]);

  const userRole = (user?.role || "").toUpperCase();
  const allowed =
    !!user &&
    ["ADMIN", "CONTROLEUR", "AGENT"].includes(userRole) &&
    (userRole !== "AGENT" || settings.agentCanExport);

  const detectionKey = useMemo(() => {
    if (!period) return "";
    return `${period.start}|${period.end}|${scope || "all"}|${[...selectedValidations].sort().join(",")}`;
  }, [period, scope, selectedValidations]);

  // Smart detection of operators that actually have data in the chosen period
  useEffect(() => {
    if (!period || !allowed) {
      setPeriodSummary(null);
      return;
    }
    const reqId = ++scanReqId.current;
    const timer = setTimeout(() => {
      setScanning(true);
      fetchPeriodOperatorSummary(supabase, {
        period,
        scope,
        validations: selectedValidations.length > 0 ? selectedValidations : undefined,
      })
        .then((summary) => {
          if (!mounted.current || scanReqId.current !== reqId) return;
          setPeriodSummary(summary);
          // Auto-select operators with data (including detected illegals) unless user manually overrode this key
          if (
            manualSelectionKeyRef.current !== "__initial__" &&
            manualSelectionKeyRef.current !== detectionKey
          ) {
            setSelectedOperators([...summary.detectedOperators]);
            setOperator("");
            setOperatorCategory("all");
          }
        })
        .catch(() => {
          if (!mounted.current || scanReqId.current !== reqId) return;
          setPeriodSummary(null);
        })
        .finally(() => {
          if (mounted.current && scanReqId.current === reqId) {
            setScanning(false);
          }
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [detectionKey, period, allowed, scope, selectedValidations]);

  const detectedOperators = useMemo(
    () => periodSummary?.detectedOperators || [],
    [periodSummary],
  );

  // Base list shown in the operator grid: by default only operators with data in the period
  const baseOperators = useMemo(() => {
    if (!periodSummary || showZeroOperators) {
      return allKnownOperators;
    }
    return detectedOperators;
  }, [periodSummary, showZeroOperators, allKnownOperators, detectedOperators]);

  const legalOperators = useMemo(
    () => baseOperators.filter((op) => isLegalOperator(op)),
    [baseOperators],
  );
  const illegalOperators = useMemo(
    () => baseOperators.filter((op) => !isLegalOperator(op)),
    [baseOperators],
  );

  const displayedOperators = useMemo(() => {
    if (operatorDisplayFilter === "legal") return legalOperators;
    if (operatorDisplayFilter === "illegal") return illegalOperators;
    return baseOperators;
  }, [operatorDisplayFilter, legalOperators, illegalOperators, baseOperators]);

  const zeroCount = Math.max(0, allKnownOperators.length - detectedOperators.length);

  function markManual() {
    manualSelectionKeyRef.current = detectionKey || "__manual__";
  }

  function handleQuickOperatorChange(value: string) {
    markManual();
    if (value === "__smart__") {
      applySmartSelection();
      return;
    }
    if (value === "__legal__") {
      const pool = periodSummary ? periodSummary.legal : legalOperators;
      setOperatorCategory("legal");
      setSelectedOperators([...pool]);
      setOperator("");
      setOperatorDisplayFilter("legal");
      return;
    }
    if (value === "__illegal__") {
      const pool = periodSummary ? periodSummary.illegal : illegalOperators;
      setOperatorCategory("illegal");
      setSelectedOperators([...pool]);
      setOperator("");
      setOperatorDisplayFilter("illegal");
      return;
    }
    setOperator(value);
    setOperatorCategory("all");
    if (!value) {
      setSelectedOperators(periodSummary ? [...periodSummary.detectedOperators] : []);
    } else {
      setSelectedOperators([value]);
    }
  }

  function toggleOperator(op: string) {
    markManual();
    setSelectedOperators((prev) => {
      const exists = prev.includes(op);
      const next = exists ? prev.filter((x) => x !== op) : [...prev, op];
      if (next.length === 1) {
        setOperator(next[0]);
      } else {
        setOperator("");
      }
      return next;
    });
  }

  function applySmartSelection() {
    manualSelectionKeyRef.current = null;
    const pool = periodSummary ? periodSummary.detectedOperators : allKnownOperators;
    setSelectedOperators([...pool]);
    setOperator("");
    setOperatorCategory("all");
    setOperatorDisplayFilter("all");
  }

  function selectLegalOnly() {
    markManual();
    const pool = periodSummary ? periodSummary.legal : legalOperators;
    setSelectedOperators([...pool]);
    setOperator("");
    setOperatorCategory("legal");
  }

  function selectIllegalOnly() {
    markManual();
    const pool = periodSummary ? periodSummary.illegal : illegalOperators;
    setSelectedOperators([...pool]);
    setOperator("");
    setOperatorCategory("illegal");
  }

  function clearOperators() {
    markManual();
    setSelectedOperators([]);
    setOperator("");
    setOperatorCategory("all");
  }

  function toggleValidation(val: string) {
    setSelectedValidations((prev) => {
      const exists = prev.includes(val);
      const next = exists ? prev.filter((x) => x !== val) : [...prev, val];
      if (next.length === 1) {
        setValidation(next[0]);
      } else {
        setValidation("");
      }
      return next;
    });
  }

  async function generate(format: "xlsx" | "pdf" | "csv" = "xlsx") {
    if (lock.current || !period || !allowed) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setMessage("Vérification des accès et lecture des données…");
    const account = user.id;

    const effectiveOperators =
      selectedOperators.length > 0
        ? selectedOperators
        : operator
          ? [operator]
          : undefined;
    const effectiveValidations =
      selectedValidations.length > 0
        ? selectedValidations
        : validation
          ? [validation]
          : undefined;

    // Freeze the entire selection for this job, independent of subsequent renders.
    const selection: ReportFilters = structuredClone({
      period,
      operator:
        effectiveOperators && effectiveOperators.length === 1
          ? effectiveOperators[0]
          : operator || undefined,
      operators: effectiveOperators,
      operatorCategory,
      validation:
        effectiveValidations && effectiveValidations.length === 1
          ? effectiveValidations[0]
          : validation || undefined,
      validations: effectiveValidations,
      scope,
    });

    try {
      const data = await fetchOpenReport(supabase, selection, (status) => {
        if (mounted.current) setMessage(status);
      });
      if (!mounted.current || activeUser.current?.id !== account) return;

      if (format === "csv") {
        setMessage("Génération du fichier CSV…");
        const csvResult = triggerOpenReportCsvDownload(data);
        if (!mounted.current || activeUser.current?.id !== account) return;
        setMessage(
          `${csvResult.summary.tests.length} test(s), ${csvResult.summary.deposits.length} dépôt(s), ${csvResult.summary.withdrawals.length} retrait(s) exportés en CSV (${csvResult.filename}).`,
        );
        return;
      }

      if (format === "pdf") {
        setMessage("Génération du document PDF…");
        const pdfResult = await exportOpenReportPDF(data);
        if (!mounted.current || activeUser.current?.id !== account) return;
        setMessage(
          `${pdfResult.summary.tests.length} test(s), ${pdfResult.summary.deposits.length} dépôt(s), ${pdfResult.summary.withdrawals.length} retrait(s) exportés en PDF (${pdfResult.filename}).`,
        );
        return;
      }

      setMessage("Construction des onglets et des graphiques Excel…");
      await new Promise((resolve) => setTimeout(resolve, 0));
      const { buildOpenReport } = await import("@/lib/open-report-workbook");
      const report = await buildOpenReport(data);
      if (!mounted.current || activeUser.current?.id !== account) return;
      if (
        report.summary.tests.length === 0 &&
        report.summary.deposits.length === 0 &&
        report.summary.withdrawals.length === 0 &&
        report.summary.anomalies.length === 0
      ) {
        setMessage("Aucune donnée trouvée pour cette période.");
        return;
      }
      const url = URL.createObjectURL(
        new Blob([report.bytes as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = report.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `${report.summary.tests.length} test(s), ${report.summary.deposits.length} dépôt(s), ${report.summary.withdrawals.length} retrait(s) exportés. ${report.operators.size} onglet(s) opérateur. Les graphiques sont modifiables dans Excel.`,
      );
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Le rapport n’a pas pu être généré.",
        );
        setMessage("");
      }
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  const VALIDATION_OPTIONS = [
    { id: "en_attente", label: "En attente" },
    { id: "valide", label: "Validés" },
    { id: "refuse", label: "Refusés" },
  ];

  const hasDetectedIllegals = (periodSummary?.illegal.length || 0) > 0;

  return (
    <section
      className="space-y-6 rounded-2xl border border-[#D8E6DB] bg-white p-4 shadow-xs sm:p-6"
      aria-label="Rapport Excel par période"
    >
      {/* En-tête de section */}
      <div className="flex flex-col gap-3 border-b border-[#E2ECE4] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F3EC] text-[#006B2D] border border-[#C2DEC9]">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[#17251C] sm:text-lg">
              Export officiel OPEN (Excel, PDF, CSV)
            </h2>
            <p className="text-xs text-[#556B5C] sm:text-sm">
              Détection automatique des opérateurs actifs sur la période, graphiques natifs modifiables et filtrage strict.
            </p>
          </div>
        </div>
        {periodSummary && (
          <div className="inline-flex items-center gap-2 self-start rounded-xl border border-[#C2DEC9] bg-[#E8F3EC] px-3 py-1.5 text-xs font-bold text-[#004D20]">
            <Sparkles className="h-3.5 w-3.5 text-[#006B2D]" />
            <span>
              {periodSummary.totalRows} opération(s) sur la période
            </span>
          </div>
        )}
      </div>

      <fieldset disabled={busy} className="space-y-5">
        {/* Étape 1 : Période */}
        <div className="space-y-2.5 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#006B2D]">
              1. Période du rapport
            </span>
          </div>
          <PeriodSelector
            year={year}
            month={month}
            tranche={tranche}
            onYearChange={setYear}
            onMonthChange={setMonth}
            onTrancheChange={setTranche}
            mode={periodMode}
            onModeChange={setPeriodMode}
            allowCustomMode
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            disabled={busy}
          />
        </div>

        {/* Étape 2 : Périmètre & Filtres rapides */}
        <div className="space-y-3 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] p-3.5 sm:p-4">
          <span className="block text-xs font-extrabold uppercase tracking-wider text-[#006B2D]">
            2. Périmètre &amp; Statuts
          </span>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
              <span>Sélection rapide opérateur</span>
              <select
                aria-label="Opérateur du rapport"
                className="min-h-11 w-full min-w-0 rounded-lg border border-[#D8E6DB] bg-white px-3 text-sm text-[#17251C] focus:border-[#006B2D] focus:outline-none"
                value={operator}
                onChange={(e) => handleQuickOperatorChange(e.target.value)}
              >
                <option value="">
                  {periodSummary
                    ? `Opérateurs avec données (${detectedOperators.length})`
                    : "Tous les opérateurs"}
                </option>
                <option value="__legal__">
                  Légaux avec données ({periodSummary ? periodSummary.legal.length : legalOperators.length})
                </option>
                <option value="__illegal__">
                  Illégaux avec données ({periodSummary ? periodSummary.illegal.length : illegalOperators.length})
                </option>
                {allKnownOperators.length > 0 && (
                  <optgroup label="Opérateur spécifique">
                    {allKnownOperators.map((name) => {
                      const cnt = periodSummary?.counts[name];
                      const tag = isLegalOperator(name) ? "Légal" : "Illégal";
                      return (
                        <option key={name} value={name}>
                          {name} ({tag}
                          {cnt !== undefined ? ` · ${cnt}` : ""})
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
              <span>Périmètre des données</span>
              <select
                aria-label="Données du rapport"
                className="min-h-11 rounded-lg border border-[#D8E6DB] bg-white px-3 text-sm text-[#17251C] focus:border-[#006B2D] focus:outline-none"
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as ReportFilters["scope"])
                }
              >
                <option value="all">Tests et transactions</option>
                <option value="bets">Tests uniquement</option>
                <option value="transactions">Transactions uniquement</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
              <span>Statut de validation</span>
              <select
                aria-label="Validation du rapport"
                className="min-h-11 rounded-lg border border-[#D8E6DB] bg-white px-3 text-sm text-[#17251C] focus:border-[#006B2D] focus:outline-none"
                value={validation}
                onChange={(e) => {
                  setValidation(e.target.value);
                  setSelectedValidations(e.target.value ? [e.target.value] : []);
                }}
              >
                <option value="">Toutes</option>
                <option value="en_attente">En attente</option>
                <option value="valide">Validés</option>
                <option value="refuse">Refusés</option>
              </select>
            </label>
          </div>

          {/* Statuts multiples */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-[#556B5C]">
              Filtre multi-statuts :
            </span>
            {VALIDATION_OPTIONS.map((v) => {
              const checked = selectedValidations.includes(v.id);
              return (
                <label
                  key={v.id}
                  className={cn(
                    "flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1 text-xs font-medium cursor-pointer transition-colors",
                    checked
                      ? "border-[#006B2D] bg-white text-[#006B2D] font-bold"
                      : "border-[#D8E6DB] bg-white text-[#17251C]",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-[#006B2D] cursor-pointer"
                    checked={checked}
                    onChange={() => toggleValidation(v.id)}
                  />
                  <span>{v.label}</span>
                </label>
              );
            })}
            {selectedValidations.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedValidations([]);
                  setValidation("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSelectedValidations([]);
                    setValidation("");
                  }
                }}
                className="text-xs font-semibold text-[#556B5C] hover:underline cursor-pointer ml-1"
              >
                Réinitialiser
              </span>
            )}
          </div>
        </div>

        {/* Étape 3 : Sélection intelligente des opérateurs */}
        <div className="space-y-3 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8E6DB] pb-2.5">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#006B2D]" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#006B2D]">
                3. Opérateurs sur la période
              </span>
              <span className="rounded-md bg-white border border-[#D8E6DB] px-2 py-0.5 text-[11px] font-bold text-[#17251C]">
                {selectedOperators.length} sélectionné(s)
              </span>
              {scanning && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[#556B5C]">
                  <Loader2 className="h-3 w-3 animate-spin text-[#006B2D]" />
                  Analyse…
                </span>
              )}
            </div>

            {/* Filtre d'affichage : Tous / Légaux / Illégaux */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-lg border border-[#D8E6DB] bg-white p-0.5">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setOperatorDisplayFilter("all")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setOperatorDisplayFilter("all");
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors select-none",
                    operatorDisplayFilter === "all"
                      ? "bg-[#006B2D] text-white"
                      : "text-[#556B5C] hover:bg-[#F5F8F5]",
                  )}
                >
                  Avec données ({baseOperators.length})
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setOperatorDisplayFilter("legal")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setOperatorDisplayFilter("legal");
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 select-none",
                    operatorDisplayFilter === "legal"
                      ? "bg-[#006B2D] text-white"
                      : "text-emerald-700 hover:bg-emerald-50",
                  )}
                >
                  <ShieldCheck className="h-3 w-3" />
                  Légaux ({legalOperators.length})
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setOperatorDisplayFilter("illegal")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setOperatorDisplayFilter("illegal");
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 select-none",
                    operatorDisplayFilter === "illegal"
                      ? "bg-amber-600 text-white"
                      : "text-amber-700 hover:bg-amber-50",
                  )}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Illégaux ({illegalOperators.length})
                </span>
              </div>

              {zeroCount > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowZeroOperators((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setShowZeroOperators((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D8E6DB] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#556B5C] hover:text-[#17251C] cursor-pointer select-none"
                >
                  {showZeroOperators ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  {showZeroOperators
                    ? "Masquer sans données"
                    : `Voir sans données (${zeroCount})`}
                </span>
              )}
            </div>
          </div>

          {/* Bandeau de détection intelligente */}
          {periodSummary && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                periodSummary.detectedOperators.length === 0
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : hasDetectedIllegals
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-[#C2DEC9] bg-[#E8F3EC] text-[#004D20]",
              )}
            >
              <span className="flex items-center gap-1.5">
                {hasDetectedIllegals ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-[#006B2D]" />
                )}
                {periodSummary.detectedOperators.length === 0
                  ? "Aucune opération enregistrée sur cette période."
                  : hasDetectedIllegals
                    ? `Détection auto : ${periodSummary.legal.length} légal(aux) et ${periodSummary.illegal.length} illégal(aux) actifs sur cette période (inclus automatiquement).`
                    : `Détection auto : ${periodSummary.legal.length} opérateur(s) légal(aux) avec données sur cette période.`}
              </span>
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={applySmartSelection}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") applySmartSelection();
                  }}
                  className="rounded-md bg-white border border-[#D8E6DB] px-2 py-0.5 text-[11px] text-[#006B2D] hover:bg-[#E8F3EC] cursor-pointer"
                >
                  Sélection auto ({periodSummary.detectedOperators.length})
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={selectLegalOnly}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") selectLegalOnly();
                  }}
                  className="rounded-md bg-emerald-100/80 px-2 py-0.5 text-[11px] text-emerald-900 hover:bg-emerald-100 cursor-pointer"
                >
                  Légaux ({periodSummary.legal.length})
                </span>
                {hasDetectedIllegals && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={selectIllegalOnly}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") selectIllegalOnly();
                    }}
                    className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-200 cursor-pointer"
                  >
                    Illégaux ({periodSummary.illegal.length})
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={clearOperators}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") clearOperators();
                  }}
                  className="text-[11px] text-[#556B5C] hover:underline cursor-pointer"
                >
                  Tout décocher
                </span>
              </div>
            </div>
          )}

          {/* Grille d'opérateurs */}
          {displayedOperators.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-h-[300px] overflow-y-auto pr-1">
              {displayedOperators.map((op) => {
                const isLegal = isLegalOperator(op);
                const isChecked = selectedOperators.includes(op);
                const count = periodSummary?.counts[op];
                return (
                  <label
                    key={op}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs font-medium cursor-pointer transition-colors min-h-11",
                      isChecked
                        ? "border-[#006B2D] bg-white text-[#006B2D] font-bold"
                        : "border-[#D8E6DB] bg-white text-[#17251C] hover:border-[#006B2D]/50",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 accent-[#006B2D] cursor-pointer shrink-0"
                        checked={isChecked}
                        onChange={() => toggleOperator(op)}
                      />
                      <span className="truncate">{op}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {count !== undefined && (
                        <span className="rounded bg-[#F5F8F5] border border-[#D8E6DB] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#17251C]">
                          {count}
                        </span>
                      )}
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                          isLegal
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800",
                        )}
                      >
                        {isLegal ? "Légal" : "Illégal"}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[#D8E6DB] bg-white p-4 text-center text-xs text-[#556B5C]">
              {scanning
                ? "Recherche des opérateurs avec données sur la période…"
                : "Aucun opérateur ne correspond à ce filtre sur la période."}
            </p>
          )}
        </div>
      </fieldset>

      {!allowed && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs sm:text-sm text-red-700 font-medium">
          L’export n’est pas autorisé pour ce compte ou est désactivé pour les agents dans les paramètres.
        </p>
      )}

      {/* Barre d'actions d'export */}
      <div className="flex flex-col gap-2.5 border-t border-[#E2ECE4] pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          className="min-h-11 w-full bg-[#006B2D] hover:bg-[#004D20] text-white font-semibold shadow-xs sm:w-auto"
          disabled={busy || !period || !allowed}
          onClick={() => void generate("xlsx")}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-2 h-4 w-4 text-[#FFD000]" />
          )}
          {busy ? "Génération en cours…" : "Exporter le rapport Excel (.xlsx)"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full border-[#006B2D]/30 bg-white text-[#006B2D] hover:bg-[#E8F3EC] font-semibold sm:w-auto"
          disabled={busy || !period || !allowed}
          onClick={() => void generate("pdf")}
        >
          <FileText className="mr-2 h-4 w-4 text-[#006B2D]" />
          Exporter en PDF (.pdf)
        </Button>

        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full border-[#D8E6DB] bg-white text-[#17251C] hover:bg-[#F5F8F5] font-semibold sm:w-auto"
          disabled={busy || !period || !allowed}
          onClick={() => void generate("csv")}
        >
          <FileType2 className="mr-2 h-4 w-4 text-[#556B5C]" />
          Exporter en CSV (.csv)
        </Button>
      </div>

      {message && (
        <p role="status" className="text-xs sm:text-sm text-[#006B2D] font-semibold">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs sm:text-sm text-red-600 font-semibold">
          {error} Aucun rapport partiel n’a été téléchargé.
        </p>
      )}
    </section>
  );
}

export function OpenReportButton({
  initialOperator = "",
}: {
  initialOperator?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 border-[#D8E6DB] bg-white text-[#17251C] hover:bg-[#F5F8F5] font-semibold"
        onClick={() => setOpen(true)}
      >
        <Download className="mr-2 h-4 w-4 text-[#006B2D]" />
        Rapport mensuel Excel
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
          hideCloseButton={busy}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rapport mensuel OPEN</DialogTitle>
            <DialogDescription>
              Choisissez l’une des quatre périodes fixes du mois ou une période personnalisée.
            </DialogDescription>
          </DialogHeader>
          <OpenReportExport
            initialOperator={initialOperator}
            onBusyChange={setBusy}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
