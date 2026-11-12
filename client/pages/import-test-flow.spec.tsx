// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import ExcelImportPage from "./ExcelImport";
import { buildImportTemplate } from "@/lib/excel-export";

const transport = vi.hoisted(() => ({ writes: [] as { table: string; rows: any[] }[], updates: [] as any[] }));
vi.mock("@/components/layout/AppLayout", () => ({ default: ({ children }: any) => <main>{children}</main> }));
vi.mock("@/context/AuthContext", () => ({
  RequireAuth: ({ children }: any) => children, RequireRole: ({ children }: any) => children,
  useAuth: () => ({ user: { id: "import-agent", role: "AGENT", statut: "actif" } }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => {
  const result = { data: [], error: null, count: 0 };
  const builder: any = {
    select: () => builder, eq: () => builder, not: () => builder, limit: () => builder,
    single: async () => ({ data: { id: "test-batch" }, error: null }),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    insert: (rows: any[]) => { transport.writes.push({ table, rows }); return builder; },
    update: (payload: any) => { transport.updates.push({ table, payload }); return builder; },
  };
  return builder;
} } }));

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); transport.writes.length = 0; transport.updates.length = 0;
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

async function clickButton(fragment: string) {
  const button = Array.from(document.querySelectorAll("button")).find(node => node.textContent?.includes(fragment));
  expect(button, fragment).toBeTruthy();
  await act(async () => button!.click());
}

async function waitForUi(text: string) {
  for (let attempt = 0; attempt < 100 && !document.body.textContent?.includes(text); attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  expect(document.body.textContent).toContain(text);
}

describe("production Excel import page with real workbook/parser/writer flow", () => {
  it("detects an existing site workbook and writes one site with its test types", async () => {
    const { buffer } = await buildImportTemplate("salles");
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
    workbook.worksheets[0].name = "Salle jeux";
    const legacyBuffer = await workbook.xlsx.writeBuffer();
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ExcelImportPage /></MemoryRouter>));
    const file = new File([legacyBuffer], "sites-historiques.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => legacyBuffer });
    const input = document.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await waitForUi("Lancer l'analyse");
    expect(Array.from(document.querySelectorAll("select")).some(select => select.value === "salles")).toBe(true);
    await clickButton("Lancer l'analyse");
    await clickButton("Confirmer et importer");
    await waitForUi("Effectuer un nouvel import");
    const sites = transport.writes.filter(write => write.table === "venues").flatMap(write => write.rows);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ quartier: "Niamana", games: ["Test fonctionnel"], created_by: "import-agent", validation_status: "en_attente" });
  });

  it.each([false, true])("imports and finalizes %s legacy format without losing ownership or money", async (legacy) => {
    const template = await buildImportTemplate("tests");
    let buffer = template.buffer;
    if (legacy) {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
      const sheet = wb.worksheets[0]; sheet.name = "pari";
      sheet.getCell("A1").value = "Opérateur de jeux";
      sheet.getCell("C1").value = "Type de Pari";
      sheet.getCell("G1").value = "Référence";
      sheet.getCell("I1").value = "montant gagné";
      sheet.getCell("H2").value = "gagné";
      buffer = await wb.xlsx.writeBuffer();
    }
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ExcelImportPage /></MemoryRouter>));
    const file = new File([buffer], legacy ? "historique.xlsx" : "tests.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
    const input = document.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await waitForUi("Lancer l'analyse");
    await clickButton("Lancer l'analyse");
    expect(document.body.textContent).toContain("Issue favorable");
    await clickButton("Confirmer et importer");
    await waitForUi("Effectuer un nouvel import");
    const rows = transport.writes.filter(write => write.table === "bets").flatMap(write => write.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reference: "CI250326.0438.B13742", amount_fcfa: 1000, amount_won_fcfa: 3500, bet_type: "Test fonctionnel", created_by: "import-agent", validation_status: "en_attente", status: "gagné" });
    const batch = transport.writes.find(write => write.table === "import_batches")!.rows[0];
    expect(batch.entity_type).toBe("pari");
    expect(rows[0].import_batch_id).toBe(batch.id);
    expect(transport.updates).toContainEqual(expect.objectContaining({ table: "import_batches", payload: expect.objectContaining({ imported_rows: 1 }) }));
  });
});
