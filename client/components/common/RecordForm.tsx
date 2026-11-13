import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Clock, AlertTriangle, Check } from "lucide-react";

/** Shared explicit consultation/editing flow for existing record dialogs with draft protection. */
export function RecordForm({
  existing,
  children,
  onSave,
  onClose,
  onRestore,
  createLabel = "Créer",
  busy = false,
  hasDraft = false,
  draftTime,
  hasConflict = false,
  onRestoreDraft,
  onDiscardDraft,
  draftSaveStatus = "idle",
  canEdit = true,
  editBlockedReason,
}: {
  existing: boolean;
  children: ReactNode;
  onSave: () => Promise<unknown>;
  onClose: () => void;
  onRestore: () => void;
  createLabel?: string;
  busy?: boolean;
  hasDraft?: boolean;
  draftTime?: string;
  hasConflict?: boolean;
  onRestoreDraft?: () => void;
  onDiscardDraft?: () => void;
  draftSaveStatus?: "idle" | "saving" | "saved";
  canEdit?: boolean;
  editBlockedReason?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const readOnly = existing && (!editing || !canEdit);
  const pending = busy || saving;

  async function save() {
    if (readOnly || (existing && !canEdit) || pending || lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      await onSave();
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      className="min-w-0 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {/* Alerte Conflit de version */}
      {hasConflict && (
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-2.5 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Conflit de version détecté</p>
            <p className="text-amber-800 mt-0.5">
              Cette fiche a été modifiée sur le serveur depuis la sauvegarde de votre brouillon local. Vérifiez attentivement les données avant d'écraser.
            </p>
          </div>
        </div>
      )}

      {/* Bannière de reprise de brouillon non enregistré */}
      {hasDraft && onRestoreDraft && (
        <div className="p-3 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-[#17251C]">
            <Clock className="h-4 w-4 text-[#006B2D] shrink-0" />
            <span>
              Brouillon non enregistré disponible {draftTime ? `(${draftTime})` : ""}.
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRestoreDraft}
              className="h-8 px-2.5 text-xs bg-white text-[#006B2D] border-[#C2DEC9] hover:bg-emerald-50"
            >
              Reprendre le brouillon
            </Button>
            {onDiscardDraft && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onDiscardDraft}
                className="h-8 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                Supprimer
              </Button>
            )}
          </div>
        </div>
      )}

      {existing && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <p role="status">
            {readOnly
              ? "Consultation : cliquez sur Modifier pour changer ces informations."
              : "Modification en cours. Enregistrez ou annulez vos changements."}
          </p>
          {draftSaveStatus !== "idle" && (
            <span className="text-[11px] text-[#556B5C] flex items-center gap-1 shrink-0">
              {draftSaveStatus === "saving" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
                  <span>Mémorisation…</span>
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 text-[#006B2D]" />
                  <span>Brouillon sauvegardé</span>
                </>
              )}
            </span>
          )}
        </div>
      )}

      <fieldset
        key={readOnly ? "consultation" : "editing"}
        disabled={readOnly || pending}
        className={`min-w-0 [&_input:disabled]:opacity-100 [&_textarea:disabled]:opacity-100 [&_select:disabled]:opacity-100 ${
          readOnly || pending
            ? "caret-transparent select-none cursor-default [&_input]:caret-transparent [&_textarea]:caret-transparent [&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none"
            : ""
        }`}
        onClickCapture={(event) => {
          if (readOnly || pending) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyDownCapture={(event) => {
          if (readOnly || pending) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={() => {
            if (existing && editing) {
              onRestore();
              setEditing(false);
            } else onClose();
          }}
        >
          {existing && editing
            ? "Annuler les modifications"
            : readOnly
              ? "Fermer"
              : "Annuler"}
        </Button>
        {readOnly ? (
          canEdit ? (
            <Button
              key="start-editing"
              type="button"
              className="min-h-11"
              onClick={(event) => {
                event.preventDefault();
                setEditing(true);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Modifier
            </Button>
          ) : (
            editBlockedReason && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                {editBlockedReason}
              </span>
            )
          )
        ) : (
          <Button
            key="save-record"
            type="submit"
            className="min-h-11"
            disabled={pending}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pending
              ? "Enregistrement…"
              : existing
                ? "Enregistrer les modifications"
                : createLabel}
          </Button>
        )}
      </div>
    </form>
  );
}
