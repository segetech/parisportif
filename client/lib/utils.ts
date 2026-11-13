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
