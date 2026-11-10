import { describe, it, expect, beforeEach } from "vitest";
import {
  saveDraft,
  getDraft,
  deleteDraft,
  cleanupExpiredDrafts,
  checkDraftConflict,
  stripSensitiveDraftFields,
  buildDraftKey,
} from "./drafts";

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

describe("Form Drafts & Unsaved Data Protection Suite", () => {
  beforeEach(() => {
    globalThis.localStorage = new LocalStorageMock() as any;
  });

  it("1. doit isoler strictement les brouillons par utilisateur", () => {
    const userA = "user-alice-111";
    const userB = "user-bob-222";

    saveDraft(userA, "bets", "new", { amount: 5000, operator: "Betclic" });
    saveDraft(userB, "bets", "new", { amount: 12000, operator: "1xBet" });

    const draftA = getDraft(userA, "bets", "new");
    const draftB = getDraft(userB, "bets", "new");

    expect(draftA?.data).toEqual({ amount: 5000, operator: "Betclic" });
    expect(draftB?.data).toEqual({ amount: 12000, operator: "1xBet" });

    // User A ne doit jamais voir le brouillon de User B
    const draftLeak = getDraft(userA, "bets", "non_existent");
    expect(draftLeak).toBeNull();
  });

  it("2. doit proscrire et filtrer systématiquement tout mot de passe, jeton ou secret", () => {
    const dirtyData = {
      nom: "Diallo",
      email: "diallo@example.com",
      password: "SuperSecretPassword123!",
      temporaryPassword: "tempPassword!",
      token: "jwt.token.here",
      confirmPassword: "SuperSecretPassword123!",
      nested: {
        role: "AGENT",
        accessToken: "secret-bearer-token",
        notes: "Notes publiques",
      },
    };

    const clean = stripSensitiveDraftFields(dirtyData);

    expect(clean).toEqual({
      nom: "Diallo",
      email: "diallo@example.com",
      nested: {
        role: "AGENT",
        notes: "Notes publiques",
      },
    });

    saveDraft("user-test", "users", "new", dirtyData);
    const stored = getDraft("user-test", "users", "new");

    expect((stored?.data as any).password).toBeUndefined();
    expect((stored?.data as any).temporaryPassword).toBeUndefined();
    expect((stored?.data as any).token).toBeUndefined();
    expect((stored?.data as any).nested.accessToken).toBeUndefined();
  });

  it("3. doit respecter la durée de conservation (TTL) et purger les brouillons expirés", () => {
    const userId = "user-expire-test";
    // Sauvegarder un brouillon avec TTL de -10ms (déjà expiré)
    saveDraft(userId, "transactions", "tx-1", { amount: 1000 }, null, -10);

    const expired = getDraft(userId, "transactions", "tx-1");
    expect(expired).toBeNull();

    // Vérifier la fonction globale cleanupExpiredDrafts
    saveDraft(userId, "bets", "bet-1", { amount: 2000 }, null, -50);
    saveDraft(userId, "bets", "bet-2", { amount: 4000 }, null, 60000); // Valide

    const cleanedCount = cleanupExpiredDrafts();
    expect(cleanedCount).toBeGreaterThanOrEqual(1);

    expect(getDraft(userId, "bets", "bet-1")).toBeNull();
    expect(getDraft(userId, "bets", "bet-2")?.data).toEqual({ amount: 4000 });
  });

  it("4. doit détecter un conflit de version si la fiche a changé sur le serveur", () => {
    const userId = "user-conflict-test";
    const initialServerDate = "2026-11-10T10:00:00.000Z";

    saveDraft(userId, "venues", "venue-123", { name: "Salle Bamako" }, initialServerDate);
    const draft = getDraft(userId, "venues", "venue-123");

    // Scénario A : Le serveur a toujours la même date -> pas de conflit
    expect(checkDraftConflict(draft, initialServerDate)).toBe(false);

    // Scénario B : Un autre contrôleur a mis à jour la fiche sur le serveur à 11:30 -> Conflit !
    const newerServerDate = "2026-11-10T11:30:00.000Z";
    expect(checkDraftConflict(draft, newerServerDate)).toBe(true);

    // Scénario C : Date serveur indéfinie -> pas de conflit bloquant
    expect(checkDraftConflict(draft, null)).toBe(false);
  });

  it("5. doit être résilient face à un JSON corrompu en localStorage", () => {
    const userId = "user-corrupt-test";
    const key = buildDraftKey(userId, "transactions", "new");
    localStorage.setItem(key, "invalid-json{{{[broken");

    // getDraft ne doit pas lever d'exception et doit nettoyer la clé corrompue
    const draft = getDraft(userId, "transactions", "new");
    expect(draft).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("6. doit supprimer un brouillon explicitement lors de l'annulation ou après succès", () => {
    const userId = "user-delete-test";
    saveDraft(userId, "bets", "bet-del", { amount: 1500 });
    expect(getDraft(userId, "bets", "bet-del")).not.toBeNull();

    deleteDraft(userId, "bets", "bet-del");
    expect(getDraft(userId, "bets", "bet-del")).toBeNull();
  });
});
