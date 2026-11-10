/**
 * Module universel et sécurisé de persistance des brouillons de saisie.
 *
 * Principes stricts de conception :
 * 1. Isolation stricte par identifiant utilisateur (aucun brouillon visible par un tiers).
 * 2. Zéro secret stocké (mots de passe, tokens, secrets, credentials filtrés à 100%).
 * 3. Versioning et TTL de conservation automatique (défaut : 24 heures).
 * 4. Résistance aux environnements de stockage dégradés (quota dépassé, corrompu, indisponible).
 * 5. Détection des conflits si une fiche a été modifiée sur le serveur depuis la sauvegarde locale.
 */

export interface FormDraft<T = Record<string, any>> {
  version: number;
  userId: string;
  entityType: string; // 'bets' | 'transactions' | 'venues' | 'users' | 'excel_import'
  recordId: string; // 'new' ou identifiant UUID de l'enregistrement
  data: T;
  savedAt: number; // Horodatage UNIX ms
  expiresAt: number; // Horodatage d'expiration ms
  serverUpdatedAt?: string | null; // Date serveur au moment de la création du brouillon
}

export const DRAFT_STORAGE_PREFIX = "ps.draft";
export const DEFAULT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

// Liste des champs strictement proscrits de la sauvegarde locale (sécurité & RGPD)
const FORBIDDEN_SECRET_KEYS = new Set([
  "password",
  "mot_de_passe",
  "motdepasse",
  "temporarypassword",
  "confirmpassword",
  "newpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "credentials",
]);

/**
 * Filtre récursivement les données pour exclure tout mot de passe, jeton ou secret
 */
export function stripSensitiveDraftFields<T>(input: T): T {
  if (!input || typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveDraftFields(item)) as unknown as T;
  }

  const cleanObj: Record<string, any> = {};
  for (const [key, val] of Object.entries(input)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_SECRET_KEYS.has(lowerKey)) {
      continue; // Strictement éliminé
    }
    if (val && typeof val === "object" && !(val instanceof Date)) {
      cleanObj[key] = stripSensitiveDraftFields(val);
    } else {
      cleanObj[key] = val;
    }
  }
  return cleanObj as T;
}

/**
 * Construit la clé de stockage déterministe et isolée par utilisateur
 */
export function buildDraftKey(
  userId: string,
  entityType: string,
  recordId: string = "new"
): string {
  const safeUser = (userId || "anonymous").trim();
  const safeEntity = entityType.trim();
  const safeRecord = (recordId || "new").trim();
  return `${DRAFT_STORAGE_PREFIX}.${safeUser}.${safeEntity}.${safeRecord}`;
}

/**
 * Récupère un brouillon valide s'il existe et n'a pas expiré
 */
export function getDraft<T>(
  userId: string,
  entityType: string,
  recordId: string = "new"
): FormDraft<T> | null {
  if (!userId) return null;
  const key = buildDraftKey(userId, entityType, recordId);
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft = JSON.parse(raw) as FormDraft<T>;
    if (!draft || draft.version !== 1 || draft.userId !== userId) {
      localStorage.removeItem(key);
      return null;
    }

    if (Date.now() > draft.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }

    return draft;
  } catch (err) {
    console.warn("Brouillon corrompu, suppression de la clé:", key);
    try {
      localStorage.removeItem(key);
    } catch {}
    return null;
  }
}

/**
 * Sauvegarde un brouillon de manière résiliente
 */
export function saveDraft<T>(
  userId: string,
  entityType: string,
  recordId: string = "new",
  data: T,
  serverUpdatedAt?: string | null,
  ttlMs: number = DEFAULT_DRAFT_TTL_MS
): boolean {
  if (!userId) return false;
  const key = buildDraftKey(userId, entityType, recordId);

  try {
    if (typeof localStorage === "undefined") return false;
    const cleanData = stripSensitiveDraftFields(data);
    const draft: FormDraft<T> = {
      version: 1,
      userId,
      entityType,
      recordId: recordId || "new",
      data: cleanData,
      savedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      serverUpdatedAt: serverUpdatedAt || null,
    };

    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch (err: any) {
    // Si quota dépassé, tenter de purger les vieux brouillons expirés et réessayer
    if (err?.name === "QuotaExceededError" || String(err).includes("quota")) {
      try {
        cleanupExpiredDrafts();
        const cleanData = stripSensitiveDraftFields(data);
        const draft: FormDraft<T> = {
          version: 1,
          userId,
          entityType,
          recordId: recordId || "new",
          data: cleanData,
          savedAt: Date.now(),
          expiresAt: Date.now() + ttlMs,
          serverUpdatedAt: serverUpdatedAt || null,
        };
        localStorage.setItem(key, JSON.stringify(draft));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Supprime un brouillon spécifique
 */
export function deleteDraft(
  userId: string,
  entityType: string,
  recordId: string = "new"
): void {
  if (!userId) return;
  const key = buildDraftKey(userId, entityType, recordId);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * Nettoie tous les brouillons expirés de tout le stockage local
 */
export function cleanupExpiredDrafts(): number {
  let cleaned = 0;
  const now = Date.now();
  try {
    if (typeof localStorage === "undefined") return 0;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_STORAGE_PREFIX)) {
        try {
          const item = localStorage.getItem(k);
          if (item) {
            const parsed = JSON.parse(item);
            if (!parsed.expiresAt || now > parsed.expiresAt) {
              keysToRemove.push(k);
            }
          }
        } catch {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach((k) => {
      localStorage.removeItem(k);
      cleaned++;
    });
  } catch {}
  return cleaned;
}

/**
 * Détecte si un enregistrement existant a changé sur le serveur depuis la sauvegarde du brouillon
 */
export function checkDraftConflict(
  draft: FormDraft<any> | null,
  currentServerDate?: string | null
): boolean {
  if (!draft || !draft.serverUpdatedAt || !currentServerDate) return false;
  const draftServerTime = new Date(draft.serverUpdatedAt).getTime();
  const currentServerTime = new Date(currentServerDate).getTime();
  if (isNaN(draftServerTime) || isNaN(currentServerTime)) return false;
  // Si le serveur a une date plus récente que celle au moment de la création du brouillon
  return currentServerTime > draftServerTime;
}

/**
 * Formate un timestamp relatif en français naturel
 */
export function formatDraftTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 5000) return "à l'instant";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const d = new Date(timestamp);
  return `le ${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}
