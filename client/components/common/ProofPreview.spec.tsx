// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProofPreview } from "./ProofPreview";

describe("ProofPreview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("renders inline image preview and opens enlarged lightbox on click", async () => {
    await act(async () => {
      root.render(<ProofPreview url="https://example.com/recu.png" />);
    });

    const thumb = container.querySelector('img[alt="Pièce justificative"]') as HTMLImageElement | null;
    expect(thumb).not.toBeNull();
    expect(thumb?.getAttribute("src")).toBe("https://example.com/recu.png");

    const zoomButton = container.querySelector(
      'button[aria-label="Agrandir la pièce justificative"]'
    ) as HTMLButtonElement | null;
    expect(zoomButton).not.toBeNull();

    await act(async () => {
      zoomButton?.click();
    });

    const enlarged = document.body.querySelector(
      'img[alt="Pièce justificative (agrandie)"]'
    ) as HTMLImageElement | null;
    expect(enlarged).not.toBeNull();
    expect(enlarged?.getAttribute("src")).toBe("https://example.com/recu.png");
  });

  it("renders PDF iframe preview and opens enlarged PDF dialog on click", async () => {
    await act(async () => {
      root.render(<ProofPreview url="https://example.com/bordereau.pdf?token=abc" />);
    });

    const iframe = container.querySelector('iframe[title="Pièce justificative"]') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("https://example.com/bordereau.pdf?token=abc");

    const pdfButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Cliquer pour agrandir le document PDF")
    );
    expect(pdfButton).toBeTruthy();

    await act(async () => {
      pdfButton?.click();
    });

    const enlargedIframe = document.body.querySelector(
      'iframe[title="Pièce justificative (agrandi)"]'
    ) as HTMLIFrameElement | null;
    expect(enlargedIframe).not.toBeNull();
    expect(enlargedIframe?.getAttribute("src")).toBe("https://example.com/bordereau.pdf?token=abc");
  });

  it("shows fallback link if image fails to load", async () => {
    await act(async () => {
      root.render(<ProofPreview url="https://example.com/broken.jpg" />);
    });

    const thumb = container.querySelector('img[alt="Pièce justificative"]') as HTMLImageElement;
    expect(thumb).not.toBeNull();

    await act(async () => {
      thumb.dispatchEvent(new Event("error"));
    });

    expect(container.textContent).toContain("Aperçu indisponible pour ce fichier.");
    const link = Array.from(container.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Ouvrir dans un nouvel onglet")
    );
    expect(link?.getAttribute("href")).toBe("https://example.com/broken.jpg");
  });
});
