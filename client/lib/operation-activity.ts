import { supabase } from "@/lib/supabase";

export type OperationType = "bets" | "transactions" | "venues";
export type CommentDeliveryStatus = "sending" | "sent" | "failed";

export interface OperationCommentItem {
  id: string;
  operation_type: OperationType;
  operation_id: string;
  user_id: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
  client_request_id?: string | null;
  user_name: string;
  user_role?: string;
  deliveryStatus: CommentDeliveryStatus;
  errorMessage?: string;
}

export interface OperationHistoryItem {
  id: string;
  operation_type: OperationType;
  operation_id: string;
  action: string;
  previous_status?: string | null;
  new_status?: string | null;
  modified_by?: string | null;
  modified_at?: string | null;
  created_at?: string | null;
  changes?: Record<string, any> | null;
  comment?: string | null;
  user_name: string;
}

export const DEFAULT_ACTIVITY_PAGE_SIZE = 50;

export function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toTimestamp(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

export function sortCommentsDeterministically(
  items: OperationCommentItem[],
): OperationCommentItem[] {
  return [...items].sort((a, b) => {
    const diff = toTimestamp(a.created_at) - toTimestamp(b.created_at);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

export function sortHistoryDeterministically(
  items: OperationHistoryItem[],
): OperationHistoryItem[] {
  return [...items].sort((a, b) => {
    const diff =
      toTimestamp(b.created_at || b.modified_at) -
      toTimestamp(a.created_at || a.modified_at);
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });
}

export function mergeConfirmedComment(
  prev: OperationCommentItem[],
  confirmed: OperationCommentItem,
): OperationCommentItem[] {
  const withoutMatchingPendingOrDup = prev.filter((item) => {
    if (item.id === confirmed.id) return false;
    if (
      confirmed.client_request_id &&
      item.client_request_id &&
      item.client_request_id === confirmed.client_request_id
    ) {
      return false;
    }
    return true;
  });
  return sortCommentsDeterministically([
    ...withoutMatchingPendingOrDup,
    { ...confirmed, deliveryStatus: "sent", errorMessage: undefined },
  ]);
}

export function mergeFetchedComments(
  prev: OperationCommentItem[],
  fetched: OperationCommentItem[],
  operationType: OperationType,
  operationId: string,
  appendMode = false,
): OperationCommentItem[] {
  const confirmedById = new Map<string, OperationCommentItem>();
  const confirmedClientIds = new Set<string>();

  if (appendMode) {
    for (const item of prev) {
      if (
        item.deliveryStatus === "sent" &&
        item.operation_type === operationType &&
        item.operation_id === operationId
      ) {
        confirmedById.set(item.id, item);
        if (item.client_request_id) confirmedClientIds.add(item.client_request_id);
      }
    }
  }

  for (const item of fetched) {
    confirmedById.set(item.id, { ...item, deliveryStatus: "sent" });
    if (item.client_request_id) confirmedClientIds.add(item.client_request_id);
  }

  const localPendingOrFailed = prev.filter(
    (item) =>
      item.operation_type === operationType &&
      item.operation_id === operationId &&
      item.deliveryStatus !== "sent" &&
      (!item.client_request_id || !confirmedClientIds.has(item.client_request_id)),
  );

  return sortCommentsDeterministically([
    ...Array.from(confirmedById.values()),
    ...localPendingOrFailed,
  ]);
}

export function mapRawCommentRow(
  raw: any,
  fallbackUser?: { nom?: string; prenom?: string; email?: string; role?: string },
): OperationCommentItem {
  const userObj = raw.users;
  const userName = userObj
    ? `${userObj.prenom || ""} ${userObj.nom || ""}`.trim() || "Utilisateur"
    : fallbackUser
      ? `${fallbackUser.prenom || ""} ${fallbackUser.nom || ""}`.trim() ||
        fallbackUser.email ||
        "Vous"
      : "Utilisateur";

  return {
    id: String(raw.id),
    operation_type: raw.operation_type,
    operation_id: String(raw.operation_id),
    user_id: String(raw.user_id || ""),
    comment: String(raw.comment || ""),
    is_internal: Boolean(raw.is_internal),
    created_at: String(raw.created_at || new Date().toISOString()),
    client_request_id: raw.client_request_id ? String(raw.client_request_id) : null,
    user_name: userName,
    user_role: userObj?.role ?? fallbackUser?.role,
    deliveryStatus: "sent",
  };
}

export function mapRawHistoryRow(raw: any): OperationHistoryItem {
  const userObj = raw.users;
  const userName = userObj
    ? `${userObj.prenom || ""} ${userObj.nom || ""}`.trim() || "Système"
    : raw.changes?.source === "service_role"
      ? "Système"
      : "Système";

  return {
    id: String(raw.id),
    operation_type: raw.operation_type,
    operation_id: String(raw.operation_id),
    action: String(raw.action || ""),
    previous_status: raw.previous_status ?? null,
    new_status: raw.new_status ?? null,
    modified_by: raw.modified_by ?? null,
    modified_at: raw.modified_at ?? null,
    created_at: raw.created_at ?? null,
    changes: raw.changes ?? null,
    comment: raw.comment ?? null,
    user_name: userName,
  };
}

export async function fetchOperationCommentsPage(params: {
  operationType: OperationType;
  operationId: string;
  offset?: number;
  limit?: number;
  isAgent?: boolean;
}): Promise<{ items: OperationCommentItem[]; totalCount: number; hasMore: boolean }> {
  const {
    operationType,
    operationId,
    offset = 0,
    limit = DEFAULT_ACTIVITY_PAGE_SIZE,
    isAgent = false,
  } = params;

  const { data, error, count } = await supabase
    .from("operation_comments")
    .select("*, users:user_id (nom, prenom, role)", { count: "exact" })
    .eq("operation_type", operationType)
    .eq("operation_id", operationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const rows = (data || [])
    .filter((c: any) => !(isAgent && c.is_internal))
    .map((c: any) => mapRawCommentRow(c));

  const totalCount = typeof count === "number" ? count : offset + rows.length;
  return {
    items: sortCommentsDeterministically(rows),
    totalCount,
    hasMore: offset + (data?.length || 0) < totalCount,
  };
}

export async function fetchOperationHistoryPage(params: {
  operationType: OperationType;
  operationId: string;
  offset?: number;
  limit?: number;
}): Promise<{ items: OperationHistoryItem[]; totalCount: number; hasMore: boolean }> {
  const {
    operationType,
    operationId,
    offset = 0,
    limit = DEFAULT_ACTIVITY_PAGE_SIZE,
  } = params;

  let { data, error, count } = await supabase
    .from("operation_history")
    .select("*, users:modified_by (nom, prenom)", { count: "exact" })
    .eq("operation_type", operationType)
    .eq("operation_id", operationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    const fallback = await supabase
      .from("operation_history")
      .select("*", { count: "exact" })
      .eq("operation_type", operationType)
      .eq("operation_id", operationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);
    data = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error) throw error;

  const rows = (data || []).map((h: any) => mapRawHistoryRow(h));
  const totalCount = typeof count === "number" ? count : offset + rows.length;
  return {
    items: sortHistoryDeterministically(rows),
    totalCount,
    hasMore: offset + (data?.length || 0) < totalCount,
  };
}

export async function submitOperationCommentRpc(params: {
  operationType: OperationType;
  operationId: string;
  comment: string;
  isInternal?: boolean;
  clientRequestId: string;
  user?: { id: string; nom?: string; prenom?: string; email?: string; role?: string };
}): Promise<OperationCommentItem> {
  const {
    operationType,
    operationId,
    comment,
    isInternal = false,
    clientRequestId,
    user,
  } = params;

  const { data, error } = await supabase.rpc("submit_operation_comment", {
    p_operation_type: operationType,
    p_operation_id: operationId,
    p_comment: comment,
    p_is_internal: isInternal,
    p_client_request_id: clientRequestId,
  });

  if (error) throw error;
  if (!data) {
    throw new Error("Réponse serveur vide lors de l'envoi du commentaire.");
  }

  return mapRawCommentRow(data, user);
}

export const HISTORY_FIELD_LABELS: Record<string, string> = {
  amount_fcfa: "Montant",
  amount_won_fcfa: "Montant retourné",
  bet_type: "Type de test",
  type: "Type d'opération",
  operator: "Opérateur",
  support: "Support",
  platform: "Plateforme",
  payment_operator: "Moyen de paiement",
  status: "Issue du test",
  phone: "Téléphone",
  phone_number: "Téléphone",
  contact_phone: "Téléphone",
  reference: "Référence",
  proof_status: "Disponibilité de la preuve",
  ticket_url: "Pièce justificative",
  proof_attachment_url: "Pièce justificative",
  notes: "Notes / Observations",
  validation_notes: "Motif / Note de décision",
  validation_status: "Statut de validation",
  date: "Date",
  time: "Heure",
  quartier: "Quartier",
  address: "Adresse",
  venue_id: "Site physique",
};

const HISTORY_STATUS_VALUES: Record<string, string> = {
  en_attente: "En attente",
  valide: "Validé",
  refuse: "Refusé",
  "en attente": "En attente",
  gagné: "Issue favorable",
  perdu: "Issue défavorable",
  annulé: "Annulé",
  disponible: "Preuve disponible",
  non_disponible: "Preuve absente",
  non_renseignee: "Non renseignée",
};

export function formatHistoryFieldLabel(key: string): string {
  return HISTORY_FIELD_LABELS[key] || key.replace(/_/g, " ");
}

export function formatHistoryFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  if (key === "amount_fcfa" || key === "amount_won_fcfa") {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return `${num.toLocaleString("fr-FR")} FCFA`;
    }
  }

  if (key === "ticket_url" || key === "proof_attachment_url") {
    return "Pièce jointe";
  }

  if (key === "status" || key === "proof_status" || key === "validation_status") {
    const str = String(value).trim();
    return HISTORY_STATUS_VALUES[str] || str;
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }

  return String(value);
}
