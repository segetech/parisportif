import { PERMISSION_LABELS, type Permission } from "@/lib/rbac";

export const AUDIT_TABLE_LABELS: Record<string, string> = {
  bets: "Test de pari",
  transactions: "Dépôt / Retrait",
  venues: "Salle de jeu",
  users: "Utilisateur",
  role_permissions: "Permissions de rôle",
  illegal_bets: "Pari illégal",
  illegal_transactions: "Transaction illégale",
};

export const AUDIT_OP_LABELS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};

export const AUDIT_STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  en_attente: "En attente",
  valide: "Validé",
  refuse: "Refusé",
  actif: "Actif",
  inactif: "Inactif",
  suspendu: "Suspendu",
  deleted: "Supprimé",
};

export const AUDIT_KEY_LABELS: Record<string, string> = {
  op: "Type d'action",
  table: "Élément concerné",
  old_status: "Ancien statut",
  new_status: "Nouveau statut",
  status: "Statut",
  validated_by: "Traité par",
  archived_by: "Archivé par",
  deleted_by: "Supprimé par",
  motif: "Motif",
  reason: "Motif",
  role: "Rôle",
  email: "Email",
  statut: "Statut du compte",
};

export function formatAuditStatus(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  return AUDIT_STATUS_LABELS[raw] || raw;
}

export function formatAuditValue(
  key: string,
  value: unknown,
  userNameById: Record<string, string> = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  const str = String(value);
  if (key === "table") return AUDIT_TABLE_LABELS[str] || str;
  if (key === "op") return AUDIT_OP_LABELS[str.toUpperCase()] || str;
  if (
    key === "old_status" ||
    key === "new_status" ||
    key === "status" ||
    key === "statut"
  ) {
    return formatAuditStatus(str);
  }
  if (
    key === "validated_by" ||
    key === "archived_by" ||
    key === "deleted_by" ||
    key === "user_id"
  ) {
    return userNameById[str] || "Système / Admin";
  }
  return str;
}

export function formatAuditTriggerLines(
  d: any,
  userNameById: Record<string, string> = {},
): string[] {
  const lines: string[] = [];
  const tableLabel = d.table ? AUDIT_TABLE_LABELS[d.table] || d.table : "";
  const opLabel = d.op ? AUDIT_OP_LABELS[String(d.op).toUpperCase()] || d.op : "";

  if (opLabel || tableLabel) {
    lines.push([opLabel, tableLabel].filter(Boolean).join(" — "));
  }

  if (d.old_status !== undefined && d.new_status !== undefined) {
    const fromLabel = formatAuditStatus(d.old_status);
    const toLabel = formatAuditStatus(d.new_status);
    if (d.old_status === d.new_status) {
      lines.push(`Statut inchangé : ${toLabel}`);
    } else {
      lines.push(`Statut : ${fromLabel} → ${toLabel}`);
    }
  } else if (d.status !== undefined) {
    lines.push(`Statut : ${formatAuditStatus(d.status)}`);
  }

  if (d.validated_by) {
    lines.push(
      `Traité par : ${userNameById[d.validated_by] || "Administrateur / Contrôleur"}`,
    );
  }

  return lines;
}

export function summarizeAuditDetails(
  d: any,
  userNameById: Record<string, string> = {},
): string {
  if (!d) return "";
  if (typeof d !== "object") return String(d);
  if (d.op || d.table) {
    return formatAuditTriggerLines(d, userNameById).join(" · ");
  }
  if (d.change && d.from !== undefined && d.to !== undefined) {
    return `${AUDIT_KEY_LABELS[d.change] || d.change} : ${formatAuditStatus(d.from)} → ${formatAuditStatus(d.to)}`;
  }
  if (d.action === "suspend" && d.motif) return `Suspension (motif : ${d.motif})`;
  if (d.motif && d.soft) return `Suppression logique (motif : ${d.motif})`;
  if (d.permissions) {
    const list = Array.isArray(d.permissions)
      ? d.permissions.map((p: string) => PERMISSION_LABELS[p as Permission] || p)
      : [String(d.permissions)];
    return `Permissions : ${list.join(", ")}`;
  }
  if (d.values && d.values.email) return `Email : ${d.values.email}`;
  if (d.user && d.user.email) return `Utilisateur : ${d.user.email}`;
  const s = Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(
      ([k, v]) =>
        `${AUDIT_KEY_LABELS[k] || k} : ${formatAuditValue(k, v, userNameById)}`,
    )
    .join(" · ");
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}

export function formatUserAgentLabel(ua?: string | null): string {
  if (!ua) return "Navigateur web";
  if (ua === "Dernière session connue") return ua;
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chrome/")
      ? "Chrome"
      : ua.includes("Firefox/")
        ? "Firefox"
        : ua.includes("Safari/")
          ? "Safari"
          : "Navigateur";
  const os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Android")
      ? "Android"
      : ua.includes("iPhone") || ua.includes("iPad")
        ? "iOS"
        : ua.includes("Mac OS")
          ? "macOS"
          : ua.includes("Linux")
            ? "Linux"
            : "Appareil";
  return `${browser} · ${os}`;
}
