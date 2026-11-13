import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Remonte le défilement en haut de la liste (ou en haut du conteneur <main> / fenêtre)
 * lors d'un changement de page ou de taille de page.
 */
export function scrollToTopOfList(anchorEl?: HTMLElement | null) {
  if (typeof window === "undefined") return;
  if (anchorEl && typeof anchorEl.scrollIntoView === "function") {
    anchorEl.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  const main = document.querySelector("main");
  if (main && typeof main.scrollTo === "function") {
    main.scrollTo({ top: 0, behavior: "smooth" });
  }
}

/**
 * Formate un numéro de téléphone en paires de 2 chiffres séparées par des espaces
 * (ex: "70009007" -> "70 00 90 07"). Préserve l'indicatif "+223" s'il est saisi.
 */
export function formatPhoneNumber(raw: string): string {
  const trimmed = (raw || "").trimStart();
  if (!trimmed) return "";

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (!digits) return "+";
    if (digits.startsWith("223")) {
      const rest = digits.slice(3, 11);
      const groupedRest = rest.replace(/(\d{2})(?=\d)/g, "$1 ");
      return groupedRest ? `+223 ${groupedRest}` : "+223";
    }
    return "+" + digits.slice(0, 15).replace(/(\d{2})(?=\d)/g, "$1 ");
  }

  const digits = trimmed.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/**
 * Formate un montant numérique avec un espace comme séparateur de milliers (ex: 15000 -> "15 000").
 */
export function formatAmountInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "" || value === 0) {
    return "";
  }
  const digits = String(value).replace(/\D/g, "");
  if (!digits || Number(digits) === 0) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Extrait la valeur numérique d'un champ montant formaté avec espaces (ex: "15 000" -> 15000).
 */
export function parseAmountInput(raw: string): number {
  const digits = (raw || "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}
