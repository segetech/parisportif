// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { TotpAuthenticatorCard } from "./TotpAuthenticatorCard";
import {
  AvatarPositionDialog,
  AvatarViewerDialog,
} from "./AvatarPhotoDialogs";
import { supabase } from "@/lib/supabase";
import type { User } from "@/context/AuthContext";

const mockEnroll = vi.fn();
const mockChallengeAndVerify = vi.fn();
const mockUnenroll = vi.fn();
const mockListFactors = vi.fn();
const mockGetAal = vi.fn();
const mockUpdateEq = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: {
        enroll: (...args: any[]) => mockEnroll(...args),
        challengeAndVerify: (...args: any[]) => mockChallengeAndVerify(...args),
        unenroll: (...args: any[]) => mockUnenroll(...args),
        listFactors: (...args: any[]) => mockListFactors(...args),
        getAuthenticatorAssuranceLevel: (...args: any[]) => mockGetAal(...args),
      },
    },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: (...args: any[]) => mockUpdateEq(...args),
      })),
    })),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

const SAMPLE_USER: User = {
  id: "user-mfa-1",
  nom: "Diallo",
  prenom: "Aminata",
  email: "aminata@example.com",
  role: "ADMIN",
  statut: "actif",
  mfa_active: false,
};

describe("Profile Security (TOTP Authenticator) & Avatar Position/Viewer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();

    mockListFactors.mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    mockEnroll.mockResolvedValue({
      data: {
        id: "factor-totp-1",
        type: "totp",
        totp: {
          qr_code: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
          secret: "JBSWY3DPEHPK3PXP",
          uri: "otpauth://totp/OPEN:aminata@example.com?secret=JBSWY3DPEHPK3PXP",
        },
      },
      error: null,
    });
    mockChallengeAndVerify.mockResolvedValue({
      data: { access_token: "aal2-token", user: { id: "user-mfa-1" } },
      error: null,
    });
    mockUnenroll.mockResolvedValue({
      data: { id: "factor-totp-1" },
      error: null,
    });
    mockUpdateEq.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("enrolls and verifies a Google/Microsoft Authenticator TOTP factor", async () => {
    const onMfaStatusChange = vi.fn();

    await act(async () => {
      root.render(
        <TotpAuthenticatorCard
          user={SAMPLE_USER}
          onMfaStatusChange={onMfaStatusChange}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Non activée");
    const startBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Activer Google / Microsoft Authenticator"),
    );
    expect(startBtn).toBeTruthy();

    await act(async () => {
      startBtn!.click();
      await Promise.resolve();
    });

    expect(mockEnroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "Google / Microsoft Authenticator",
      issuer: "OPEN",
    });

    const qrImg = container.querySelector(
      'img[alt="QR Code Authenticator"]',
    ) as HTMLImageElement | null;
    expect(qrImg).toBeTruthy();
    expect(qrImg?.getAttribute("src")).toContain("data:image/svg+xml;utf8,");
    expect(container.textContent).toContain("JBSWY3DPEHPK3PXP");

    const codeInput = container.querySelector(
      "#mfa-enroll-code",
    ) as HTMLInputElement | null;
    expect(codeInput).toBeTruthy();

    await act(async () => {
      setInputValue(codeInput!, "654321");
    });

    const confirmBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Activer et vérifier"),
    );
    expect(confirmBtn?.hasAttribute("disabled")).toBe(false);

    mockListFactors.mockResolvedValue({
      data: {
        all: [{ id: "factor-totp-1", factor_type: "totp", status: "verified" }],
        totp: [
          {
            id: "factor-totp-1",
            friendly_name: "Google / Microsoft Authenticator",
            status: "verified",
          },
        ],
      },
      error: null,
    });

    await act(async () => {
      confirmBtn!.click();
      await Promise.resolve();
    });

    expect(mockChallengeAndVerify).toHaveBeenCalledWith({
      factorId: "factor-totp-1",
      code: "654321",
    });
    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(mockUpdateEq).toHaveBeenCalledWith("id", "user-mfa-1");
    expect(onMfaStatusChange).toHaveBeenCalledWith(true);
  });

  it("renders AvatarViewerDialog with preview and reposition action", async () => {
    const onReposition = vi.fn();
    const onChangeFile = vi.fn();
    const onDelete = vi.fn();

    await act(async () => {
      root.render(
        <AvatarViewerDialog
          open={true}
          onOpenChange={vi.fn()}
          avatarUrl="https://cdn.example.com/avatars/aminata.webp"
          userName="Diallo Aminata"
          onReposition={onReposition}
          onChangeFile={onChangeFile}
          onDelete={onDelete}
        />,
      );
      await Promise.resolve();
    });

    const previewImg = document.body.querySelector(
      'img[alt="Photo de profil de Diallo Aminata"]',
    );
    expect(previewImg).toBeTruthy();
    expect(previewImg?.getAttribute("src")).toBe(
      "https://cdn.example.com/avatars/aminata.webp",
    );

    const repositionBtn = Array.from(
      document.body.querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Ajuster la position"));
    expect(repositionBtn).toBeTruthy();

    await act(async () => {
      repositionBtn!.click();
    });
    expect(onReposition).toHaveBeenCalledTimes(1);
  });

  it("renders AvatarPositionDialog, adjusts zoom and saves positioned avatar file", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(new Blob(["avatar-bytes"], { type: "image/png" }), {
          status: 200,
        }),
      );

    await act(async () => {
      root.render(
        <AvatarPositionDialog
          open={true}
          onOpenChange={vi.fn()}
          imageSourceUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
          onConfirm={onConfirm}
          isUploading={false}
        />,
      );
      await Promise.resolve();
    });

    const zoomInBtn = document.body.querySelector(
      'button[aria-label="Zoomer"]',
    ) as HTMLButtonElement | null;
    expect(zoomInBtn).toBeTruthy();

    await act(async () => {
      zoomInBtn!.click();
    });
    expect(document.body.textContent).toContain("1.15x");

    const saveBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Valider cette position"),
    );
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      saveBtn!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const uploadedFile = onConfirm.mock.calls[0][0];
    expect(uploadedFile).toBeInstanceOf(File);
    fetchSpy.mockRestore();
  });
});
