import type { Bet, Transaction } from "@/data/api";

const LINK_TAG_REGEX = /\[RAPPROCHÉ:([0-9a-fA-F-]+)\]/g;
const LINK_TAG_SINGLE_REGEX = /\[RAPPROCHÉ:([0-9a-fA-F-]+)\]/;
const REJECTED_STORAGE_PREFIX = "ps.matching.rejected.v1:";

export type MatchingConfidence = "high" | "medium" | "low";

export interface MatchingOptions {
  windowMinutes?: number;
  amountTolerancePercent?: number;
  minScore?: number;
  operatorFilter?: string;
  query?: string;
  startDate?: string;
  endDate?: string;
  rejectedIds?: Set<string>;
}

export interface MatchingSuggestion {
  id: string;
  score: number;
  confidence: MatchingConfidence;
  operator: string;
  reasons: string[];
  timeDiffMinutes: number | null;
  amountDiffFcfa: number;
  tx: Transaction;
  bet: Bet;
}

export interface MatchedPair {
  id: string;
  tx: Transaction;
  bet: Bet;
  reasons: string[];
  score: number;
}

export interface MatchingAnalysisResult {
  suggestions: MatchingSuggestion[];
  rejectedSuggestions: MatchingSuggestion[];
  matchedPairs: MatchedPair[];
  unmatchedTransactions: Transaction[];
  unmatchedBets: Bet[];
  orphanLinkedBets: Bet[];
}

/** Reads the linked transaction ID stored in `linked_tx_id` or inside `notes` (`[RAPPROCHÉ:<uuid>]`). */
export function readLinkedTxId(
  bet: { linked_tx_id?: string | null; notes?: string | null } | null | undefined,
): string | null {
  if (!bet) return null;
  if (typeof bet.linked_tx_id === "string" && bet.linked_tx_id.trim()) {
    return bet.linked_tx_id.trim();
  }
  const notes = bet.notes || "";
  const match = notes.match(LINK_TAG_SINGLE_REGEX);
  return match?.[1]?.trim() || null;
}

/** Removes any `[RAPPROCHÉ:...]` marker for clean human display in UI notes. */
export function cleanMatchingNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .replace(LINK_TAG_REGEX, "")
    .replace(/\s*\|\s*$/g, "")
    .replace(/^\s*\|\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Writes or replaces `[RAPPROCHÉ:<txId>]` inside `notes` while preserving existing text and references. */
export function writeLinkedTxId(
  notes: string | null | undefined,
  txId: string,
): string {
  const cleanId = txId.trim();
  const base = cleanMatchingNotes(notes);
  const tag = `[RAPPROCHÉ:${cleanId}]`;
  return base ? `${base} | ${tag}` : tag;
}

/** Strips `[RAPPROCHÉ:...]` from `notes` when unlinking a matched pair. */
export function removeLinkedTxId(
  notes: string | null | undefined,
): string | null {
  const cleaned = cleanMatchingNotes(notes);
  return cleaned || null;
}

/** Checks whether the user role is allowed by RLS to update matching notes on a bet. */
export function canModifyBetMatch(
  role?: string,
  betValidationStatus?: string | null,
): boolean {
  if (role === "ADMIN") return true;
  if (role === "CONTROLEUR") {
    return !betValidationStatus || betValidationStatus === "en_attente";
  }
  return false;
}

function rejectedStorageKey(userId?: string): string {
  return `${REJECTED_STORAGE_PREFIX}${userId || "anon"}`;
}

/** Loads persisted rejected suggestion IDs from localStorage. */
export function loadRejectedPairs(userId?: string): Set<string> {
  if (typeof window === "undefined" || !window.localStorage) {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(rejectedStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

/** Persists rejected suggestion IDs to localStorage. */
export function saveRejectedPairs(
  userId: string | undefined,
  rejected: Set<string>,
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      rejectedStorageKey(userId),
      JSON.stringify(Array.from(rejected)),
    );
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D+/g, "");
  return digits.length >= 6 ? digits : "";
}

function parseTimeMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = String(time).trim().match(/^(\d{1,2})[:hH](\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(mins) ||
    hours < 0 ||
    hours > 23 ||
    mins < 0 ||
    mins > 59
  ) {
    return null;
  }
  return hours * 60 + mins;
}

function normalizeDate(date: string | null | undefined): string {
  return (date || "").trim().slice(0, 10);
}

function matchesSearchQuery(
  query: string,
  tx?: Transaction | null,
  bet?: Bet | null,
): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const fields: Array<string | number | null | undefined> = [];
  if (tx) {
    fields.push(
      tx.reference,
      tx.operator,
      tx.phone,
      tx.amount_fcfa,
      tx.type,
      tx.payment_operator,
      tx.notes,
    );
  }
  if (bet) {
    fields.push(
      bet.reference,
      bet.operator,
      bet.phone,
      bet.amount_fcfa,
      bet.bet_type,
      bet.support,
      bet.notes,
    );
  }
  return fields.some((f) => String(f ?? "").toLowerCase().includes(q));
}

function withinDateRange(
  date: string | null | undefined,
  startDate?: string,
  endDate?: string,
): boolean {
  const d = normalizeDate(date);
  if (!d) return !startDate && !endDate;
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

export function getConfidenceLevel(score: number): MatchingConfidence {
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function scorePair(
  tx: Transaction,
  bet: Bet,
  windowMinutes: number,
  tolerancePercent: number,
): {
  eligible: boolean;
  score: number;
  reasons: string[];
  timeDiffMinutes: number | null;
  amountDiffFcfa: number;
} {
  const txDate = normalizeDate(tx.date);
  const betDate = normalizeDate(bet.date);
  const txOp = normalizeText(tx.operator);
  const betOp = normalizeText(bet.operator);

  // Mandatory equality on date and operator for automatic matching
  if (!txDate || !betDate || txDate !== betDate || !txOp || txOp !== betOp) {
    return {
      eligible: false,
      score: 0,
      reasons: [],
      timeDiffMinutes: null,
      amountDiffFcfa: 0,
    };
  }

  let score = 40;
  const reasons: string[] = ["Même date et opérateur"];

  const txMins = parseTimeMinutes(tx.time);
  const betMins = parseTimeMinutes(bet.time);
  const timeDiffMinutes =
    txMins !== null && betMins !== null ? Math.abs(txMins - betMins) : null;

  const txAmount = Number(tx.amount_fcfa) || 0;
  const betAmount = Number(bet.amount_fcfa) || 0;
  const amountDiffFcfa = Math.abs(txAmount - betAmount);
  const tolAmount = (tolerancePercent / 100) * Math.max(betAmount, 0);
  const amountMatches = amountDiffFcfa === 0 || amountDiffFcfa <= tolAmount;

  const txPhone = normalizePhone(tx.phone);
  const betPhone = normalizePhone(bet.phone);
  const phoneMatches = Boolean(txPhone && betPhone && txPhone === betPhone);

  const txRef = normalizeText(tx.reference);
  const betRef = normalizeText(bet.reference);
  const txNotes = normalizeText(cleanMatchingNotes(tx.notes));
  const betNotes = normalizeText(cleanMatchingNotes(bet.notes));
  const referenceMatches = Boolean(
    (txRef && betRef && txRef === betRef) ||
      (txRef.length >= 4 &&
        (betRef.includes(txRef) || betNotes.includes(txRef))) ||
      (betRef.length >= 4 &&
        (txRef.includes(betRef) || txNotes.includes(betRef))),
  );

  // Skip pairs that are outside the time window and have neither reference, amount nor phone match
  if (
    timeDiffMinutes !== null &&
    timeDiffMinutes > windowMinutes &&
    !amountMatches &&
    !phoneMatches &&
    !referenceMatches
  ) {
    return {
      eligible: false,
      score: 0,
      reasons: [],
      timeDiffMinutes,
      amountDiffFcfa,
    };
  }

  if (referenceMatches) {
    score += 35;
    reasons.push("Même référence");
  }

  if (timeDiffMinutes !== null) {
    if (timeDiffMinutes <= 5) {
      score += 30;
      reasons.push(`Heure quasi-identique (±${timeDiffMinutes} min)`);
    } else if (timeDiffMinutes <= windowMinutes) {
      score += 25;
      reasons.push(`Heure proche (±${windowMinutes} min)`);
    }
  }

  if (amountDiffFcfa === 0 && txAmount > 0) {
    score += 20;
    reasons.push("Montant exact");
  } else if (amountDiffFcfa <= tolAmount && betAmount > 0) {
    score += 15;
    reasons.push(`Montant proche (±${tolerancePercent} %)`);
  }

  if (phoneMatches) {
    score += 10;
    reasons.push("Même téléphone");
  } else if (tx.created_by && bet.created_by && tx.created_by === bet.created_by) {
    score += 10;
    reasons.push("Même agent");
  }

  return {
    eligible: true,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    timeDiffMinutes,
    amountDiffFcfa,
  };
}

/** Computes matched pairs, ranked suggestions, rejected suggestions, and orphan operations. */
export function computeMatchingAnalysis(
  allTransactions: Transaction[],
  allBets: Bet[],
  options: MatchingOptions = {},
): MatchingAnalysisResult {
  const windowMinutes = Math.max(1, options.windowMinutes ?? 30);
  const tolerancePercent = Math.max(0, options.amountTolerancePercent ?? 5);
  const minScore = options.minScore ?? 0;
  const opFilter = normalizeText(options.operatorFilter);
  const query = options.query?.trim() || "";
  const rejectedIds = options.rejectedIds ?? new Set<string>();

  const txById = new Map<string, Transaction>();
  for (const tx of allTransactions) {
    txById.set(tx.id, tx);
  }

  const linkedTxIds = new Set<string>();
  const linkedBetIds = new Set<string>();
  const matchedPairs: MatchedPair[] = [];
  const orphanLinkedBets: Bet[] = [];

  for (const bet of allBets) {
    const linkedTxId = readLinkedTxId(bet);
    if (!linkedTxId) continue;

    const tx = txById.get(linkedTxId);
    if (!tx) {
      orphanLinkedBets.push(bet);
      continue;
    }

    linkedTxIds.add(tx.id);
    linkedBetIds.add(bet.id);

    const inPeriod =
      withinDateRange(tx.date, options.startDate, options.endDate) ||
      withinDateRange(bet.date, options.startDate, options.endDate);
    if (!inPeriod) continue;

    if (
      opFilter &&
      normalizeText(tx.operator) !== opFilter &&
      normalizeText(bet.operator) !== opFilter
    ) {
      continue;
    }

    if (!matchesSearchQuery(query, tx, bet)) continue;

    const scored = scorePair(tx, bet, windowMinutes, tolerancePercent);
    matchedPairs.push({
      id: `${tx.id}-${bet.id}`,
      tx,
      bet,
      score: scored.eligible ? scored.score : 100,
      reasons: scored.eligible
        ? scored.reasons
        : ["Rapprochement manuel enregistré"],
    });
  }

  const filteredUnmatchedTx = allTransactions.filter((tx) => {
    if (linkedTxIds.has(tx.id)) return false;
    if (!withinDateRange(tx.date, options.startDate, options.endDate)) {
      return false;
    }
    if (opFilter && normalizeText(tx.operator) !== opFilter) return false;
    return true;
  });

  const filteredUnmatchedBets = allBets.filter((bet) => {
    if (linkedBetIds.has(bet.id)) return false;
    if (!withinDateRange(bet.date, options.startDate, options.endDate)) {
      return false;
    }
    if (opFilter && normalizeText(bet.operator) !== opFilter) return false;
    return true;
  });

  const suggestions: MatchingSuggestion[] = [];
  const rejectedSuggestions: MatchingSuggestion[] = [];

  for (const tx of filteredUnmatchedTx) {
    for (const bet of filteredUnmatchedBets) {
      if (!matchesSearchQuery(query, tx, bet)) continue;

      const evaluated = scorePair(tx, bet, windowMinutes, tolerancePercent);
      if (!evaluated.eligible) continue;
      if (evaluated.score < minScore) continue;

      const id = `${tx.id}-${bet.id}`;
      const suggestion: MatchingSuggestion = {
        id,
        score: evaluated.score,
        confidence: getConfidenceLevel(evaluated.score),
        operator: bet.operator || tx.operator,
        reasons: evaluated.reasons,
        timeDiffMinutes: evaluated.timeDiffMinutes,
        amountDiffFcfa: evaluated.amountDiffFcfa,
        tx,
        bet,
      };

      if (rejectedIds.has(id)) {
        rejectedSuggestions.push(suggestion);
      } else {
        suggestions.push(suggestion);
      }
    }
  }

  suggestions.sort(
    (a, b) =>
      b.score - a.score ||
      (a.timeDiffMinutes ?? 999) - (b.timeDiffMinutes ?? 999),
  );
  rejectedSuggestions.sort((a, b) => b.score - a.score);
  matchedPairs.sort((a, b) =>
    normalizeDate(b.tx.date).localeCompare(normalizeDate(a.tx.date)),
  );

  const visibleUnmatchedTx = query
    ? filteredUnmatchedTx.filter((tx) => matchesSearchQuery(query, tx, null))
    : filteredUnmatchedTx;

  const visibleUnmatchedBets = query
    ? filteredUnmatchedBets.filter((bet) => matchesSearchQuery(query, null, bet))
    : filteredUnmatchedBets;

  return {
    suggestions,
    rejectedSuggestions,
    matchedPairs,
    unmatchedTransactions: visibleUnmatchedTx,
    unmatchedBets: visibleUnmatchedBets,
    orphanLinkedBets,
  };
}
