import { supabase } from "./supabase";

export type AuditAction =
  | "cree"
  | "edite"
  | "valide"
  | "rejete"
  | "supprime"
  | "normalise"
  | "connexion"
  | "echec_connexion"
  | "demande_reinitialisation"
  | "reinitialisation_effectuee";

export type AuditEntity = "Transaction" | "Pari" | "Salle" | "Systeme" | "Utilisateur" | "Profil" | "Authentification";

export interface AuditEntry {
  id: string;
  ts: string; // ISO
  user?: { id: string; email?: string; role?: string };
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  details?: any;
}

const LOCAL_FALLBACK_KEY = "ps.audit_cache";

function sanitizeDetails(details: any): any {
  if (!details || typeof details !== "object") return details;
  const sensitiveKeys = new Set(["password", "token", "key", "secret", "currentpassword", "newpassword"]);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(details)) {
    if (sensitiveKeys.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export const auditService = {
  async log(action: AuditAction, entity: AuditEntity, entityId?: string, details?: any): Promise<AuditEntry | null> {
    const cleanDetails = sanitizeDetails(details);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (token) {
        await fetch("/api/audit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            entity,
            entityId,
            details: cleanDetails,
          }),
        });
      }
    } catch (e) {
      console.warn("Audit log remote submission failed:", e);
    }

    // Always create a local record representation
    const entry: AuditEntry = {
      id: Math.random().toString(36).slice(2, 10),
      ts: new Date().toISOString(),
      action,
      entity,
      entityId,
      details: cleanDetails,
    };

    return entry;
  },

  async list(params?: {
    start?: string;
    end?: string;
    userEmail?: string;
    role?: string;
    action?: AuditAction;
    entity?: AuditEntity;
  }): Promise<AuditEntry[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (token) {
        const queryParams = new URLSearchParams();
        if (params?.start) queryParams.set("start", params.start);
        if (params?.end) queryParams.set("end", params.end);
        if (params?.action) queryParams.set("action", params.action);
        if (params?.entity) queryParams.set("entityType", params.entity);

        const res = await fetch(`/api/audit?${queryParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const json = await res.json();
          const logs: AuditEntry[] = (json.logs || []).map((l: any) => ({
            id: l.id,
            ts: l.ts,
            action: l.action as AuditAction,
            entity: l.entity as AuditEntity,
            entityId: l.entityId,
            user: l.userId || l.userEmail ? {
              id: l.userId || "",
              email: l.userEmail || "",
              role: l.details?.loggedByRole || "",
            } : undefined,
            details: l.details,
          }));

          // Filter by client params
          let filtered = logs;
          if (params?.userEmail) {
            filtered = filtered.filter((e) =>
              e.user?.email?.toLowerCase().includes(params.userEmail!.toLowerCase())
            );
          }
          if (params?.role) {
            filtered = filtered.filter((e) => e.user?.role === params.role);
          }

          // Cache locally for offline inspection
          try {
            localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(filtered.slice(0, 100)));
          } catch {}

          return filtered;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch remote audit logs:", e);
    }

    // Offline fallback
    try {
      const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
      return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
    } catch {
      return [];
    }
  },
};
