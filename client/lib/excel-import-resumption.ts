import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportStep = "upload" | "config" | "preview" | "importing" | "report";
export type TargetEntityType = "depotretrait" | "pari" | "salles";

export interface ExcelImportSessionState {
  version: number;
  userId: string;
  batchId: string;
  step: ImportStep;
  fileName: string;
  fileSize: string;
  availableSheets: string[];
  selectedSheet: string;
  detectedType: TargetEntityType;
  selectedDate: string;
  preventDuplicates: boolean;
  totalRows: number;
  validCount: number;
  errorCount: number;
  importedCount: number;
  rejectedCount: number;
  ignoredCount: number;
  status: "prepared" | "in_progress" | "paused" | "completed" | "failed";
  updatedAt: number;
}

const IMPORT_SESSION_PREFIX = "ps.import_session";
const IMPORT_LOCK_PREFIX = "ps.import_lock";
const LOCK_TTL_MS = 10000; // 10 secondes

/**
 * Récupère la session d'import active d'un utilisateur
 */
export function getImportSession(userId: string): ExcelImportSessionState | null {
  if (!userId || typeof localStorage === "undefined") return null;
  const key = `${IMPORT_SESSION_PREFIX}.${userId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const session = JSON.parse(raw) as ExcelImportSessionState;
    if (!session || session.version !== 1 || session.userId !== userId) {
      localStorage.removeItem(key);
      return null;
    }
    // Si la session a plus de 48 heures, l'expirer
    if (Date.now() - session.updatedAt > 48 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return session;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {}
    return null;
  }
}

/**
 * Sauvegarde la session d'import
 */
export function saveImportSession(
  userId: string,
  state: Omit<ExcelImportSessionState, "version" | "userId" | "updatedAt">
): void {
  if (!userId || typeof localStorage === "undefined") return;
  const key = `${IMPORT_SESSION_PREFIX}.${userId}`;
  try {
    const payload: ExcelImportSessionState = {
      ...state,
      version: 1,
      userId,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn("Impossible de sauvegarder la session d'import:", err);
  }
}

/**
 * Efface la session d'import après un import complété ou abandonné
 */
export function clearImportSession(userId: string): void {
  if (!userId || typeof localStorage === "undefined") return;
  const key = `${IMPORT_SESSION_PREFIX}.${userId}`;
  try {
    localStorage.removeItem(key);
  } catch {}
}

/**
 * Vérifie le nombre de lignes déjà physiquement insérées en base pour un lot
 */
export async function checkBatchInsertedCount(
  client: SupabaseClient,
  targetTable: string,
  batchId: string
): Promise<number> {
  if (!batchId) return 0;
  try {
    const { count, error } = await client
      .from(targetTable)
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batchId);

    if (error) {
      console.warn("Erreur consultation décompte lot import:", error.message);
      return 0;
    }
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Verrou d'exclusion inter-onglets pour empêcher deux onglets de traiter simultanément le même lot
 */
export function acquireBatchTabLock(batchId: string, tabId: string): boolean {
  if (!batchId || typeof localStorage === "undefined") return true;
  const key = `${IMPORT_LOCK_PREFIX}.${batchId}`;
  const now = Date.now();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const lock = JSON.parse(raw);
      if (lock.tabId !== tabId && now - lock.timestamp < LOCK_TTL_MS) {
        return false; // Verrou encore actif dans un autre onglet
      }
    }
    localStorage.setItem(key, JSON.stringify({ tabId, timestamp: now }));
    return true;
  } catch {
    return true;
  }
}

/**
 * Libère le verrou d'un lot
 */
export function releaseBatchTabLock(batchId: string, tabId: string): void {
  if (!batchId || typeof localStorage === "undefined") return;
  const key = `${IMPORT_LOCK_PREFIX}.${batchId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const lock = JSON.parse(raw);
      if (lock.tabId === tabId) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

/**
 * Réconcilie les lignes valides avec les lignes déjà enregistrées en base
 */
export function reconcileRemainingRows<T>(
  allValidRows: T[],
  alreadyInsertedCount: number
): {
  alreadyInserted: number;
  remainingRows: T[];
  isAlreadyCompleted: boolean;
} {
  const safeInserted = Math.max(0, alreadyInsertedCount);
  const remainingRows = allValidRows.slice(safeInserted);
  return {
    alreadyInserted: safeInserted,
    remainingRows,
    isAlreadyCompleted: remainingRows.length === 0 && allValidRows.length > 0,
  };
}
