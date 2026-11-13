import { supabase } from "@/lib/supabase";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { toast } from "sonner";

type OperationKind = "bets" | "transactions" | "venues";

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
