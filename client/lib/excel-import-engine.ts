/**
 * Moteur de normalisation, détection d'anomalies et import intelligent Excel
 * Conforme aux spécifications métier des fichiers :
 * - "formulaire type excel.xlsx" (feuilles depotretrait et pari)
 * - "SALLE DE JEUX PAR QUARTIER.xlsx" (feuille Salle jeux)
 */

export interface NormalizedAmount {
  value: number | null;
  raw: string;
  isValid: boolean;
}

export interface NormalizedTime {
  value: string | null; // Format HH:mm
  raw: string;
  isValid: boolean;
}

export interface Anomaly {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
  rawValue?: string;
  proposedValue?: any;
}

export interface ParsedTransactionRow {
  rowNumber: number;
  operator: string;
  platform: string;
  paymentOperator: string;
  type: "Dépôt" | "Retrait";
  amount: number;
  time: string | null;
  date: string | null;
  phone: string | null;
  reference: string | null;
  proofStatus: "disponible" | "non_disponible" | "non_renseignee";
  raw: Record<string, any>;
  anomalies: Anomaly[];
  isValid: boolean;
}

export interface ParsedBetRow {
  rowNumber: number;
  operator: string;
  support: string;
  betType: string;
  amount: number;
  time: string | null;
  date: string | null;
  phone: string | null;
  reference: string | null;
  status: "en_attente" | "gagné" | "perdu";
  amountWon: number | null;
  proofStatus: "disponible" | "non_disponible" | "non_renseignee";
  raw: Record<string, any>;
  anomalies: Anomaly[];
  isValid: boolean;
}

export interface ParsedVenueGroup {
  venueNumber: number | null;
  quartier: string;
  operator: string;
  support: string;
  address: string;
  games: string[];
  secondaryLocations: string[];
  isAmbiguous?: boolean;
  startRow: number;
  endRow: number;
  rawRows: number[];
  anomalies: Anomaly[];
  isValid: boolean;
}

// -----------------------------------------------------------------------------
// RÉFÉRENTIELS ET ALIASES OFFICIELS
// -----------------------------------------------------------------------------

export const OPERATOR_ALIASES: Record<string, string> = {
  "1xbet": "1xBet",
  "1x bet": "1xBet",
  "bet223": "Bet223",
  "bet 223": "Bet223",
  "bet224": "Bet224",
  "premierbet": "PremierBet",
  "premier bet": "PremierBet",
  "malibet": "MALIBET",
  "mali bet": "MALIBET",
};

export const PAYMENT_OPERATOR_ALIASES: Record<string, string> = {
  "orange": "Orange Money",
  "orange money": "Orange Money",
  "om": "Orange Money",
  "moov": "Moov Money",
  "moov money": "Moov Money",
  "wave": "Wave",
  "espece": "Espèces",
  "especes": "Espèces",
  "espèces": "Espèces",
  "cash": "Espèces",
};

export const BET_TYPE_ALIASES: Record<string, string> = {
  "cheveaux": "Course de chevaux",
  "course de cheveaux": "Course de chevaux",
  "course de chevaux": "Course de chevaux",
  "hippique": "Course de chevaux",
  "course de chien": "Course de lévriers",
  "course de lévriers": "Course de lévriers",
  "lévrier": "Course de lévriers",
  "spiwin": "Spin 2 Win roulette",
  "spin2win": "Spin 2 Win roulette",
  "spin 2 win": "Spin 2 Win roulette",
  "spin 2 win roulette": "Spin 2 Win roulette",
  "keno boule": "Keno boule",
  "keno": "Keno",
  "keno color": "Keno color",
  "boule 1a80": "Boule 1 à 80",
  "boule 1 à 80": "Boule 1 à 80",
  "boule de 1 à 90": "Boule 1 à 90",
  "boule 1 à 90": "Boule 1 à 90",
  "loto pmu": "Loto PMU",
  "lotterie": "Loto PMU",
  "loterie": "Loto PMU",
  "casino": "Casino",
  "roulette": "Roulette",
  "roulette live": "Roulette (Live)",
  "live sport": "Paris sportifs (Live)",
  "paris sportifs live": "Paris sportifs (Live)",
  "pre-event sport": "Paris sportifs (Avant-match)",
  "pre event sport": "Paris sportifs (Avant-match)",
  "virtual": "Jeux virtuels",
  "virtuel": "Jeux virtuels",
};

export const SUPPORT_ALIASES: Record<string, string> = {
  "app mobile": "App mobile",
  "mobile": "App mobile",
  "site web": "Site Web",
  "web": "Site Web",
  "en ligne": "En ligne",
  "salle de jeux": "Salle de jeux",
  "salle": "Salle de jeux",
  "guichet": "Guichet",
  "point de vente": "Point de vente",
};

// -----------------------------------------------------------------------------
// NORMALISATION DES VALEURS ÉLÉMENTAIRES
// -----------------------------------------------------------------------------

/**
 * Normalise un montant monétaire en FCFA
 * Ex: "1000F", "2 500 FCFA", "900F " -> 1000, 2500, 900
 * Rejette strictement les formats non documentés comme "1000XYZ"
 */
export function normalizeAmount(input: any): NormalizedAmount {
  if (input === null || input === undefined || input === "") {
    return { value: null, raw: "", isValid: false };
  }

  if (typeof input === "number") {
    if (isNaN(input) || input < 0) {
      return { value: null, raw: String(input), isValid: false };
    }
    return { value: Math.round(input * 100) / 100, raw: String(input), isValid: true };
  }

  const raw = String(input).trim();
  if (!raw) {
    return { value: null, raw: "", isValid: false };
  }

  // Contrôle strict du format numérique et des devises autorisées
  const validPattern = /^[\d\s.,]+(?:f|cfa|fcfa)?$/i;
  if (!validPattern.test(raw)) {
    return { value: null, raw, isValid: false };
  }

  const cleaned = raw
    .replace(/(?:fcfa|cfa|f)$/i, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");

  const num = Number(cleaned);
  if (isNaN(num) || num < 0) {
    return { value: null, raw, isValid: false };
  }

  return { value: Math.round(num * 100) / 100, raw, isValid: true };
}

/**
 * Normalise une heure
 * Ex: "04H38", "4h24", "04:38:00", "04:38", objets Date natifs Excel -> "04:38"
 */
export function normalizeTime(input: any): NormalizedTime {
  if (input === null || input === undefined || input === "") {
    return { value: null, raw: "", isValid: false };
  }

  // Gestion des objets Date natifs Excel
  if (input instanceof Date && !isNaN(input.getTime())) {
    const hours = String(input.getHours()).padStart(2, "0");
    const minutes = String(input.getMinutes()).padStart(2, "0");
    return { value: `${hours}:${minutes}`, raw: `${hours}:${minutes}`, isValid: true };
  }

  // Fraction de jour Excel (ex: 0.5 -> 12:00)
  if (typeof input === "number" && input >= 0 && input < 1) {
    const totalMinutes = Math.round(input * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    return { value: formatted, raw: String(input), isValid: true };
  }

  const raw = String(input).trim();
  let h = "";
  let m = "00";

  if (raw.toLowerCase().includes("h")) {
    const parts = raw.toLowerCase().split("h");
    h = parts[0]?.trim() || "";
    m = parts[1]?.trim() || "00";
  } else if (raw.includes(":")) {
    const parts = raw.split(":");
    h = parts[0]?.trim() || "";
    m = parts[1]?.trim() || "00";
  } else if (!isNaN(parseInt(raw)) && raw.length <= 4) {
    if (raw.length === 3) {
      h = raw.slice(0, 1);
      m = raw.slice(1);
    } else if (raw.length === 4) {
      h = raw.slice(0, 2);
      m = raw.slice(2);
    }
  }

  const hourNum = parseInt(h);
  const minNum = parseInt(m);

  if (isNaN(hourNum) || isNaN(minNum) || hourNum < 0 || hourNum > 23 || minNum < 0 || minNum > 59) {
    return { value: null, raw, isValid: false };
  }

  const formatted = `${String(hourNum).padStart(2, "0")}:${String(minNum).padStart(2, "0")}`;
  return { value: formatted, raw, isValid: true };
}

/**
 * Normalise un numéro de téléphone en préservant scrupuleusement les zéros initiaux
 */
export function normalizePhone(input: any): string | null {
  if (!input) return null;
  const str = String(input).trim().replace(/[^\d+]/g, "");
  return str.length >= 6 ? str : null;
}

/**
 * Résout un alias de référentiel
 */
export function resolveAlias(value: any, aliasMap: Record<string, string>): string {
  if (!value) return "";
  const key = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  return aliasMap[key] || String(value).trim();
}

/**
 * Normalise l'état de la preuve
 */
export function normalizeProofStatus(input: any): "disponible" | "non_disponible" | "non_renseignee" {
  if (!input) return "non_renseignee";
  const s = String(input).trim().toLowerCase();
  if (s.includes("dispo") && !s.includes("non")) return "disponible";
  if (s.includes("non") || s.includes("absent") || s.includes("manque")) return "non_disponible";
  return "non_renseignee";
}

/**
 * Découpe un champ de type combiné sans inventer de valeur manquante
 */
export function splitTypeAndPayment(rawType: string, rawPayment: string): {
  type: "Dépôt" | "Retrait" | null;
  payment: string | null;
} {
  let type: "Dépôt" | "Retrait" | null = null;
  let payment: string | null = rawPayment ? resolveAlias(rawPayment, PAYMENT_OPERATOR_ALIASES) : null;

  const t = String(rawType || "").toLowerCase().trim();
  if (t.includes("retrait") || t.includes("rétrait") || t.includes("ret")) {
    type = "Retrait";
  } else if (t.includes("dépôt") || t.includes("depot") || t.includes("dep")) {
    type = "Dépôt";
  }

  // Détection si l'opérateur de paiement est mélangé dans le libellé du type (ex: "Dépôt Orange")
  if (!payment) {
    if (t.includes("orange") || t.includes("om")) {
      payment = "Orange Money";
    } else if (t.includes("moov")) {
      payment = "Moov Money";
    } else if (t.includes("wave")) {
      payment = "Wave";
    } else if (t.includes("espece") || t.includes("cash")) {
      payment = "Espèces";
    }
  }

  return { type, payment: payment || null };
}

// -----------------------------------------------------------------------------
// ANALYSE DU FICHIER TRANSACTIONS (depotretrait)
// -----------------------------------------------------------------------------

export function parseTransactionRow(
  rowValues: Record<string, any>,
  rowNumber: number,
  defaultDate: string | null
): ParsedTransactionRow {
  const anomalies: Anomaly[] = [];

  const rawOp = rowValues["Opérateur de jeux"] || rowValues["Opérateur"] || rowValues["operator"] || "";
  const rawPlatform = rowValues["Plateforme"] || rowValues["Support"] || rowValues["platform"] || "";
  const rawPayOp = rowValues["Opérateur de paiement"] || rowValues["Moyen de paiement"] || "";
  const rawType = rowValues["Type"] || rowValues["type"] || "";
  const rawAmount = rowValues["Montant"] || rowValues["amount"] || "";
  const rawTime = rowValues["Heure"] || rowValues["time"] || "";
  const rawPhone = rowValues["Numéro de téléphone"] || rowValues["Téléphone"] || rowValues["phone"] || "";
  const rawRef = rowValues["Référence"] || rowValues["reference"] || "";
  const rawProof = rowValues["preuve"] || rowValues["Preuve"] || "";

  // 1. Opérateur
  const operator = resolveAlias(rawOp, OPERATOR_ALIASES);
  if (!operator) {
    anomalies.push({
      row: rowNumber,
      field: "operator",
      message: "Opérateur de jeux manquant",
      severity: "error",
      rawValue: rawOp,
    });
  }

  // Support / Plateforme
  const platform = rawPlatform ? resolveAlias(rawPlatform, SUPPORT_ALIASES) : "";
  if (!platform) {
    anomalies.push({
      row: rowNumber,
      field: "platform",
      message: "Support ou plateforme non renseigné",
      severity: "warning",
    });
  }

  // 2. Type et moyen de paiement (sans invention de valeurs)
  const { type, payment } = splitTypeAndPayment(rawType, rawPayOp);
  if (!type) {
    anomalies.push({
      row: rowNumber,
      field: "type",
      message: "Type de flux manquant ou non reconnu (attendu: Dépôt ou Retrait)",
      severity: "error",
      rawValue: String(rawType),
    });
  }

  if (!payment) {
    anomalies.push({
      row: rowNumber,
      field: "paymentOperator",
      message: "Opérateur de paiement non renseigné",
      severity: "warning",
    });
  }

  // 3. Montant
  const parsedAmount = normalizeAmount(rawAmount);
  if (!parsedAmount.isValid || parsedAmount.value === null || parsedAmount.value < 0) {
    anomalies.push({
      row: rowNumber,
      field: "amount",
      message: "Montant invalide ou manquant",
      severity: "error",
      rawValue: String(rawAmount),
    });
  }

  // 4. Heure
  const parsedTime = normalizeTime(rawTime);
  if (!parsedTime.isValid && rawTime) {
    anomalies.push({
      row: rowNumber,
      field: "time",
      message: `Format d'heure suspect: "${rawTime}"`,
      severity: "warning",
      rawValue: String(rawTime),
    });
  }

  // 5. Date
  let date = defaultDate;
  if (!date) {
    anomalies.push({
      row: rowNumber,
      field: "date",
      message: "Date absente (non spécifiée dans le classeur)",
      severity: "error",
    });
  }

  // 6. Référence
  const reference = rawRef ? String(rawRef).trim() : null;
  if (!reference) {
    anomalies.push({
      row: rowNumber,
      field: "reference",
      message: "Référence absente",
      severity: "warning",
    });
  }

  // 7. Téléphone
  const phone = normalizePhone(rawPhone);

  // 8. Preuve
  const proofStatus = normalizeProofStatus(rawProof);

  const isValid = anomalies.filter((a) => a.severity === "error").length === 0;

  return {
    rowNumber,
    operator: operator || "",
    platform: platform || "",
    paymentOperator: payment || "",
    type: (type || "Dépôt") as "Dépôt" | "Retrait",
    amount: parsedAmount.value || 0,
    time: parsedTime.value,
    date,
    phone,
    reference,
    proofStatus,
    raw: rowValues,
    anomalies,
    isValid,
  };
}

// -----------------------------------------------------------------------------
// ANALYSE DU FICHIER PARIS (pari)
// -----------------------------------------------------------------------------

export function parseBetRow(
  rowValues: Record<string, any>,
  rowNumber: number,
  defaultDate: string | null
): ParsedBetRow {
  const anomalies: Anomaly[] = [];

  const rawOp = rowValues["Opérateur de jeux"] || rowValues["Opérateur"] || rowValues["operator"] || "";
  const rawSupport = rowValues["Support"] || rowValues["Plateforme"] || rowValues["platform"] || "";
  const rawBetType = rowValues["Type de Pari"] || rowValues["Type de pari"] || rowValues["bet_type"] || "";
  const rawAmount = rowValues["Montant"] || rowValues["amount"] || "";
  const rawTime = rowValues["Heure"] || rowValues["time"] || "";
  const rawPhone = rowValues["Numéro de téléphone"] || rowValues["phone"] || "";
  const rawRef = rowValues["Référence"] || rowValues["reference"] || "";
  const rawStatus = rowValues["statut"] || rowValues["Statut"] || "";
  const rawAmountWon = rowValues["montant gagné"] || rowValues["Montant gagné"] || "";

  // 1. Opérateur
  const operator = resolveAlias(rawOp, OPERATOR_ALIASES);
  if (!operator) {
    anomalies.push({
      row: rowNumber,
      field: "operator",
      message: "Opérateur de jeux manquant",
      severity: "error",
      rawValue: rawOp,
    });
  }

  // Support
  const support = rawSupport ? resolveAlias(rawSupport, SUPPORT_ALIASES) : "";
  if (!support) {
    anomalies.push({
      row: rowNumber,
      field: "support",
      message: "Support non renseigné",
      severity: "warning",
    });
  }

  // 2. Type de pari
  const betType = rawBetType ? resolveAlias(rawBetType, BET_TYPE_ALIASES) : "";
  if (!betType) {
    anomalies.push({
      row: rowNumber,
      field: "betType",
      message: "Type de pari / jeu manquant",
      severity: "error",
      rawValue: rawBetType,
    });
  }

  // 3. Montant misé
  const parsedAmount = normalizeAmount(rawAmount);
  if (!parsedAmount.isValid || parsedAmount.value === null || parsedAmount.value <= 0) {
    anomalies.push({
      row: rowNumber,
      field: "amount",
      message: "Montant misé invalide",
      severity: "error",
      rawValue: String(rawAmount),
    });
  }

  // 4. Heure
  const parsedTime = normalizeTime(rawTime);
  if (!parsedTime.isValid && rawTime) {
    anomalies.push({
      row: rowNumber,
      field: "time",
      message: `Format d'heure suspect: "${rawTime}"`,
      severity: "warning",
      rawValue: String(rawTime),
    });
  }

  // 5. Date
  let date = defaultDate;
  if (!date) {
    anomalies.push({
      row: rowNumber,
      field: "date",
      message: "Date absente (non spécifiée dans le classeur)",
      severity: "error",
    });
  }

  // 6. Statut du résultat du jeu
  let status: "en_attente" | "gagné" | "perdu" = "en_attente";
  const st = String(rawStatus || "").toLowerCase().trim();
  if (st.includes("gagn")) {
    status = "gagné";
  } else if (st.includes("perd") || st.includes("perdu")) {
    status = "perdu";
  } else {
    status = "en_attente";
  }

  // 7. Montant gagné (distinction stricte gain brut vs marge)
  let amountWon: number | null = null;
  if (status === "perdu") {
    amountWon = 0;
  } else if (status === "gagné") {
    const parsedWon = normalizeAmount(rawAmountWon);
    if (parsedWon.isValid && parsedWon.value !== null) {
      amountWon = parsedWon.value;
    } else {
      amountWon = null; // Non renseigné
      anomalies.push({
        row: rowNumber,
        field: "amountWon",
        message: "Pari marqué 'gagné' mais montant du gain non renseigné",
        severity: "warning",
      });
    }
  }

  // 8. Référence & Téléphone
  const reference = rawRef ? String(rawRef).trim() : null;
  const phone = normalizePhone(rawPhone);

  const isValid = anomalies.filter((a) => a.severity === "error").length === 0;

  return {
    rowNumber,
    operator: operator || "",
    support: support || "",
    betType: betType || "",
    amount: parsedAmount.value || 0,
    time: parsedTime.value,
    date,
    phone,
    reference,
    status,
    amountWon,
    proofStatus: "non_renseignee",
    raw: rowValues,
    anomalies,
    isValid,
  };
}

// -----------------------------------------------------------------------------
// ANALYSE DU FICHIER SALLES DE JEUX (multi-jeux par établissement)
// -----------------------------------------------------------------------------

export function parseVenuesGrouped(
  rawRows: Array<{
    rowNumber: number;
    no?: string;
    quartier?: string;
    operator?: string;
    support?: string;
    betType?: string;
    localisation?: string;
  }>
): ParsedVenueGroup[] {
  const groups: ParsedVenueGroup[] = [];
  let currentGroup: ParsedVenueGroup | null = null;

  for (const row of rawRows) {
    const rowNo = row.no ? parseInt(String(row.no).trim()) : null;
    const quartier = row.quartier ? String(row.quartier).trim() : "";
    const operatorRaw = row.operator ? String(row.operator).trim() : "";
    const supportRaw = row.support ? String(row.support).trim() : "";
    const betTypeRaw = row.betType ? String(row.betType).trim() : "";
    const locRaw = row.localisation ? String(row.localisation).trim() : "";

    // Ignorer les lignes d'en-tête résiduelles ou totalement vides
    if (!rowNo && !quartier && !operatorRaw && !betTypeRaw) continue;

    // Détection d'un nouvel établissement numéroté
    const isNewEstablishment = rowNo !== null && !isNaN(rowNo);

    // Détection de rupture de groupe sans nouveau numéro (quartier ou opérateur distinct)
    const isQuartierBreak = currentGroup && quartier && normalizeQuartierName(quartier) !== currentGroup.quartier;
    const isOperatorBreak = currentGroup && operatorRaw && resolveAlias(operatorRaw, OPERATOR_ALIASES) !== currentGroup.operator;

    if (isNewEstablishment || isQuartierBreak || isOperatorBreak) {
      if (currentGroup) {
        validateVenueGroup(currentGroup);
        groups.push(currentGroup);
      }

      currentGroup = {
        venueNumber: rowNo,
        quartier: normalizeQuartierName(quartier),
        operator: resolveAlias(operatorRaw, OPERATOR_ALIASES) || "Opérateur",
        support: resolveAlias(supportRaw, SUPPORT_ALIASES) || "Salle de jeux",
        address: normalizeAddress(locRaw),
        games: [],
        secondaryLocations: [],
        isAmbiguous: Boolean(isQuartierBreak || isOperatorBreak),
        startRow: row.rowNumber,
        endRow: row.rowNumber,
        rawRows: [row.rowNumber],
        anomalies: [],
        isValid: true,
      };

      if (isQuartierBreak || isOperatorBreak) {
        currentGroup.anomalies.push({
          row: row.rowNumber,
          field: "group",
          message: `Rupture de groupe détectée (${isQuartierBreak ? "quartier distinct" : "opérateur distinct"}) sans numéro d'établissement`,
          severity: "warning",
        });
      }

      if (betTypeRaw) {
        const canonicalGame = resolveAlias(betTypeRaw, BET_TYPE_ALIASES);
        if (canonicalGame && !currentGroup.games.includes(canonicalGame)) {
          currentGroup.games.push(canonicalGame);
        }
      }
    } else if (currentGroup) {
      currentGroup.endRow = row.rowNumber;
      currentGroup.rawRows.push(row.rowNumber);

      if (betTypeRaw) {
        const canonicalGame = resolveAlias(betTypeRaw, BET_TYPE_ALIASES);
        if (canonicalGame && !currentGroup.games.includes(canonicalGame)) {
          currentGroup.games.push(canonicalGame);
        }
      }

      if (locRaw && normalizeAddress(locRaw) !== currentGroup.address && currentGroup.address !== "Non renseignée") {
        if (!currentGroup.secondaryLocations.includes(locRaw)) {
          currentGroup.secondaryLocations.push(locRaw);
        }
        currentGroup.anomalies.push({
          row: row.rowNumber,
          field: "address",
          message: `Localisation secondaire détectée: "${locRaw}" (principale: "${currentGroup.address}")`,
          severity: "warning",
          rawValue: locRaw,
        });
      }
    } else {
      // Ligne isolée sans en-tête préalable
      const isolatedGroup: ParsedVenueGroup = {
        venueNumber: null,
        quartier: normalizeQuartierName(quartier),
        operator: resolveAlias(operatorRaw, OPERATOR_ALIASES) || "Opérateur",
        support: resolveAlias(supportRaw, SUPPORT_ALIASES) || "Salle de jeux",
        address: normalizeAddress(locRaw),
        games: betTypeRaw ? [resolveAlias(betTypeRaw, BET_TYPE_ALIASES)] : [],
        secondaryLocations: [],
        isAmbiguous: true,
        startRow: row.rowNumber,
        endRow: row.rowNumber,
        rawRows: [row.rowNumber],
        anomalies: [
          {
            row: row.rowNumber,
            field: "group",
            message: "Ligne de salle isolée sans en-tête d'établissement",
            severity: "warning",
          },
        ],
        isValid: true,
      };
      validateVenueGroup(isolatedGroup);
      groups.push(isolatedGroup);
    }
  }

  if (currentGroup) {
    validateVenueGroup(currentGroup);
    groups.push(currentGroup);
  }

  return groups;
}

function validateVenueGroup(group: ParsedVenueGroup) {
  if (!group.quartier || group.quartier === "Inconnu") {
    group.anomalies.push({
      row: group.startRow,
      field: "quartier",
      message: "Quartier manquant",
      severity: "error",
    });
  }

  if (!group.address || group.address === "?" || group.address === "Non renseignée") {
    group.anomalies.push({
      row: group.startRow,
      field: "address",
      message: "Localisation non précisée ou marquée '?'",
      severity: "warning",
      rawValue: group.address,
    });
  }

  if (group.games.length === 0) {
    group.anomalies.push({
      row: group.startRow,
      field: "games",
      message: "Aucun jeu associé à cette salle",
      severity: "warning",
    });
  }

  group.isValid = group.anomalies.filter((a) => a.severity === "error").length === 0;
}

export function normalizeQuartierName(q: string): string {
  if (!q) return "Inconnu";
  const trimmed = q.trim();
  // Capitalisation élégante
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function normalizeAddress(addr: string): string {
  if (!addr || addr.trim() === "?" || addr.trim() === "") return "Non renseignée";
  let s = addr.trim();
  if (s.toLowerCase().startsWith("le tour d'afrique")) {
    s = "La Tour d'Afrique" + s.slice(17);
  } else if (s.toLowerCase().startsWith("ancienne poste de 11e")) {
    s = "Ancienne poste du 11e arrondissement";
  } else if (s.toLowerCase().includes("a côte du mairie") || s.toLowerCase().includes("à côte du mairie")) {
    s = "À côté de la Mairie";
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// -----------------------------------------------------------------------------
// DÉTECTION DES DOUBLONS & COLLISIONS
// -----------------------------------------------------------------------------

export interface DuplicateCheckResult<T> {
  item: T;
  isDuplicate: boolean;
  duplicateType?: "exact" | "ref_collision";
  matchingItem?: any;
}

export function detectDuplicatesInTransactions(
  transactions: ParsedTransactionRow[],
  existingRefs: Set<string>
): DuplicateCheckResult<ParsedTransactionRow>[] {
  const seenFileRefs = new Map<string, number>();

  return transactions.map((tx) => {
    if (!tx.reference) {
      return { item: tx, isDuplicate: false };
    }

    const ref = tx.reference.toLowerCase();

    // 1. Collision avec la base de données existante
    if (existingRefs.has(ref)) {
      tx.anomalies.push({
        row: tx.rowNumber,
        field: "reference",
        message: `Référence déjà existante en base de données: [${tx.reference}]`,
        severity: "warning",
        rawValue: tx.reference,
      });
      return { item: tx, isDuplicate: true, duplicateType: "ref_collision" };
    }

    // 2. Doublon intra-fichier
    if (seenFileRefs.has(ref)) {
      const prevRow = seenFileRefs.get(ref);
      tx.anomalies.push({
        row: tx.rowNumber,
        field: "reference",
        message: `Référence en double dans le fichier (déjà vue ligne ${prevRow}): [${tx.reference}]`,
        severity: "warning",
        rawValue: tx.reference,
      });
      return { item: tx, isDuplicate: true, duplicateType: "exact" };
    }

    seenFileRefs.set(ref, tx.rowNumber);
    return { item: tx, isDuplicate: false };
  });
}

// -----------------------------------------------------------------------------
// PROTECTION CONTRE L'INJECTION DE FORMULES (CSV / EXCEL EXPORT)
// -----------------------------------------------------------------------------

/**
 * Nettoie une chaîne contre les attaques d'injection de formules (=, +, -, @)
 */
export function sanitizeForSpreadsheet(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`; // Préfixe avec quote simple sécurisée
  }
  return str;
}
