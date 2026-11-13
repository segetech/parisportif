import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Clock, AlertTriangle, Check, Archive, Trash2, Send } from "lucide-react";

const RecordFormReadOnlyContext = createContext(false);

export function useRecordFormReadOnly() {
  return useContext(RecordFormReadOnlyContext);
}

export function RecordConsultationSwitch({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}) {
  const readOnly = useRecordFormReadOnly();
  return <>{readOnly ? summary : children}</>;
}

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
  footerClassName,
  saveLabel,
  unlockedUntil,
  onRequestUnlock,
  unlockRequestSent = false,
  onArchive,
  onHardDelete,
  onTrash,
  onSaveDraft,
  draftButtonLabel = "Enregistrer en brouillon",
  onSubmitDraft,
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
  footerClassName?: string;
  saveLabel?: string;
  unlockedUntil?: string | null;
  onRequestUnlock?: () => Promise<void> | void;
  unlockRequestSent?: boolean;
  onArchive?: (reason?: string) => Promise<void> | void;
  onHardDelete?: () => Promise<void> | void;
  onTrash?: (reason?: string) => Promise<void> | void;
  onSaveDraft?: () => Promise<unknown>;
  draftButtonLabel?: string;
  onSubmitDraft?: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"archive" | "trash" | "hard_delete" | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const lock = useRef(false);
  const readOnly = existing && (!editing || !canEdit);
  const pending = busy || saving || actionBusy;

  async function runDangerAction(kind: "archive" | "trash" | "hard_delete") {
    if (pending || lock.current) return;
    lock.current = true;
    setActionBusy(true);
    try {
      if (kind === "archive" && onArchive) {
        await onArchive(archiveReason.trim() || undefined);
      } else if (kind === "trash" && onTrash) {
        await onTrash(archiveReason.trim() || undefined);
      } else if (kind === "hard_delete" && onHardDelete) {
        await onHardDelete();
      }
      setConfirmAction(null);
      setArchiveReason("");
    } finally {
      lock.current = false;
      setActionBusy(false);
    }
  }

  async function saveWith(fn: () => Promise<unknown>) {
    if (readOnly || (existing && !canEdit) || pending || lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      await fn();
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  async function save() {
    await saveWith(onSave);
  }

  return (
    <form
      className="w-full max-w-full min-w-0 space-y-4 overflow-x-clip"
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
        className={`w-full min-w-0 max-w-full [&>*]:min-w-0 [&_input:disabled]:opacity-100 [&_textarea:disabled]:opacity-100 [&_select:disabled]:opacity-100 ${
          readOnly || pending
            ? "caret-transparent select-none cursor-default [&_input]:caret-transparent [&_textarea]:caret-transparent [&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none"
            : "[&_input:not(:disabled)]:caret-[#17251C] [&_textarea:not(:disabled)]:caret-[#17251C]"
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
        <RecordFormReadOnlyContext.Provider value={readOnly}>
          {children}
        </RecordFormReadOnlyContext.Provider>
      </fieldset>

      <div
        className={`sticky bottom-0 z-20 flex flex-col gap-2 border-t border-slate-200 bg-white pt-3 pb-3 shadow-[0_-4px_12px_rgba(15,23,42,0.05)] ${footerClassName || ""}`}
      >
        {existing && readOnly && confirmAction === "archive" && onArchive && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs">
            <Input
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Motif d'archivage (optionnel)..."
              className="h-8 flex-1 min-w-[180px] bg-white text-xs"
              disabled={pending}
            />
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-white"
                disabled={pending}
                onClick={() => setConfirmAction(null)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs bg-amber-700 hover:bg-amber-800 text-white"
                disabled={pending}
                onClick={() => void runDangerAction("archive")}
              >
                {actionBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Confirmer l&apos;archivage
              </Button>
            </div>
          </div>
        )}

        {existing && readOnly && confirmAction === "trash" && onTrash && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs">
            <Input
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Motif de mise en corbeille (optionnel)..."
              className="h-8 flex-1 min-w-[180px] bg-white text-xs"
              disabled={pending}
            />
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-white"
                disabled={pending}
                onClick={() => setConfirmAction(null)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                disabled={pending}
                onClick={() => void runDangerAction("trash")}
              >
                {actionBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Mettre en corbeille (30 j)
              </Button>
            </div>
          </div>
        )}

        {existing && readOnly && confirmAction === "hard_delete" && onHardDelete && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-900">
            <span className="font-semibold">
              Suppression définitive (irréversible) : confirmer ?
            </span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-white"
                disabled={pending}
                onClick={() => setConfirmAction(null)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                disabled={pending}
                onClick={() => void runDangerAction("hard_delete")}
              >
                {actionBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Oui, supprimer définitivement
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {unlockedUntil && (
            <span className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900">
              <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
              Modification autorisée jusqu&apos;à{" "}
              {new Date(unlockedUntil).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {existing && readOnly && (onArchive || onTrash || onHardDelete) && (
            <div className="mr-auto flex flex-wrap items-center gap-2">
              {onArchive && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 border-amber-200 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                  disabled={pending}
                  onClick={() =>
                    setConfirmAction(confirmAction === "archive" ? null : "archive")
                  }
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archiver
                </Button>
              )}
              {onTrash && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  disabled={pending}
                  onClick={() =>
                    setConfirmAction(confirmAction === "trash" ? null : "trash")
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Corbeille
                </Button>
              )}
              {onHardDelete && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 border-rose-300 text-rose-800 hover:bg-rose-100"
                  disabled={pending}
                  onClick={() =>
                    setConfirmAction(
                      confirmAction === "hard_delete" ? null : "hard_delete",
                    )
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer définitivement
                </Button>
              )}
            </div>
          )}
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
              <div className="flex flex-wrap items-center gap-2">
                {onSubmitDraft && (
                  <Button
                    key="submit-draft"
                    type="button"
                    className="min-h-11 bg-[#006B2D] hover:bg-[#005524] text-white"
                    disabled={pending}
                    onClick={() => void saveWith(async () => onSubmitDraft())}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Envoyer en validation
                  </Button>
                )}
                <Button
                  key="start-editing"
                  type="button"
                  variant={onSubmitDraft ? "outline" : "default"}
                  className="min-h-11"
                  onClick={(event) => {
                    event.preventDefault();
                    setConfirmAction(null);
                    setEditing(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Modifier
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {editBlockedReason && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    {editBlockedReason}
                  </span>
                )}
                {onRequestUnlock && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={unlockRequestSent}
                    onClick={() => void onRequestUnlock()}
                    className="min-h-10 border-[#B8DEC6] bg-[#E8F5EC] text-[#006B2D] hover:bg-[#D8EFE0]"
                  >
                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                    {unlockRequestSent
                      ? "Demande envoyée"
                      : "Demander une prolongation"}
                  </Button>
                )}
              </div>
            )
          ) : !existing && onSaveDraft ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                key="save-draft"
                type="button"
                variant="outline"
                className="min-h-11 border-[#B8DEC6] text-[#006B2D] hover:bg-[#E8F5EC]"
                disabled={pending}
                onClick={() => void saveWith(onSaveDraft)}
              >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {draftButtonLabel}
              </Button>
              <Button
                key="save-record"
                type="submit"
                className="min-h-11"
                disabled={pending}
              >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="mr-2 h-4 w-4" />
                {pending ? "Enregistrement…" : createLabel}
              </Button>
            </div>
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
                  ? saveLabel || "Enregistrer les modifications"
                  : createLabel}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
