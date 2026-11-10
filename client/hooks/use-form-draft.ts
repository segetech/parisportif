import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getDraft,
  saveDraft,
  deleteDraft,
  checkDraftConflict,
  formatDraftTime,
  FormDraft,
} from "@/lib/drafts";

export interface UseFormDraftOptions<T> {
  entityType: string;
  recordId?: string; // 'new' ou identifiant d'enregistrement
  serverUpdatedAt?: string | null;
  autoSaveDelay?: number; // debounce en ms (défaut: 600)
}

export function useFormDraft<T extends Record<string, any>>(
  formData: T,
  setFormData: React.Dispatch<React.SetStateAction<T>>,
  options: UseFormDraftOptions<T>
) {
  const { user } = useAuth();
  const userId = user?.id || "";
  const {
    entityType,
    recordId = "new",
    serverUpdatedAt,
    autoSaveDelay = 600,
  } = options;

  const [draft, setDraft] = useState<FormDraft<T> | null>(() => {
    return userId ? getDraft<T>(userId, entityType, recordId) : null;
  });
  const [hasConflict, setHasConflict] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<any>(null);

  // Vérification du brouillon lors du montage ou d'un changement de fiche
  useEffect(() => {
    if (!userId) {
      setDraft(null);
      setHasConflict(false);
      return;
    }
    const existing = getDraft<T>(userId, entityType, recordId);
    setDraft(existing);
    if (existing && serverUpdatedAt) {
      setHasConflict(checkDraftConflict(existing, serverUpdatedAt));
    } else {
      setHasConflict(false);
    }
  }, [userId, entityType, recordId, serverUpdatedAt]);

  // Sauvegarde automatique avec anti-rebond (debounced)
  const notifyChange = useCallback(
    (nextData: T) => {
      if (!userId) return;
      setSaveStatus("saving");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        const ok = saveDraft(userId, entityType, recordId, nextData, serverUpdatedAt);
        if (ok) {
          setDraft(getDraft<T>(userId, entityType, recordId));
          setSaveStatus("saved");
        } else {
          setSaveStatus("idle");
        }
      }, autoSaveDelay);
    },
    [userId, entityType, recordId, serverUpdatedAt, autoSaveDelay]
  );

  // Reprendre le brouillon
  const restoreDraft = useCallback(() => {
    if (draft && draft.data) {
      setFormData((prev) => ({ ...prev, ...draft.data }));
      setHasConflict(false);
      return true;
    }
    return false;
  }, [draft, setFormData]);

  // Supprimer / abandonner le brouillon
  const discardDraft = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (userId) {
      deleteDraft(userId, entityType, recordId);
    }
    setDraft(null);
    setHasConflict(false);
    setSaveStatus("idle");
  }, [userId, entityType, recordId]);

  // Nettoyage après soumission réussie
  const clearDraftOnSuccess = useCallback(() => {
    discardDraft();
  }, [discardDraft]);

  // Description temporelle du brouillon
  const savedAtFormatted = draft ? formatDraftTime(draft.savedAt) : "";

  return {
    hasDraft: Boolean(draft),
    draft,
    hasConflict,
    saveStatus,
    savedAtFormatted,
    restoreDraft,
    discardDraft,
    clearDraftOnSuccess,
    notifyChange,
  };
}
