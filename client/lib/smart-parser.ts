/**
 * Module d'intelligence et d'automatisation des saisies
 * Analyse automatique des références bancaires / télécoms (Orange Money, Moov, Wave)
 * et déduction instantanée des dates, heures, types de flux et opérateurs.
 */

export interface ParsedPaymentRef {
  raw: string;
  type?: "Dépôt" | "Retrait" | "depot" | "retrait";
  paymentOperator?: "Orange Money" | "Moov Money" | "Wave" | "Espèces" | string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  isValid: boolean;
  message?: string;
}

/**
 * Analyse une référence de transaction collée ou saisie par l'agent
 */
export function parsePaymentReference(reference: string): ParsedPaymentRef {
  if (!reference) {
    return { raw: "", isValid: false };
  }

  const trimmed = reference.trim().toUpperCase();

  // 1. Format Orange Money : MPYYMMDD.HHmm.XXXXX (Dépôt) ou CIYYMMDD.HHmm.XXXXX (Retrait / Cash-In)
  const orangeRegex = /^(MP|CI)(\d{2})(\d{2})(\d{2})\.(\d{2})(\d{2})\.([A-Z0-9]+)$/;
  const orangeMatch = trimmed.match(orangeRegex);

  if (orangeMatch) {
    const [, prefix, yy, mm, dd, hh, min] = orangeMatch;
    const year = 2000 + parseInt(yy, 10);
    const isDeposit = prefix === "MP";
    return {
      raw: trimmed,
      type: isDeposit ? "Dépôt" : "Retrait",
      paymentOperator: "Orange Money",
      date: `${year}-${mm}-${dd}`,
      time: `${hh}:${min}`,
      isValid: true,
      message: `Référence Orange Money détectée : ${isDeposit ? "Dépôt" : "Retrait"} le ${dd}/${mm}/${year} à ${hh}:${min}`,
    };
  }

  // 2. Format Moov Money : MOV-XXXXXX ou transaction numérique Moov
  if (trimmed.startsWith("MOV") || trimmed.startsWith("MOOV")) {
    return {
      raw: trimmed,
      paymentOperator: "Moov Money",
      isValid: true,
      message: "Référence Moov Money reconnue",
    };
  }

  // 3. Format Wave : WAV-XXXX ou UUID court Wave
  if (trimmed.startsWith("WAV") || trimmed.startsWith("WAVE")) {
    return {
      raw: trimmed,
      paymentOperator: "Wave",
      isValid: true,
      message: "Référence Wave reconnue",
    };
  }

  return {
    raw: trimmed,
    isValid: false,
  };
}

/**
 * Nettoyage automatique des montants textuels saisis par les utilisateurs
 * Transforme "1000F", "2500 F CFA", " 10 000 " en entier numérique 10000
 */
export function cleanAmount(input: string | number): number {
  if (typeof input === "number") return isNaN(input) ? 0 : input;
  if (!input) return 0;
  const cleaned = input.toString().replace(/[^0-9]/g, "");
  return cleaned ? parseInt(cleaned, 10) : 0;
}
