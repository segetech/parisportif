import { supabase } from "@/lib/supabase";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import type { Permission } from "@/lib/rbac";
import type { Role } from "@/data/api";
import { toast } from "sonner";

type OperationKind = "bets" | "transactions" | "venues";

/** Détermine si l'utilisateur peut mettre un enregistrement à la corbeille selon les permissions RBAC. */
export function canUserTrashRecord(
  user: { id?: string; role?: string } | null | undefined,
  rolePerms: Record<Role, Permission[]> | undefined,
  record: { validation_status?: string; created_by?: string | null } | null | undefined,
): boolean {
  if (!user || !record) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "CONTROLEUR") {
    return rolePerms ? Boolean(rolePerms.CONTROLEUR?.includes("delete_records")) : true;
  }
  if (user.role === "AGENT") {
    return (
      record.validation_status === "brouillon" &&
      record.created_by === user.id
    );
  }
  return false;
}

/** Archive réversible d'une opération avec journalisation SQL et invalidation du cache. */
export async function archiveOperationRecord(
  operationType: OperationKind,
  operationId: string,
  reason?: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("archive_operation", {
      p_operation_type: operationType,
      p_operation_id: operationId,
      p_reason: reason?.trim() || null,
    });
    if (error) throw error;
    invalidateRelatedQueries(operationType);
    toast.success("Opération archivée (restaurable depuis Validation → Archivées)");
    return true;
  } catch (err: any) {
    toast.error(err?.message || "Impossible d'archiver l'opération");
    return false;
  }
}

/** Suppression définitive d'une opération (réservée à l'administrateur). */
export async function hardDeleteOperationRecord(
  operationType: OperationKind,
  operationId: string,
  reason?: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("hard_delete_operation", {
      p_operation_type: operationType,
      p_operation_id: operationId,
      p_reason: reason?.trim() || null,
    });
    if (error) throw error;
    invalidateRelatedQueries(operationType);
    toast.success("Opération supprimée définitivement");
    return true;
  } catch (err: any) {
    toast.error(err?.message || "Impossible de supprimer définitivement");
    return false;
  }
}

/** Mise en corbeille (conservation 30 jours avant purge automatique). */
export async function trashOperationRecord(
  operationType: OperationKind,
  operationId: string,
  reason?: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("trash_operation", {
      p_operation_type: operationType,
      p_operation_id: operationId,
      p_reason: reason?.trim() || null,
    });
    if (error) throw error;
    invalidateRelatedQueries(operationType);
    toast.success("Déplacé dans la corbeille (conservé 30 jours)");
    return true;
  } catch (err: any) {
    toast.error(err?.message || "Impossible de mettre en corbeille");
    return false;
  }
}

/** Restauration depuis la corbeille. */
export async function restoreFromTrashRecord(
  operationType: OperationKind,
  operationId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("restore_from_trash", {
      p_operation_type: operationType,
      p_operation_id: operationId,
    });
    if (error) throw error;
    invalidateRelatedQueries(operationType);
    toast.success("Opération restaurée depuis la corbeille");
    return true;
  } catch (err: any) {
    toast.error(err?.message || "Impossible de restaurer l'opération");
    return false;
  }
}

/** Envoi unitaire ou groupé de brouillons vers la validation. */
export async function submitDraftOperationsRecord(
  operationType: OperationKind,
  operationIds: string[],
): Promise<number> {
  if (operationIds.length === 0) return 0;
  try {
    const { data, error } = await supabase.rpc("submit_draft_operations", {
      p_operation_type: operationType,
      p_operation_ids: operationIds,
    });
    if (error) throw error;
    invalidateRelatedQueries(operationType);
    const count = Number(data ?? operationIds.length);
    toast.success(
      count > 1
        ? `${count} brouillons envoyés pour validation`
        : "Brouillon envoyé pour validation",
    );
    return count;
  } catch (err: any) {
    toast.error(err?.message || "Impossible d'envoyer les brouillons");
    return 0;
  }
}
