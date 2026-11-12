import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Filter, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useLookups } from "@/hooks/use-data-queries";
import { useSettings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { currentReportPeriod, REPORT_MONTHS, REPORT_TRANCHES, reportPeriod } from "@/lib/report-periods";
import { fetchOpenReport, type ReportFilters } from "@/lib/open-report-data";
import { isLegalOperator } from "@/lib/operator-classification";
import { cn } from "@/lib/utils";

export function OpenReportExport({ initialOperator = "", onBusyChange }: { initialOperator?: string; onBusyChange?: (busy: boolean) => void }) {
  const initial = useMemo(() => currentReportPeriod(), []);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [tranche, setTranche] = useState<number>(initial.tranche);
  const [operator, setOperator] = useState(initialOperator);
  const [selectedOperators, setSelectedOperators] = useState<string[]>(() => initialOperator ? [initialOperator] : []);
  const [operatorCategory, setOperatorCategory] = useState<"all" | "legal" | "illegal">("all");
  const [operatorDisplayFilter, setOperatorDisplayFilter] = useState<"all" | "legal" | "illegal">("all");
  const [validation, setValidation] = useState("");
  const [selectedValidations, setSelectedValidations] = useState<string[]>([]);
  const [scope, setScope] = useState<ReportFilters["scope"]>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const { user } = useAuth();
  const { settings } = useSettings();
  const activeUser = useRef(user);
  activeUser.current = user;
  const { data: lookups } = useLookups();

  const availableOperators = useMemo(() => {
    const list = [...new Set([...(lookups?.operatorNames || []), ...(initialOperator ? [initialOperator] : [])])].filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b, "fr"));
  }, [lookups?.operatorNames, initialOperator]);

  const legalOperators = useMemo(() => availableOperators.filter(op => isLegalOperator(op)), [availableOperators]);
  const illegalOperators = useMemo(() => availableOperators.filter(op => !isLegalOperator(op)), [availableOperators]);

  const displayedOperators = useMemo(() => {
    if (operatorDisplayFilter === "legal") return legalOperators;
    if (operatorDisplayFilter === "illegal") return illegalOperators;
    return availableOperators;
  }, [operatorDisplayFilter, legalOperators, illegalOperators, availableOperators]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const period = useMemo(() => {
    try {
      return reportPeriod(year, month, tranche);
    } catch {
      return null;
    }
  }, [year, month, tranche]);

  const allowed = !!user && ["ADMIN", "CONTROLEUR", "AGENT"].includes(user.role) && (user.role !== "AGENT" || settings.agentCanExport);

  function handleQuickOperatorChange(value: string) {
    if (value === "__legal__") {
      setOperatorCategory("legal");
      setSelectedOperators([...legalOperators]);
      setOperator("");
      setOperatorDisplayFilter("legal");
      return;
    }
    if (value === "__illegal__") {
      setOperatorCategory("illegal");
      setSelectedOperators([...illegalOperators]);
      setOperator("");
      setOperatorDisplayFilter("illegal");
      return;
    }
    setOperator(value);
    setOperatorCategory("all");
    if (!value) {
      setSelectedOperators([]);
    } else {
      setSelectedOperators([value]);
    }
  }

  function toggleOperator(op: string) {
    setSelectedOperators(prev => {
      const exists = prev.includes(op);
      const next = exists ? prev.filter(x => x !== op) : [...prev, op];
      if (next.length === 1) {
        setOperator(next[0]);
      } else {
        setOperator("");
      }
      return next;
    });
  }

  function selectAllOperators() {
    setSelectedOperators([...availableOperators]);
    setOperator("");
    setOperatorCategory("all");
  }

  function selectLegalOnly() {
    setSelectedOperators([...legalOperators]);
    setOperator("");
    setOperatorCategory("legal");
  }

  function selectIllegalOnly() {
    setSelectedOperators([...illegalOperators]);
    setOperator("");
    setOperatorCategory("illegal");
  }

  function clearOperators() {
    setSelectedOperators([]);
    setOperator("");
    setOperatorCategory("all");
  }

  function toggleValidation(val: string) {
    setSelectedValidations(prev => {
      const exists = prev.includes(val);
      const next = exists ? prev.filter(x => x !== val) : [...prev, val];
      if (next.length === 1) {
        setValidation(next[0]);
      } else {
        setValidation("");
      }
      return next;
    });
  }

  async function generate() {
    if (lock.current || !period || !allowed) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setMessage("Vérification des accès et lecture des données…");
    const account = user.id;

    const effectiveOperators = selectedOperators.length > 0 ? selectedOperators : (operator ? [operator] : undefined);
    const effectiveValidations = selectedValidations.length > 0 ? selectedValidations : (validation ? [validation] : undefined);

    // Freeze the entire selection for this job, independent of subsequent renders.
    const selection: ReportFilters = structuredClone({
      period,
      operator: effectiveOperators && effectiveOperators.length === 1 ? effectiveOperators[0] : (operator || undefined),
      operators: effectiveOperators,
      operatorCategory,
      validation: effectiveValidations && effectiveValidations.length === 1 ? effectiveValidations[0] : (validation || undefined),
      validations: effectiveValidations,
      scope,
    });

    try {
      const data = await fetchOpenReport(supabase, selection, status => {
        if (mounted.current) setMessage(status);
      });
      if (!mounted.current || activeUser.current?.id !== account) return;
      setMessage("Construction des onglets et des graphiques Excel…");
      // Paint the loading state before starting the browser-side workbook build.
      await new Promise(resolve => setTimeout(resolve, 0));
      const { buildOpenReport } = await import("@/lib/open-report-workbook");
      const report = await buildOpenReport(data);
      if (!mounted.current || activeUser.current?.id !== account) return;
      const url = URL.createObjectURL(new Blob([report.bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = report.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${report.summary.tests.length} test(s), ${report.summary.deposits.length} dépôt(s), ${report.summary.withdrawals.length} retrait(s) exportés. ${report.operators.size} onglet(s) opérateur. Les graphiques sont modifiables dans Excel.`);
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : "Le rapport n’a pas pu être généré.");
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

  return (
    <section className="space-y-5 rounded-xl border border-[#D8E6DB] bg-white p-4 shadow-xs sm:p-6" aria-label="Rapport Excel par période">
      <div className="border-b border-[#D8E6DB] pb-3">
        <h2 className="text-lg font-bold text-[#17251C]">Rapport Excel OPEN</h2>
        <p className="text-xs text-[#556B5C] sm:text-sm">
          Synthèse, graphiques natifs modifiables, tests, dépôts, retraits et un onglet par opérateur.
        </p>
      </div>

      <fieldset disabled={busy} className="space-y-4">
        {/* Ligne 1 : Période temporelle (Mois, Année en saisie libre, Tranche) */}
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
            <span>Mois</span>
            <select
              aria-label="Mois du rapport"
              className="min-h-11 rounded-lg border border-[#D8E6DB] bg-white px-3 text-sm text-[#17251C] focus:border-[#006B2D] focus:outline-none"
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
            >
              {REPORT_MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>{label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
            <span>Année (saisie libre)</span>
            <Input
              aria-label="Année du rapport"
              className="min-h-11 rounded-lg border-[#D8E6DB] bg-white text-sm"
              type="number"
              min={1900}
              max={9998}
              value={year || ""}
              onChange={e => setYear(Number(e.target.value))}
              placeholder="Ex. 2026"
            />
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
            <span>Période mensuelle fixe</span>
            <select
              aria-label="Période du rapport"
              className="min-h-11 rounded-lg border border-[#D8E6DB] bg-white px-3 text-sm text-[#17251C] focus:border-[#006B2D] focus:outline-none"
              value={tranche}
              onChange={e => setTranche(Number(e.target.value))}
            >
              {REPORT_TRANCHES.map((label, i) => (
                <option key={label} value={i + 1}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Ligne 2 : Filtres rapides */}
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-semibold text-[#17251C]">
            <span>Sélection rapide opérateur</span>
            <select
              aria-label="Opérateur du rapport"
              className="min-h-11 w-full min-w-0 rounded-lg border border-[#D8E6DB] bg-white px-3 text-sm text-[#17251C] focus:border-[#006B2D] focus:outline-none"
              value={operator}
              onChange={e => handleQuickOperatorChange(e.target.value)}
            >
              <option value="">Tous les opérateurs</option>
              <option value="__legal__">✓ Opérateurs légaux uniquement (1xBet, Bet223, MALIBET, PremierBet)</option>
              <option value="__illegal__">⚠️ Opérateurs illégaux / non autorisés uniquement</option>
              {legalOperators.length > 0 && (
                <optgroup label="Opérateurs légaux (agréés)">
                  {legalOperators.map(name => (
                    <option key={name} value={name}>{name} (Légal)</option>
                  ))}
                </optgroup>
              )}
              {illegalOperators.length > 0 && (
                <optgroup label="Opérateurs illégaux / non agréés">
                  {illegalOperators.map(name => (
                    <option key={name} value={name}>{name} (Illégal)</option>
                  ))}
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
              onChange={e => setScope(e.target.value as ReportFilters["scope"])}
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
              onChange={e => {
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

        {/* Ligne 3 : Sélection des opérateurs un par un (avec option légaux vs illégaux) */}
        {availableOperators.length > 0 && (
          <div className="space-y-3 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-3.5">
            {/* Barre de contrôle du filtre d'affichage des opérateurs */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#D8E6DB] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#17251C] flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-[#006B2D]" />
                  Sélection des opérateurs un par un :
                  <span className="ml-1 text-[11px] font-semibold text-[#006B2D]">
                    {selectedOperators.length === 0
                      ? `Tous (${availableOperators.length}/${availableOperators.length})`
                      : `${selectedOperators.length} sélectionné(s)`}
                  </span>
                </span>
              </div>

              {/* Sélecteur d'affichage : Tous, Légaux, Illégaux */}
              <div className="flex items-center gap-1 rounded-lg border border-[#D8E6DB] bg-white p-0.5 shadow-2xs">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setOperatorDisplayFilter("all")}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setOperatorDisplayFilter("all"); }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors select-none",
                    operatorDisplayFilter === "all" ? "bg-[#006B2D] text-white" : "text-[#556B5C] hover:bg-[#F5F8F5]"
                  )}
                >
                  Tous ({availableOperators.length})
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setOperatorDisplayFilter("legal")}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setOperatorDisplayFilter("legal"); }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 select-none",
                    operatorDisplayFilter === "legal" ? "bg-[#006B2D] text-white" : "text-emerald-700 hover:bg-emerald-50"
                  )}
                >
                  <ShieldCheck className="h-3 w-3" />
                  Légaux ({legalOperators.length})
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setOperatorDisplayFilter("illegal")}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setOperatorDisplayFilter("illegal"); }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 select-none",
                    operatorDisplayFilter === "illegal" ? "bg-amber-600 text-white" : "text-amber-700 hover:bg-amber-50"
                  )}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Illégaux ({illegalOperators.length})
                </span>
              </div>

              {/* Raccourcis de sélection */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={selectLegalOnly}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") selectLegalOnly(); }}
                  className="text-emerald-800 hover:underline cursor-pointer bg-emerald-100/70 hover:bg-emerald-100 px-2 py-0.5 rounded-md"
                  title="Cocher 1xBet, Bet223, MALIBET, PremierBet"
                >
                  Cocher les légaux ({legalOperators.length})
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={selectIllegalOnly}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") selectIllegalOnly(); }}
                  className="text-amber-800 hover:underline cursor-pointer bg-amber-100/70 hover:bg-amber-100 px-2 py-0.5 rounded-md"
                  title="Cocher tous les opérateurs non agréés"
                >
                  Cocher les illégaux ({illegalOperators.length})
                </span>
                <span className="text-[#556B5C]">•</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={selectAllOperators}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") selectAllOperators(); }}
                  className="text-[#006B2D] hover:underline cursor-pointer"
                >
                  Tout cocher
                </span>
                <span className="text-[#556B5C]">•</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={clearOperators}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") clearOperators(); }}
                  className="text-[#556B5C] hover:underline cursor-pointer"
                >
                  Réinitialiser
                </span>
              </div>
            </div>

            {/* Grille d'opérateurs avec badges légal/illégal */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 max-h-[360px] overflow-y-auto pr-1">
              {displayedOperators.map(op => {
                const isLegal = isLegalOperator(op);
                const isChecked = selectedOperators.includes(op);
                return (
                  <label
                    key={op}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border p-2 text-xs font-medium cursor-pointer transition-colors min-h-[40px]",
                      isChecked
                        ? "border-[#006B2D] bg-white text-[#006B2D] font-bold shadow-2xs"
                        : "border-[#D8E6DB] bg-white text-[#17251C] hover:border-gray-400"
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

                    <span
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0",
                        isLegal
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {isLegal ? "Légal" : "Illégal"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Ligne 4 : Sélection des statuts de validation un par un */}
        <div className="space-y-2 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] p-3">
          <div className="flex items-center justify-between text-xs font-bold text-[#17251C]">
            <span>Statuts de validation :</span>
            {selectedValidations.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={() => { setSelectedValidations([]); setValidation(""); }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { setSelectedValidations([]); setValidation(""); } }}
                className="text-xs font-semibold text-[#556B5C] hover:underline cursor-pointer"
              >
                Tous les statuts
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {VALIDATION_OPTIONS.map(v => {
              const checked = selectedValidations.includes(v.id);
              return (
                <label
                  key={v.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
                    checked
                      ? "border-[#006B2D] bg-white text-[#006B2D] font-bold shadow-2xs"
                      : "border-[#D8E6DB] bg-white text-[#17251C]"
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
          </div>
        </div>
      </fieldset>

      {/* Récapitulatif des dates exactes de la période */}
      <div className="rounded-lg bg-[#E8F3EC] p-3.5 text-xs sm:text-sm text-[#004D20] font-medium border border-[#C2DEC9]" aria-live="polite">
        {period
          ? `📅 ${period.label} — dates incluses (${period.start} → ${period.end}), heure de Bamako.`
          : "Sélectionnez un mois et une année valides."}
      </div>

      {!allowed && (
        <p className="text-xs sm:text-sm text-red-600 font-medium">
          L’export n’est pas autorisé pour ce compte ou est désactivé pour les agents dans les paramètres.
        </p>
      )}

      {/* Bouton de génération */}
      <Button
        type="button"
        className="min-h-11 w-full bg-[#006B2D] hover:bg-[#004D20] text-white font-semibold shadow-xs sm:w-auto"
        disabled={busy || !period || !allowed}
        onClick={() => void generate()}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4 text-[#FFD000]" />}
        {busy ? "Génération en cours…" : "Exporter le rapport Excel"}
      </Button>

      {message && <p role="status" className="text-xs sm:text-sm text-[#006B2D] font-semibold">{message}</p>}
      {error && <p role="alert" className="text-xs sm:text-sm text-red-600 font-semibold">{error} Aucun rapport partiel n’a été téléchargé.</p>}
    </section>
  );
}

export function OpenReportButton({ initialOperator = "" }: { initialOperator?: string }) {
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
        onOpenChange={value => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="max-w-4xl"
          hideCloseButton={busy}
          onEscapeKeyDown={event => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={event => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rapport mensuel OPEN</DialogTitle>
            <DialogDescription>
              Choisissez l’une des quatre périodes fixes du mois.
            </DialogDescription>
          </DialogHeader>
          <OpenReportExport initialOperator={initialOperator} onBusyChange={setBusy} />
        </DialogContent>
      </Dialog>
    </>
  );
}
