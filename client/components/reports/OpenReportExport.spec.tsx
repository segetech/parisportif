// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { OpenReportExport } from "./OpenReportExport";
import { reportFixture } from "@/lib/open-report-fixture";

const state = vi.hoisted(() => ({ fail: false, calls: 0, account: "admin", allowed: true }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: state.account, role: "ADMIN" } }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { agentCanExport: true } }) }));
vi.mock("@/hooks/use-data-queries", () => ({ useLookups: () => ({ data: { operatorNames: ["Alpha", "Bêta / Équipe très longue pour la feuille"] } }) }));
vi.mock("@/lib/supabase", async () => {
  const { reportFixture } = await import("@/lib/open-report-fixture");
  return { supabase: {
    auth: { getUser: async () => { state.calls++; return { data: { user: { id: state.account } }, error: null }; } },
    from: (table: string) => {
      const fixture = reportFixture(); const data: Record<string, any[]> = { bets: fixture.tests, transactions: fixture.transactions, illegal_bets: fixture.anomalies, illegal_transactions: [], venues: fixture.sites, users: fixture.people };
      const filters: ((r: any) => boolean)[] = [];
      const query: any = {
        select: () => query, order: () => query,
        eq: (key: string, value: any) => { filters.push(r => r[key] === value); return query; },
        gte: (key: string, value: any) => { filters.push(r => r[key] >= value); return query; },
        lte: (key: string, value: any) => { filters.push(r => r[key] <= value); return query; },
        in: (key: string, values: any[]) => { filters.push(r => values.includes(r[key])); return query; },
        single: async () => ({ data: { id: state.account, role: "ADMIN", statut: state.allowed ? "actif" : "suspendu" }, error: null }),
        range: async (first: number, last: number) => { await new Promise(r => setTimeout(r, 3)); return state.fail ? { data: null, error: { message: "Échec réseau" } } : { data: data[table].filter(r => filters.every(f => f(r))).slice(first, last + 1), error: null }; },
      };
      return query;
    },
  } };
});
let root: Root, container: HTMLDivElement, download: Blob | undefined;
const anchorClick = vi.fn();
const element = (name: string) => document.querySelector(`[aria-label="${name}"]`) as HTMLInputElement;
async function change(name: string, value: string) {
  const node = element(name);
  await act(async () => {
    const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function settle() {
  for (let i = 0; i < 300 && document.querySelector("button")?.disabled; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(state, { fail: false, calls: 0, account: "admin", allowed: true }); download = undefined; anchorClick.mockClear();
  vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { download = blob as Blob; return "blob:report"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(anchorClick);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<OpenReportExport />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("real export controls and generated file", () => {
  it("updates leap-year dates and exports the exact selected tranche", async () => {
    await change("Année du rapport", "2028"); await change("Mois du rapport", "2"); await change("Période du rapport", "4");
    expect(document.body.textContent).toContain("2028-02-23 → 2028-02-29");
    await change("Année du rapport", "2026"); await change("Mois du rapport", "11"); await change("Période du rapport", "2"); await change("Opérateur du rapport", "Alpha");
    const button = container.querySelector("button")!;
    await act(async () => { button.click(); button.click(); });
    expect(element("Mois du rapport").closest("fieldset")!.disabled).toBe(true);
    await settle();
    expect(anchorClick).toHaveBeenCalledOnce(); expect(state.calls).toBe(2);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await download!.arrayBuffer() as any);
    expect(wb.getWorksheet("Synthèse")!.getCell("C7").result).toBe(300.3);
    expect(wb.getWorksheet("Synthèse")!.getCell("G7").result).toBe(1000.1);
    expect(wb.getWorksheet("Dépôts")!.getCell("A7").value).toBe("DEP-08");
    expect(wb.getWorksheet("Tous les tests")!.getCell("A7").value).toBe("TEST-08");
    expect(document.body.textContent).toContain("2 test(s), 1 dépôt(s), 1 retrait(s)");
  });
  it("shows a clear error without downloading a partial file, then allows retry", async () => {
    state.fail = true; await act(async () => container.querySelector("button")!.click()); await settle();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("Aucun rapport partiel"); expect(anchorClick).not.toHaveBeenCalled();
    state.fail = false; await act(async () => container.querySelector("button")!.click()); await settle(); expect(anchorClick).toHaveBeenCalledOnce();
  });
});
