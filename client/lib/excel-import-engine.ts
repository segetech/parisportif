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
  "keno": "Keno boule",
  "keno color": "Keno boule",
  "boule 1a80": "Boule 1 à 80",
  "boule 1 à 80": "Boule 1 à 80",
  "boule de 1 à 90": "Boule 1 à 90",
  "boule 1 à 90": "Boule 1 à 90",
  "loto pmu": "Loto PMU",
  "lotterie": "Loto PMU",
  "loterie": "Loto PMU",
  "casino": "Casino",
  "roulette": "Casino",
  "roulette live": "Casino",
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
 */
export function normalizeAmount(input: any): NormalizedAmount {
  if (input === null || input === undefined || input === "") {
    return { value: null, raw: "", isValid: false };
  }

  const raw = String(input).trim();
  // Remplacer virgule par point, supprimer 'F', 'FCFA', 'CFA' et espaces
  const cleaned = raw
    .replace(/[fFcCfFaA]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");

  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) {
    return { value: null, raw, isValid: false };
  }

  return { value: Math.round(num * 100) / 100, raw, isValid: true };
}

/**
 * Normalise une heure
 * Ex: "04H38", "4h24", "04:38:00", "04:38" -> "04:38"
 */
export function normalizeTime(input: any): NormalizedTime {
  if (!input) return { value: null, raw: "", isValid: false };

  const raw = String(input).trim();
  // Gestion du format avec 'H' ou 'h'
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
    // Ex: "438" -> 04:38
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
 * Découpe un champ de type combiné (ex: "Dépôt Orange" -> Type: Dépôt, Moyen: Orange Money)
 */
export function splitTypeAndPayment(rawType: string, rawPayment: string): { type: "Dépôt" | "Retrait"; payment: string } {
  let type: "Dépôt" | "Retrait" = "Dépôt";
  let payment = rawPayment ? resolveAlias(rawPayment, PAYMENT_OPERATOR_ALIASES) : "";

  const t = String(rawType || "").toLowerCase().trim();
  if (t.includes("retrait") || t.includes("rétrait")) {
    type = "Retrait";
  } else {
    type = "Dépôt";
  }

  if (t.includes("orange") && !payment) {
    payment = "Orange Money";
  } else if (t.includes("moov") && !payment) {
    payment = "Moov Money";
  } else if (t.includes("wave") && !payment) {
    payment = "Wave";
  }

  return { type, payment: payment || "Orange Money" };
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
  const rawPlatform = rowValues["Plateforme"] || rowValues["Support"] || rowValues["platform"] || "App mobile";
  const rawPayOp = rowValues["Opérateur de paiement"] || rowValues["Moyen de paiement"] || "";
  const rawType = rowValues["Type"] || rowValues["type"] || "Dépôt";
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

  // 2. Type et moyen de paiement
  const { type, payment } = splitTypeAndPayment(rawType, rawPayOp);

  // 3. Montant
  const parsedAmount = normalizeAmount(rawAmount);
  if (!parsedAmount.isValid || !parsedAmount.value || parsedAmount.value <= 0) {
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
    operator: operator || "Inconnu",
    platform: resolveAlias(rawPlatform, SUPPORT_ALIASES) || "App mobile",
    paymentOperator: payment || "Orange Money",
    type,
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
  const rawSupport = rowValues["Support"] || rowValues["Plateforme"] || "App mobile";
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

  // 2. Type de pari
  const betType = resolveAlias(rawBetType, BET_TYPE_ALIASES);
  if (!betType) {
    anomalies.push({
      row: rowNumber,
      field: "betType",
      message: "Type de pari manquant",
      severity: "error",
      rawValue: rawBetType,
    });
  }

  // 3. Montant misé
  const parsedAmount = normalizeAmount(rawAmount);
  if (!parsedAmount.isValid || !parsedAmount.value || parsedAmount.value <= 0) {
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
    operator: operator || "Inconnu",
    support: resolveAlias(rawSupport, SUPPORT_ALIASES) || "App mobile",
    betType: betType || "Paris sportifs",
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

    // Ignore header and empty stray rows
    if (!rowNo && !quartier && !operatorRaw && !betTypeRaw) continue;

    // A row with a valid number indicates a new establishment
    const isNewEstablishment = rowNo !== null && !isNaN(rowNo);

    if (isNewEstablishment) {
      // Finalize previous group if open
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
        startRow: row.rowNumber,
        endRow: row.rowNumber,
        rawRows: [row.rowNumber],
        anomalies: [],
        isValid: true,
      };

      if (betTypeRaw) {
        const canonicalGame = resolveAlias(betTypeRaw, BET_TYPE_ALIASES);
        if (canonicalGame && !currentGroup.games.includes(canonicalGame)) {
          currentGroup.games.push(canonicalGame);
        }
      }
    } else if (currentGroup) {
      // Continuation row for the same venue: add additional game!
      currentGroup.endRow = row.rowNumber;
      currentGroup.rawRows.push(row.rowNumber);

      if (betTypeRaw) {
        const canonicalGame = resolveAlias(betTypeRaw, BET_TYPE_ALIASES);
        if (canonicalGame && !currentGroup.games.includes(canonicalGame)) {
          currentGroup.games.push(canonicalGame);
        }
      }

      // Check for conflicting or multiple localisations
      if (locRaw && normalizeAddress(locRaw) !== currentGroup.address && currentGroup.address !== "Non renseignée") {
        currentGroup.anomalies.push({
          row: row.rowNumber,
          field: "address",
          message: `Localisation secondaire détectée: "${locRaw}" (principale: "${currentGroup.address}")`,
          severity: "warning",
          rawValue: locRaw,
        });
      }
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
