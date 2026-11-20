// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    login: mocks.login,
    mfaRequired: false,
    verifyMfaLogin: vi.fn(),
    cancelMfaLogin: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: any[]) => mocks.toastError(...args),
  },
}));

let root: Root;
let host: HTMLDivElement;

async function setInputValue(selector: string, value: string) {
  const el = document.querySelector(selector) as HTMLInputElement;
  expect(el).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitForm() {
  const form = document.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("Login page readable error presentation", () => {
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    document.body.innerHTML = "";
  });

  it("shows readable validation message before calling login when fields are empty", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Login />
        </MemoryRouter>,
      );
    });

    await submitForm();

    expect(mocks.login).not.toHaveBeenCalled();
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Champs manquants");
    expect(alert?.textContent).toContain("adresse e-mail et votre mot de passe");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Champs manquants",
      expect.objectContaining({
        description: expect.stringContaining("adresse e-mail"),
      }),
    );
  });

  it("shows readable French alert and reset link on Invalid login credentials without console.error", async () => {
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.login.mockRejectedValueOnce(new Error("Invalid login credentials"));

    await act(async () => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Login />
        </MemoryRouter>,
      );
    });

    await setInputValue("#email-input", "agent@open.ml");
    await setInputValue("#password-input", "mauvais-mot-de-passe");
    await submitForm();

    expect(mocks.login).toHaveBeenCalledWith("agent@open.ml", "mauvais-mot-de-passe");
    expect(consoleErrSpy).not.toHaveBeenCalled();

    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Identifiants incorrects");
    expect(alert?.textContent).toContain("Réinitialiser mon mot de passe");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Identifiants incorrects",
      expect.objectContaining({
        description: expect.stringContaining("incorrect"),
      }),
    );

    // Modifying input clears the error banner
    await setInputValue("#password-input", "nouveau");
    expect(document.querySelector('[role="alert"]')).toBeNull();

    consoleErrSpy.mockRestore();
  });
});
