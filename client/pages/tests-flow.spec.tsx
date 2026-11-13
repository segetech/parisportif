// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestsPage from "./Tests";
import { LegacyTestsRoute } from "@/components/common/LegacyTestsRoute";

const boundary = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
  refetch: vi.fn(),
  toastError: vi.fn(),
  dispatchNotification: vi.fn(),
  insertError: null as any,
  rows: [{ id: "test-existing", date: "2026-11-12", time: "10:30", operator: "Opérateur X", support: "En ligne", bet_type: "Paris sportifs (Live)", amount_fcfa: 2500, status: "gagné", amount_won_fcfa: 5000, reference: "EXISTING-001", notes: "Observation conservée", validation_status: "valide", created_by: "user-admin" }],
}));
vi.mock("@/components/layout/AppLayout", () => ({ default: ({ children }: any) => <main>{children}</main> }));
vi.mock("@/context/AuthContext", () => ({
  RequireAuth: ({ children }: any) => children,
  useAuth: () => ({ user: { id: "user-admin", role: "ADMIN", statut: "actif" } }),
}));
vi.mock("@/hooks/use-data-queries", () => ({
  useBets: () => ({ data: boundary.rows, isLoading: false, isFetching: false, refetch: boundary.refetch }),
  useLookups: () => ({ data: { operatorNames: ["Opérateur X"], supportNames: ["En ligne"], betTypeNames: ["Paris sportifs (Live)"] } }),
  useVenues: () => ({ data: [] }), useCreateBet: () => ({}), useUpdateBet: () => ({}),
}));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (...args: any[]) => boundary.toastError(...args),
  },
}));
vi.mock("@/lib/notification-navigation", () => ({
  dispatchAppNotification: (...args: any[]) => boundary.dispatchNotification(...args),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => ({
  update: (payload: any) => { boundary.update(table, payload); return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "test-existing" }, error: null }) }) }) }; },
  insert: (payload: any) => {
    boundary.insert(table, payload);
    const result = {
      data: boundary.insertError ? null : { id: `${table}-new-id` },
      error: boundary.insertError,
    };
    return {
      select: () => ({
        single: async () => result,
      }),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
  },
}) } }));

let root: Root;
let host: HTMLDivElement;
const button = (text: string) => {
  const result = Array.from(document.querySelectorAll("button")).find(node => node.textContent?.trim() === text);
  expect(result, `button ${text}`).toBeTruthy();
  return result!;
};
async function click(node: Element) { await act(async () => { (node as HTMLElement).click(); }); }
async function input(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const reference = () => document.querySelector('input[placeholder^="Ex: MP"]') as HTMLInputElement;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); vi.clearAllMocks();
  boundary.insertError = null;
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("production Test page: terminology and writes", () => {
  it("loads the stored reference, gates editing and restores cancelled changes", async () => {
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TestsPage /></MemoryRouter>));
    expect(document.body.textContent).not.toMatch(/\bparis\b|\bpari\b/i);
    await click(document.querySelector('[aria-label="Consulter le test"]')!);
    expect(reference().value).toBe("EXISTING-001");
    expect(reference().closest("fieldset")!.disabled).toBe(true);
    await click(button("Modifier"));
    expect(boundary.update).not.toHaveBeenCalled();
    await input(reference(), "DRAFT-CHANGED");
    expect(reference().value).toBe("DRAFT-CHANGED");
    await click(button("Annuler les modifications"));
    expect(reference().value).toBe("EXISTING-001");
    expect(boundary.update).not.toHaveBeenCalled();
    await click(button("Modifier"));
    await input(reference(), "UPDATED-001");
    await click(button("Enregistrer les modifications"));
    expect(boundary.update).toHaveBeenCalledOnce();
    expect(boundary.update).toHaveBeenCalledWith("bets", expect.objectContaining({ reference: "UPDATED-001", amount_fcfa: 2500, amount_won_fcfa: 5000, status: "gagné", notes: "Observation conservée", bet_type: "Paris sportifs (Live)" }));
  });

  it("creates a Test using the existing API contract and owner", async () => {
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TestsPage /></MemoryRouter>));
    await click(button("Créer un test"));
    await input(reference(), "NEW-001");
    const amount = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    await input(amount, "1500");
    await click(button("Créer le test"));
    expect(boundary.insert).toHaveBeenCalledWith("bets", [expect.objectContaining({ reference: "NEW-001", amount_fcfa: 1500, created_by: "user-admin", validation_status: "valide" })]);
    expect(boundary.dispatchNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "operation_created",
      operationType: "bets",
      operationId: "bets-new-id",
      reference: "NEW-001",
    }));
  });

  it("warns on matching reference and displays explicit toast error on 23505 conflict", async () => {
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TestsPage /></MemoryRouter>));
    await click(button("Créer un test"));
    await input(reference(), "EXISTING-001");
    expect(document.body.textContent).toContain("Référence déjà présente sur un test");
    const amount = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    await input(amount, "1500");
    boundary.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    await click(button("Créer le test"));
    expect(boundary.toastError).toHaveBeenCalledWith(
      expect.stringContaining("déjà utilisée par un autre enregistrement"),
    );
  });

  it("redirects old bookmarked URLs without losing filters or anchor", async () => {
    function Location() { const value = useLocation(); return <output>{value.pathname + value.search + value.hash}</output>; }
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/bets?operator=X&status=pending#record"]}><Routes><Route path="/bets" element={<LegacyTestsRoute />} /><Route path="/tests" element={<Location />} /></Routes></MemoryRouter>));
    expect(document.querySelector("output")!.textContent).toBe("/tests?operator=X&status=pending#record");
  });
});
