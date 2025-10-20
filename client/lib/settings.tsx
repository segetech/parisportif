import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type DashboardScope = "self" | "all";

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
};

const LS_KEY = "ps.settings";

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as AppSettings) };
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
