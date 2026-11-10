/**
 * Module métier pur de calcul et d'agrégation du tableau de bord.
 * Utilisé directement par useDashboardData() et testé unitairement.
 */

export interface RawBet {
  id: string;
  amount_fcfa?: number | string | null;
  amount_won_fcfa?: number | string | null;
  status?: string | null;
  validation_status?: string | null;
  date?: string | null;
  time?: string | null;
  operator?: string | null;
  support?: string | null;
  bet_type?: string | null;
  created_by?: string | null;
}

export interface RawTransaction {
  id: string;
  type?: string | null;
  amount_fcfa?: number | string | null;
  validation_status?: string | null;
  date?: string | null;
  time?: string | null;
  operator?: string | null;
  created_by?: string | null;
}

export interface RawVenue {
  id: string;
  operator?: string | null;
  validation_status?: string | null;
  name?: string | null;
  quartier?: string | null;
}

export interface RawIllegalIncident {
  id: string;
  date?: string | null;
  created_at?: string | null;
}

export interface DailyAnomalyPoint {
  date: string; // Format ISO YYYY-MM-DD
  day: string;  // Format court affichable "Lun 04/11"
  paris: number;
  transactions: number;
}

export interface CalculatedDashboardStats {
  totalVenues: number;
  totalBets: number;
  totalBetsAmount: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalKnownWinnings: number;
  pendingValidationsCount: number;
  wonBetsCount: number;
  lostBetsCount: number;
  pendingBetsCount: number;
  totalIllegalBets: number;
  totalIllegalTransactions: number;
  recentBets: RawBet[];
  operatorsCount: number;
  venuesByOperator: { name: string; count: number }[];
  illegalActivityTrend: DailyAnomalyPoint[];
}

/**
 * Fuseau horaire officiel du Mali / UEMOA (GMT+0 permanent, sans heure d'été).
 */
export const OFFICIAL_TIMEZONE = "Africa/Bamako";

/**
 * Formate un timestamp ou une date ISO en 'YYYY-MM-DD' dans le fuseau Africa/Bamako.
 * Renvoie null si la date est invalide ou indéchiffrable.
 */
export function toBamakoDateString(input?: string | Date | null): string | null {
  if (!input) return null;
  try {
    const d = typeof input === "string" ? new Date(input) : input;
    if (isNaN(d.getTime())) return null;

    // Utilisation de Intl.DateTimeFormat pour extraire la date locale à Bamako
    const formatter = new Intl.DateTimeFormat("fr-CA", {
      timeZone: OFFICIAL_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(d); // Produit 'YYYY-MM-DD'
  } catch {
    return null;
  }
}

/**
 * Calcule la tendance hebdomadaire des anomalies sur les 7 derniers jours calendaires
 * dans le fuseau Africa/Bamako jusqu'à la date de référence.
 *
 * Règles strictes :
 * - Période exacte de 7 jours consécutifs [refDate - 6 jours, refDate inclus].
 * - Les incidents antérieurs (ex: 2020) ou postérieurs sont strictement exclus.
 * - Les dates invalides sont ignorées.
 * - Si aucun incident, renvoie 7 zéros plats.
 */
export function computeWeeklyAnomalyTrend(
  illegalBets: RawIllegalIncident[] = [],
  illegalTransactions: RawIllegalIncident[] = [],
  referenceDateInput: Date | string = new Date()
): DailyAnomalyPoint[] {
  const refDateObj =
    typeof referenceDateInput === "string"
      ? new Date(referenceDateInput)
      : referenceDateInput;

  const validRef = isNaN(refDateObj.getTime()) ? new Date() : refDateObj;
  const refDateBamakoStr = toBamakoDateString(validRef) || "2026-11-10";

  // Décomposition de l'année, mois, jour de référence
  const [refY, refM, refD] = refDateBamakoStr.split("-").map(Number);
  const baseDateUtc = new Date(Date.UTC(refY, refM - 1, refD));

  // Générer les 7 jours consécutifs ordonnés chronologiquement (de J-6 à J)
  const daysMap = new Map<string, DailyAnomalyPoint>();
  const dayNamesShort = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(baseDateUtc);
    d.setUTCDate(baseDateUtc.getUTCDate() - offset);

    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;

    const dayName = dayNamesShort[d.getUTCDay()];
    const label = `${dayName} ${day}/${month}`;

    daysMap.set(dateKey, {
      date: dateKey,
      day: label,
      paris: 0,
      transactions: 0,
    });
  }

  // Filtrer et agréger les paris illégaux dans la période exacte
  for (const bet of illegalBets) {
    const rawDate = bet.date || bet.created_at;
    const dateStr = toBamakoDateString(rawDate);
    if (dateStr && daysMap.has(dateStr)) {
      daysMap.get(dateStr)!.paris += 1;
    }
  }

  // Filtrer et agréger les transactions illégales dans la période exacte
  for (const tx of illegalTransactions) {
    const rawDate = tx.date || tx.created_at;
    const dateStr = toBamakoDateString(rawDate);
    if (dateStr && daysMap.has(dateStr)) {
      daysMap.get(dateStr)!.transactions += 1;
    }
  }

  return Array.from(daysMap.values());
}

/**
 * Calcule l'intégralité des statistiques du tableau de bord sur l'ensemble complet
 * des données fournies (au-delà des 30 lignes récentes).
 */
export function computeDashboardStats({
  allBets = [],
  transactions = [],
  venues = [],
  illegalBets = [],
  illegalTransactions = [],
  referenceDate = new Date(),
}: {
  allBets?: RawBet[];
  transactions?: RawTransaction[];
  venues?: RawVenue[];
  illegalBets?: RawIllegalIncident[];
  illegalTransactions?: RawIllegalIncident[];
  referenceDate?: Date | string;
}): CalculatedDashboardStats {
  let totalBetsAmount = 0;
  let totalKnownWinnings = 0;
  let wonBetsCount = 0;
  let lostBetsCount = 0;
  let pendingBetsCount = 0;
  let pendingValidationsCount = 0;

  for (const b of allBets) {
    const amt = Number(b.amount_fcfa) || 0;
    totalBetsAmount += amt;

    // Distinguer gains inconnus (null/undefined) de gains à 0
    if (b.amount_won_fcfa !== null && b.amount_won_fcfa !== undefined) {
      const wonAmt = Number(b.amount_won_fcfa);
      if (!isNaN(wonAmt)) {
        totalKnownWinnings += wonAmt;
      }
    }

    const st = (b.status || "").toLowerCase().trim();
    if (st.includes("gagn") || st === "won") {
      wonBetsCount++;
    } else if (st.includes("perdu") || st === "lost") {
      lostBetsCount++;
    } else {
      pendingBetsCount++;
    }

    if (b.validation_status === "en_attente") {
      pendingValidationsCount++;
    }
  }

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  for (const tx of transactions) {
    const amt = Number(tx.amount_fcfa) || 0;
    const type = (tx.type || "").trim();
    if (type === "Dépôt" || type === "depot") {
      totalDeposits += amt;
    } else if (type === "Retrait" || type === "retrait") {
      totalWithdrawals += amt;
    }

    if (tx.validation_status === "en_attente") {
      pendingValidationsCount++;
    }
  }

  // Distribution des salles par opérateur & validations en attente
  const opCountMap: Record<string, number> = {};
  for (const v of venues) {
    const op = (v.operator || "Autre").trim();
    opCountMap[op] = (opCountMap[op] || 0) + 1;

    if (v.validation_status === "en_attente") {
      pendingValidationsCount++;
    }
  }

  const venuesByOperator = Object.entries(opCountMap).map(([name, count]) => ({
    name,
    count,
  }));

  // Extraction ordonnée des 30 paris les plus récents pour la table UI
  const recentBets = [...allBets]
    .sort((a, b) => {
      const dateA = a.date || "";
      const dateB = b.date || "";
      const dateDiff = dateB.localeCompare(dateA);
      if (dateDiff !== 0) return dateDiff;
      const timeA = a.time || "";
      const timeB = b.time || "";
      return timeB.localeCompare(timeA);
    })
    .slice(0, 30);

  // Ensemble des opérateurs uniques
  const opSet = new Set<string>();
  venues.forEach((v) => v.operator && opSet.add(v.operator.trim()));
  allBets.forEach((b) => b.operator && opSet.add(b.operator.trim()));

  // Tendance hebdomadaire Africa/Bamako
  const illegalActivityTrend = computeWeeklyAnomalyTrend(
    illegalBets,
    illegalTransactions,
    referenceDate
  );

  return {
    totalVenues: venues.length,
    totalBets: allBets.length,
    totalBetsAmount,
    totalDeposits,
    totalWithdrawals,
    totalKnownWinnings,
    pendingValidationsCount,
    wonBetsCount,
    lostBetsCount,
    pendingBetsCount,
    totalIllegalBets: illegalBets.length,
    totalIllegalTransactions: illegalTransactions.length,
    recentBets,
    operatorsCount: opSet.size,
    venuesByOperator,
    illegalActivityTrend,
  };
}
