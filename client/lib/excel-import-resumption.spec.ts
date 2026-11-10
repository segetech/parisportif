import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveImportSession,
  getImportSession,
  clearImportSession,
  checkBatchInsertedCount,
  acquireBatchTabLock,
  releaseBatchTabLock,
  reconcileRemainingRows,
  ExcelImportSessionState,
} from "./excel-import-resumption";

class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  get length(): number {
    return Object.keys(this.store).length;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

describe("Excel Import Resumption & Idempotency Suite", () => {
  beforeEach(() => {
    globalThis.localStorage = new LocalStorageMock() as any;
  });

  it("1. doit persister, relire et effacer la session d'import", () => {
    const userId = "agent-import-001";
    const sampleSession: Omit<ExcelImportSessionState, "version" | "userId" | "updatedAt"> = {
      batchId: "batch-uuid-1234",
      step: "preview",
      fileName: "transactions_novembre.xlsx",
      fileSize: "45.2 Ko",
      availableSheets: ["Dépôts & Retraits", "Paris"],
      selectedSheet: "Dépôts & Retraits",
      detectedType: "depotretrait",
      selectedDate: "2026-11-10",
      preventDuplicates: true,
      totalRows: 150,
      validCount: 145,
      errorCount: 5,
      importedCount: 50,
      rejectedCount: 5,
      ignoredCount: 0,
      status: "in_progress",
    };

    saveImportSession(userId, sampleSession);

    const stored = getImportSession(userId);
    expect(stored).not.toBeNull();
    expect(stored?.batchId).toBe("batch-uuid-1234");
    expect(stored?.importedCount).toBe(50);
    expect(stored?.fileName).toBe("transactions_novembre.xlsx");

    clearImportSession(userId);
    expect(getImportSession(userId)).toBeNull();
  });

  it("2. doit réconcilier les lignes restantes sans insérer de doublons", () => {
    const allValidRows = [
      { id: 1, ref: "TX001" },
      { id: 2, ref: "TX002" },
      { id: 3, ref: "TX003" },
      { id: 4, ref: "TX004" },
      { id: 5, ref: "TX005" },
    ];

    // Scénario A : Début de lot (0 déjà inséré)
    const startReconciliation = reconcileRemainingRows(allValidRows, 0);
    expect(startReconciliation.alreadyInserted).toBe(0);
    expect(startReconciliation.remainingRows.length).toBe(5);
    expect(startReconciliation.isAlreadyCompleted).toBe(false);

    // Scénario B : Reprise après interruption (2 lignes déjà en base)
    const midReconciliation = reconcileRemainingRows(allValidRows, 2);
    expect(midReconciliation.alreadyInserted).toBe(2);
    expect(midReconciliation.remainingRows).toEqual([
      { id: 3, ref: "TX003" },
      { id: 4, ref: "TX004" },
      { id: 5, ref: "TX005" },
    ]);
    expect(midReconciliation.isAlreadyCompleted).toBe(false);

    // Scénario C : Reprise alors que TOUTES les lignes ont déjà été écrites (ex: timeout HTTP tardif)
    const completedReconciliation = reconcileRemainingRows(allValidRows, 5);
    expect(completedReconciliation.remainingRows.length).toBe(0);
    expect(completedReconciliation.isAlreadyCompleted).toBe(true);
  });

  it("3. doit interdire l'exécution concurrente dans deux onglets avec le verrou d'exclusion", () => {
    const batchId = "batch-lock-test";
    const tabA = "tab-alpha";
    const tabB = "tab-beta";

    // Tab A prend le verrou
    const lockA = acquireBatchTabLock(batchId, tabA);
    expect(lockA).toBe(true);

    // Tab B tente de prendre le verrou sur le même lot -> Refusé !
    const lockB = acquireBatchTabLock(batchId, tabB);
    expect(lockB).toBe(false);

    // Tab A reprend son propre verrou (renouvellement de heartbeat) -> Accepté
    const lockARenew = acquireBatchTabLock(batchId, tabA);
    expect(lockARenew).toBe(true);

    // Tab A libère le verrou
    releaseBatchTabLock(batchId, tabA);

    // Tab B peut maintenant l'acquérir
    const lockBAcquired = acquireBatchTabLock(batchId, tabB);
    expect(lockBAcquired).toBe(true);
  });

  it("4. doit interroger fidèlement Supabase pour le nombre de lignes écrites pour un lot", async () => {
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 75, error: null }),
        }),
      }),
    };

    const count = await checkBatchInsertedCount(mockSupabase, "transactions", "batch-test-count");
    expect(count).toBe(75);
    expect(mockSupabase.from).toHaveBeenCalledWith("transactions");
  });
});
