import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Bet, Transaction } from "@/data/api";
import {
  readLinkedTxId,
  cleanMatchingNotes,
  writeLinkedTxId,
  removeLinkedTxId,
  canModifyBetMatch,
  loadRejectedPairs,
  saveRejectedPairs,
  getConfidenceLevel,
  computeMatchingAnalysis,
} from "./matching";

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    date: "2026-03-10",
    time: "14:00:00",
    operator: "1xBet",
    platform: "Web",
    payment_operator: "Orange Money",
    type: "Dépôt",
    amount_fcfa: 5000,
    phone: "77001122",
    reference: "TX-REF-001",
    proof: true,
    notes: "",
    validation_status: "en_attente",
    created_by: "user-1",
    created_at: "2026-03-10T14:00:00Z",
    ...overrides,
  };
}

function makeBet(overrides: Partial<Bet> = {}): Bet {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    date: "2026-03-10",
    time: "14:05:00",
    operator: "1xBet",
    support: "Web",
    bet_type: "Sport",
    amount_fcfa: 5000,
    status: "gagné",
    amount_won_fcfa: 8000,
    reference: "TX-REF-001",
    notes: "",
    validation_status: "en_attente",
    created_by: "user-1",
    created_at: "2026-03-10T14:05:00Z",
    ...overrides,
  };
}

describe("matching tag helpers", () => {
  it("reads linked_tx_id or [RAPPROCHÉ:<uuid>] marker from notes", () => {
    expect(readLinkedTxId(null)).toBeNull();
    expect(readLinkedTxId({ linked_tx_id: "tx-direct", notes: "" })).toBe(
      "tx-direct",
    );
    expect(
      readLinkedTxId({
        notes:
          "Observation | [RAPPROCHÉ:11111111-1111-1111-1111-111111111111]",
      }),
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("writes, cleans, and removes [RAPPROCHÉ:<uuid>] without losing user notes", () => {
    const id1 = "11111111-1111-1111-1111-111111111111";
    const id2 = "33333333-3333-3333-3333-333333333333";

    const written = writeLinkedTxId("Pari vérifié sur place", id1);
    expect(written).toBe(`Pari vérifié sur place | [RAPPROCHÉ:${id1}]`);
    expect(cleanMatchingNotes(written)).toBe("Pari vérifié sur place");

    const replaced = writeLinkedTxId(written, id2);
    expect(replaced).toBe(`Pari vérifié sur place | [RAPPROCHÉ:${id2}]`);
    expect(readLinkedTxId({ notes: replaced })).toBe(id2);

    expect(removeLinkedTxId(replaced)).toBe("Pari vérifié sur place");
    expect(removeLinkedTxId(`[RAPPROCHÉ:${id1}]`)).toBeNull();
  });
});

describe("canModifyBetMatch", () => {
  it("matches Supabase RLS permissions for ADMIN, CONTROLEUR, and AGENT", () => {
    expect(canModifyBetMatch("ADMIN", "valide")).toBe(true);
    expect(canModifyBetMatch("ADMIN", "refuse")).toBe(true);
    expect(canModifyBetMatch("CONTROLEUR", "en_attente")).toBe(true);
    expect(canModifyBetMatch("CONTROLEUR", null)).toBe(true);
    expect(canModifyBetMatch("CONTROLEUR", "valide")).toBe(false);
    expect(canModifyBetMatch("CONTROLEUR", "refuse")).toBe(false);
    expect(canModifyBetMatch("AGENT", "en_attente")).toBe(false);
  });
});

describe("rejected suggestions persistence", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const store = new Map<string, string>();
    const storageMock = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: storageMock },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  });

  it("saves and reloads rejected suggestion keys per user", () => {
    const rejected = new Set(["tx1-bet1", "tx2-bet2"]);
    saveRejectedPairs("user-42", rejected);
    const loaded = loadRejectedPairs("user-42");
    expect(Array.from(loaded)).toEqual(["tx1-bet1", "tx2-bet2"]);
    expect(loadRejectedPairs("other-user").size).toBe(0);
  });
});

describe("getConfidenceLevel", () => {
  it("classifies high, medium, and low scores", () => {
    expect(getConfidenceLevel(90)).toBe("high");
    expect(getConfidenceLevel(85)).toBe("high");
    expect(getConfidenceLevel(75)).toBe("medium");
    expect(getConfidenceLevel(60)).toBe("medium");
    expect(getConfidenceLevel(59)).toBe("low");
  });
});

describe("computeMatchingAnalysis", () => {
  it("requires identical date and normalized operator, rejecting same-time mismatches across days", () => {
    const txSameDay = makeTx({
      id: "aaaa1111-1111-1111-1111-111111111111",
      date: "2026-03-10",
      time: "14:00:00",
      operator: "1XBET",
      amount_fcfa: 5000,
      reference: "REF-100",
    });
    const txOtherDay = makeTx({
      id: "aaaa2222-2222-2222-2222-222222222222",
      date: "2026-03-11",
      time: "14:00:00",
      operator: "1xBet",
      amount_fcfa: 5000,
      reference: "REF-100",
    });
    const bet = makeBet({
      id: "bbbb1111-1111-1111-1111-111111111111",
      date: "2026-03-10",
      time: "14:05:00",
      operator: "1xBet",
      amount_fcfa: 5000,
      reference: "REF-100",
    });

    const result = computeMatchingAnalysis([txSameDay, txOtherDay], [bet], {
      minScore: 60,
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].tx.id).toBe(txSameDay.id);
    expect(result.suggestions[0].bet.id).toBe(bet.id);
    expect(result.suggestions[0].score).toBeGreaterThanOrEqual(85);
  });

  it("safely handles null/undefined reference, time, and notes fields", () => {
    const tx = makeTx({
      id: "aaaa3333-3333-3333-3333-333333333333",
      reference: undefined,
      time: undefined as unknown as string,
      notes: undefined,
      phone: undefined,
    });
    const bet = makeBet({
      id: "bbbb3333-3333-3333-3333-333333333333",
      reference: null,
      time: null as unknown as string,
      notes: null as unknown as string,
    });

    const result = computeMatchingAnalysis([tx], [bet], {
      minScore: 50,
    });

    expect(result.unmatchedTransactions).toHaveLength(1);
    expect(result.unmatchedBets).toHaveLength(1);
  });

  it("separates matched pairs from unmatched pools and preserves rejected items", () => {
    const linkedTx = makeTx({
      id: "aaaa4444-4444-4444-4444-444444444444",
      reference: "LINKED-1",
    });
    const linkedBet = makeBet({
      id: "bbbb4444-4444-4444-4444-444444444444",
      notes: `Validé | [RAPPROCHÉ:${linkedTx.id}]`,
    });

    const freeTx = makeTx({
      id: "aaaa5555-5555-5555-5555-555555555555",
      reference: "FREE-1",
      time: "16:00:00",
    });
    const freeBet = makeBet({
      id: "bbbb5555-5555-5555-5555-555555555555",
      reference: "FREE-1",
      time: "16:02:00",
    });

    const rejectedKey = `${freeTx.id}-${freeBet.id}`;
    const result = computeMatchingAnalysis(
      [linkedTx, freeTx],
      [linkedBet, freeBet],
      {
        rejectedIds: new Set([rejectedKey]),
      },
    );

    expect(result.matchedPairs).toHaveLength(1);
    expect(result.matchedPairs[0].tx.id).toBe(linkedTx.id);
    expect(result.matchedPairs[0].bet.id).toBe(linkedBet.id);
    expect(result.suggestions).toHaveLength(0);
    expect(result.rejectedSuggestions).toHaveLength(1);
    expect(result.unmatchedTransactions.map((t) => t.id)).toEqual([freeTx.id]);
    expect(result.unmatchedBets.map((b) => b.id)).toEqual([freeBet.id]);
  });

  it("matches pairs by shared reference even when timestamps exceed the time window", () => {
    const tx = makeTx({
      id: "aaaa6666-6666-6666-6666-666666666666",
      date: "2026-03-10",
      time: "09:00:00",
      operator: "1xBet",
      amount_fcfa: 5000,
      reference: "OM-789456",
      phone: "70000001",
      created_by: "agent-a",
    });
    const bet = makeBet({
      id: "bbbb6666-6666-6666-6666-666666666666",
      date: "2026-03-10",
      time: "18:30:00",
      operator: "1xBet",
      amount_fcfa: 12000,
      reference: "OM-789456",
      created_by: "agent-b",
    });

    const result = computeMatchingAnalysis([tx], [bet], {
      windowMinutes: 30,
      minScore: 70,
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].reasons).toContain("Même référence");
    expect(result.suggestions[0].score).toBe(75);
  });
});
