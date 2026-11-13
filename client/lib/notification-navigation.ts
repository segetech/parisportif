import { supabase } from "@/lib/supabase";

export type NotificationCategory =
  | "action_required"
  | "decision"
  | "alert"
  | "system";

export interface NotificationRouteTarget {
  path: string;
  label: string;
  category: NotificationCategory;
}

export interface NavigableNotification {
  type: string;
  operation_type: string | null;
  operation_id: string | null;
  reference?: string | null;
}

export function resolveNotificationTarget(
  notification: NavigableNotification,
  userRole?: string | null,
): NotificationRouteTarget {
  const isReviewer = userRole === "ADMIN" || userRole === "CONTROLEUR";
  const opType = (notification.operation_type || "").toLowerCase();
  const notifType = (notification.type || "").toLowerCase();
  const opId = notification.operation_id;
  const ref = notification.reference;

  const statusParam =
    notifType === "validated"
      ? "valide"
      : notifType === "rejected"
        ? "refuse"
        : "en_attente";

  const category: NotificationCategory =
    opType.includes("illegal") || notifType === "illegal_alert"
      ? "alert"
      : notifType === "new_operation"
        ? "action_required"
        : notifType === "validated" ||
            notifType === "rejected" ||
            notifType === "modified"
          ? "decision"
          : "system";

  if (
    opType === "illegal" ||
    opType === "illegal_bets" ||
    opType === "illegal_tx" ||
    opType === "illegal_transactions" ||
    notifType === "illegal_alert"
  ) {
    const tab =
      opType.includes("tx") || opType.includes("transaction")
        ? "transactions"
        : "bets";
    const idParam = opId ? `&id=${encodeURIComponent(opId)}` : "";
    return {
      path: `/illegal?tab=${tab}${idParam}`,
      label: "Activités Illégales",
      category: "alert",
    };
  }

  if (opType === "bets") {
    if (isReviewer) {
      const idParam = opId ? `&id=${encodeURIComponent(opId)}` : "";
      return {
        path: `/validation?tab=bets&status=${statusParam}${idParam}`,
        label:
          statusParam === "valide"
            ? "Validation • Tests validés"
            : statusParam === "refuse"
              ? "Validation • Tests refusés"
              : "Validation • Tests",
        category,
      };
    }
    return {
      path: `/tests${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
      label: "Tests de paris",
      category,
    };
  }

  if (opType === "transactions") {
    if (isReviewer) {
      const idParam = opId ? `&id=${encodeURIComponent(opId)}` : "";
      return {
        path: `/validation?tab=transactions&status=${statusParam}${idParam}`,
        label:
          statusParam === "valide"
            ? "Validation • Transactions validées"
            : statusParam === "refuse"
              ? "Validation • Transactions refusées"
              : "Validation • Transactions",
        category,
      };
    }
    return {
      path: `/transactions${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
      label: "Dépôts & Retraits",
      category,
    };
  }

  if (opType === "venues") {
    if (isReviewer && notifType === "new_operation") {
      const idParam = opId ? `&id=${encodeURIComponent(opId)}` : "";
      return {
        path: `/validation?tab=venues&status=en_attente${idParam}`,
        label: "Validation • Sites",
        category: "action_required",
      };
    }
    return {
      path: "/venues",
      label: "Sites de test",
      category,
    };
  }

  if (opType === "matching") {
    return {
      path: "/matching",
      label: "Rapprochement",
      category: "system",
    };
  }

  if (opType === "users") {
    return {
      path: "/users-management",
      label: "Utilisateurs",
      category: "system",
    };
  }

  if (opType === "profil" || opType === "security") {
    return {
      path: "/profil",
      label: "Mon Profil",
      category: "system",
    };
  }

  if (opType === "audit") {
    return {
      path: "/journal",
      label: "Journal d'audit",
      category: "system",
    };
  }

  if (notifType === "new_operation") {
    return {
      path: isReviewer ? "/validation" : "/",
      label: isReviewer ? "Centre de validation" : "Tableau de bord",
      category: "action_required",
    };
  }

  return {
    path: "/",
    label: "Tableau de bord",
    category: "system",
  };
}

export interface DispatchNotificationRequest {
  eventType: "operation_created" | "operation_reviewed" | "illegal_reported";
  operationType:
    | "bets"
    | "transactions"
    | "venues"
    | "illegal_bets"
    | "illegal_tx";
  operationId?: string;
  status?: "valide" | "refuse" | "modify" | "comment" | "en_attente";
  operator?: string;
  amountFcfa?: number;
  reference?: string;
  notes?: string;
  authorId?: string;
}

export async function dispatchAppNotification(
  payload: DispatchNotificationRequest,
): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    await fetch("/api/notifications/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[Notification] Dispatch non-blocking error:", err);
  }
}

export interface TestEmailResponse {
  success: boolean;
  inAppCreated?: boolean;
  emailSent?: boolean;
  emailResult?: {
    messageId: string | null;
    provider: string;
    to: string;
    restricted?: boolean;
    error?: string;
  };
  error?: string;
}

export async function sendTestNotificationEmail(
  targetEmail?: string,
): Promise<TestEmailResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { success: false, error: "Session expirée" };
  }

  const res = await fetch("/api/notifications/test-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(targetEmail ? { email: targetEmail } : {}),
  });

  const data = (await res.json().catch(() => ({}))) as TestEmailResponse;
  if (!res.ok) {
    return {
      success: false,
      error: data.error || `Erreur HTTP ${res.status}`,
    };
  }
  return data;
}
