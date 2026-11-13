import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Trash2, CheckSquare, Square, FileEdit } from "lucide-react";
import {
  submitDraftOperationsRecord,
  trashOperationRecord,
} from "@/lib/operation-archive";

type OperationKind = "bets" | "transactions" | "venues";

/**
 * Barre de filtrage "Brouillons" + actions groupées (envoi en validation ou mise en corbeille).
 * Réutilisée sur Tests, Transactions et Salles.
 */
export function DraftBatchToolbar({
  operationType,
  draftCount,
  showDraftsOnly,
  onToggleDraftsOnly,
  selectedIds,
  allDraftIds,
  onSelectAllDrafts,
  onClearSelection,
}: {
  operationType: OperationKind;
  draftCount: number;
  showDraftsOnly: boolean;
  onToggleDraftsOnly: () => void;
  selectedIds: string[];
  allDraftIds: string[];
  onSelectAllDrafts: () => void;
  onClearSelection: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (draftCount === 0 && !showDraftsOnly && selectedIds.length === 0) {
    return null;
  }

  async function handleBatchSubmit() {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    try {
      const submitted = await submitDraftOperationsRecord(
        operationType,
        selectedIds,
      );
      if (submitted > 0) {
        onClearSelection();
        if (showDraftsOnly && submitted >= draftCount) {
          onToggleDraftsOnly();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchTrash() {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    try {
      for (const id of selectedIds) {
        await trashOperationRecord(
          operationType,
          id,
          "Suppression groupée de brouillons",
        );
      }
      onClearSelection();
    } finally {
      setBusy(false);
    }
  }

  const allSelected =
    allDraftIds.length > 0 && selectedIds.length === allDraftIds.length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] px-3.5 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={showDraftsOnly ? "default" : "outline"}
          onClick={onToggleDraftsOnly}
          className={
            showDraftsOnly
              ? "h-8 gap-1.5 bg-[#006B2D] hover:bg-[#005524] text-white"
              : "h-8 gap-1.5 bg-white border-[#B8DEC6] text-[#17251C] hover:bg-[#E8F5EC]"
          }
        >
          <FileEdit className="h-3.5 w-3.5" />
          Brouillons non envoyés
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-[11px] font-mono bg-amber-100 text-amber-900"
          >
            {draftCount}
          </Badge>
        </Button>

        {allDraftIds.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={allSelected ? onClearSelection : onSelectAllDrafts}
            className="h-8 gap-1.5 text-[#17251C] hover:bg-white"
          >
            {allSelected ? (
              <CheckSquare className="h-3.5 w-3.5 text-[#006B2D]" />
            ) : (
              <Square className="h-3.5 w-3.5 text-[#556B5C]" />
            )}
            {allSelected
              ? "Tout désélectionner"
              : `Tout sélectionner (${allDraftIds.length})`}
          </Button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[#17251C]">
            {selectedIds.length} sélectionné(s)
          </span>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void handleBatchSubmit()}
            className="h-8 gap-1.5 bg-[#006B2D] hover:bg-[#005524] text-white"
          >
            <Send className="h-3.5 w-3.5" />
            Envoyer en validation ({selectedIds.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleBatchTrash()}
            className="h-8 gap-1.5 bg-white border-rose-200 text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Corbeille
          </Button>
        </div>
      )}
    </div>
  );
}
