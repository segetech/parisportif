import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type DashboardScope = "self" | "all";

export interface PaymentFeeRule {
  depotRatePercent: number;
  depotFixedFcfa: number;
  retraitRatePercent: number;
  retraitFixedFcfa: number;
}

export const DEFAULT_PAYMENT_FEES: Record<string, PaymentFeeRule> = {
  "Orange Money": {
    depotRatePercent: 1,
    depotFixedFcfa: 0,
    retraitRatePercent: 0,
    retraitFixedFcfa: 0,
  },
  "Moov Money": {
    depotRatePercent: 1,
    depotFixedFcfa: 0,
    retraitRatePercent: 0,
    retraitFixedFcfa: 0,
  },
  Wave: {
    depotRatePercent: 1,
    depotFixedFcfa: 0,
    retraitRatePercent: 0,
    retraitFixedFcfa: 0,
  },
  "Espèces": {
    depotRatePercent: 0,
    depotFixedFcfa: 0,
    retraitRatePercent: 0,
    retraitFixedFcfa: 0,
  },
};

export function normalizePaymentFeeKey(rawOperator?: string | null): string {
  const s = (rawOperator || "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("orange") || s === "om") return "Orange Money";
  if (s.includes("moov")) return "Moov Money";
  if (s.includes("wave")) return "Wave";
  if (s.includes("espec") || s.includes("espèc") || s === "cash") return "Espèces";
  return (rawOperator || "").trim();
}

export function computeTransactionFee(
  amountFcfa: number,
  type: string | undefined,
  paymentOperator: string | undefined,
  paymentFees: Record<string, PaymentFeeRule> = DEFAULT_PAYMENT_FEES,
): { ratePercent: number; fixedFcfa: number; feeFcfa: number; totalFcfa: number } {
  const amt = Math.max(0, Number(amountFcfa) || 0);
  const key = normalizePaymentFeeKey(paymentOperator);
  const rule =
    (key && paymentFees[key]) ||
    (paymentOperator && paymentFees[paymentOperator.trim()]) ||
    (key && DEFAULT_PAYMENT_FEES[key]) || {
      depotRatePercent: 0,
      depotFixedFcfa: 0,
      retraitRatePercent: 0,
      retraitFixedFcfa: 0,
    };

  const isRetrait = (type || "").toLowerCase().includes("retrait");
  const ratePercent = isRetrait
    ? Number(rule.retraitRatePercent || 0)
    : Number(rule.depotRatePercent || 0);
  const fixedFcfa = isRetrait
    ? Number(rule.retraitFixedFcfa || 0)
    : Number(rule.depotFixedFcfa || 0);

  const feeFcfa = amt > 0 ? Math.round((amt * ratePercent) / 100) + fixedFcfa : 0;
  return {
    ratePercent,
    fixedFcfa,
    feeFcfa,
    totalFcfa: amt + feeFcfa,
  };
}

export interface TransactionFeeSnapshot {
  fee_rate_percent: number;
  fee_fixed_fcfa: number;
  fee_fcfa: number;
  net_amount_fcfa: number;
}

/** Calcule le snapshot des frais à figer en base lors de l'enregistrement d'une transaction. */
export function buildTransactionFeeSnapshot(
  amountFcfa: number,
  type: string | undefined,
  paymentOperator: string | undefined,
  paymentFees: Record<string, PaymentFeeRule> = DEFAULT_PAYMENT_FEES,
): TransactionFeeSnapshot {
  const amt = Math.max(0, Number(amountFcfa) || 0);
  const fee = computeTransactionFee(amt, type, paymentOperator, paymentFees);
  const isRetrait = (type || "").toLowerCase().includes("retrait");
  return {
    fee_rate_percent: fee.ratePercent,
    fee_fixed_fcfa: fee.fixedFcfa,
    fee_fcfa: fee.feeFcfa,
    net_amount_fcfa: isRetrait ? Math.max(0, amt - fee.feeFcfa) : amt + fee.feeFcfa,
  };
}

/**
 * Lit en priorité les frais figés sur la transaction (`fee_fcfa`, `fee_rate_percent`)
 * afin qu'un changement ultérieur de taux dans les paramètres ne modifie jamais le passé.
 */
export function resolveStoredTransactionFee(
  tx: {
    amount_fcfa?: number | null;
    type?: string | null;
    payment_operator?: string | null;
    fee_rate_percent?: number | null;
    fee_fixed_fcfa?: number | null;
    fee_fcfa?: number | null;
    net_amount_fcfa?: number | null;
  },
  paymentFees: Record<string, PaymentFeeRule> = DEFAULT_PAYMENT_FEES,
): {
  ratePercent: number;
  fixedFcfa: number;
  feeFcfa: number;
  netAmountFcfa: number;
  isFrozen: boolean;
} {
  const amt = Math.max(0, Number(tx.amount_fcfa) || 0);
  const isRetrait = String(tx.type || "").toLowerCase().includes("retrait");
  if (tx.fee_fcfa !== null && tx.fee_fcfa !== undefined) {
    const feeFcfa = Math.max(0, Number(tx.fee_fcfa) || 0);
    const netAmountFcfa =
      tx.net_amount_fcfa !== null && tx.net_amount_fcfa !== undefined
        ? Number(tx.net_amount_fcfa)
        : isRetrait
          ? Math.max(0, amt - feeFcfa)
          : amt + feeFcfa;
    return {
      ratePercent: Number(tx.fee_rate_percent ?? 0),
      fixedFcfa: Number(tx.fee_fixed_fcfa ?? 0),
      feeFcfa,
      netAmountFcfa,
      isFrozen: true,
    };
  }
  const computed = computeTransactionFee(
    amt,
    tx.type || undefined,
    tx.payment_operator || undefined,
    paymentFees,
  );
  return {
    ratePercent: computed.ratePercent,
    fixedFcfa: computed.fixedFcfa,
    feeFcfa: computed.feeFcfa,
    netAmountFcfa: isRetrait
      ? Math.max(0, amt - computed.feeFcfa)
      : amt + computed.feeFcfa,
    isFrozen: false,
  };
}

export interface AppSettings {
  // Saisie & qualité
  uniqueReferences: { transactions: boolean; bets: boolean };
  requireProofTransactions: boolean;
  requirePhoneTransactions: boolean;
  agentEditWindowMinutes: number;
  normalizationEnabled: boolean;
  // Rôles & permissions
  dashboardScopeAgent: DashboardScope;
  agentCanExport: boolean;
  agentCanManageVenues: boolean;
  controllerCanDelete: "interdite" | "autorisee";
  controllerDeleteReasonRequired: boolean;
  agentCanDelete: { allowed: boolean; minutesLimit?: number };
  // Matching
  matchingEnabled: boolean;
  matchingWindowMinutes: number; // ± minutes
  amountTolerancePercent: number; // ± %
  defaultMinScore: number;
  // Exports
  defaultExportFormat: "excel" | "csv";
  exportExcelStyles: {
    headerColor: string; // hex
    freezeTopRow: boolean;
    autoFilter: boolean;
    colorByOperator: boolean;
    operatorColorMap: Record<string, string>;
  };
  exportsMaxRows: number;
  includePhoneInBetsExport: boolean;
  // Système
  locale: string; // read-only
  timezone: string; // read-only
  dateFormat: string; // read-only
  timeFormat: string; // read-only
  auditRetentionDays: number;
  // Frais des opérateurs de paiement (Dépôts & Retraits)
  paymentFees: Record<string, PaymentFeeRule>;
}

const DEFAULT_SETTINGS: AppSettings = {
  uniqueReferences: { transactions: true, bets: true },
  requireProofTransactions: false,
  requirePhoneTransactions: false,
  agentEditWindowMinutes: 60,
  normalizationEnabled: false,
  dashboardScopeAgent: "self",
  agentCanExport: false,
  agentCanManageVenues: false,
  controllerCanDelete: "interdite",
  controllerDeleteReasonRequired: true,
  agentCanDelete: { allowed: false, minutesLimit: 0 },
  matchingEnabled: true,
  matchingWindowMinutes: 30,
  amountTolerancePercent: 5,
  defaultMinScore: 70,
  defaultExportFormat: "excel",
  exportExcelStyles: {
    headerColor: "#f1f5f9",
    freezeTopRow: true,
    autoFilter: true,
    colorByOperator: true,
    operatorColorMap: {},
  },
  exportsMaxRows: 100000,
  includePhoneInBetsExport: true,
  locale: "fr-FR",
  timezone: "Africa/Bamako",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "HH:mm",
  auditRetentionDays: 365,
  paymentFees: DEFAULT_PAYMENT_FEES,
};

const LS_KEY = "ps.settings";

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        paymentFees: {
          ...DEFAULT_PAYMENT_FEES,
          ...(parsed.paymentFees || {}),
        },
      };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function save(s: AppSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

const SettingsCtx = createContext<{
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  reset: () => void;
  save: () => void;
  applyNormalization: () => Promise<number>;
} | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => load());

  useEffect(() => {
    save(settings);
  }, [settings]);

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      reset() {
        setSettings(load());
      },
      save() {
        save(settings);
      },
      async applyNormalization() {
        // stub: simulate some work and return number of corrections
        await new Promise((r) => setTimeout(r, 300));
        const corrections = Math.floor(Math.random() * 10) + 1;
        return corrections;
      },
    }),
    [settings],
  );

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function useOptionalSettings(): AppSettings {
  const ctx = useContext(SettingsCtx);
  return ctx?.settings ?? DEFAULT_SETTINGS;
}
