export type AuditAction =
  | "cree"
  | "edite"
  | "valide"
  | "rejete"
  | "supprime"
  | "normalise";

export type AuditEntity = "Transaction" | "Pari" | "Salle" | "Systeme";

export interface AuditEntry {
  id: string;
  ts: string; // ISO
  user?: { id: string; email?: string; role?: string };
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  details?: any;
}

const LS_KEY = "ps.audit";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function load(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

function save(list: AuditEntry[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {}
}

let cache = load();

export const auditService = {
  log(action: AuditAction, entity: AuditEntity, entityId?: string, details?: any) {
    const actor = getCurrentActor(details);
    const entry: AuditEntry = {
      id: uid(),
      ts: new Date().toISOString(),
      user: actor || undefined,
      action,
      entity,
      entityId,
      details,
    };
    cache.unshift(entry);
    pruneByRetention();
    save(cache);
    return entry;
  },
  list(params?: {
    start?: string;
    end?: string;
    userEmail?: string;
    role?: string;
    action?: AuditAction;
    entity?: AuditEntity;
  }): AuditEntry[] {
    let res = cache.slice();
    if (params?.start) res = res.filter((e) => e.ts >= params.start!);
    if (params?.end) res = res.filter((e) => e.ts <= params.end!);
    if (params?.userEmail)
      res = res.filter((e) => e.user?.email?.toLowerCase().includes(params.userEmail!.toLowerCase()));
    if (params?.role) res = res.filter((e) => e.user?.role === params.role);
    if (params?.action) res = res.filter((e) => e.action === params.action);
    if (params?.entity) res = res.filter((e) => e.entity === params.entity);
    return res;
  },
  clear() {
    cache = [];
    save(cache);
  },
};

// --- Helpers to enrich and retain logs ---
function getCurrentActor(details?: any): { id: string; email?: string; role?: string } | null {
  try {
    // Prefer explicit actor provided by caller
    if (details?.by && typeof details.by === "object") {
      const by = details.by as { id?: string; email?: string; role?: string };
      if (by.id || by.email) return { id: by.id || "", email: by.email, role: by.role };
    }
    if (details?.user && typeof details.user === "object") {
      const u = details.user as { id?: string; email?: string; role?: string };
      if (u.id || u.email) return { id: u.id || "", email: u.email, role: u.role };
    }
    // Fallback to current session (localStorage set by AuthContext)
    const raw = localStorage.getItem("ps.auth");
    if (!raw) return null;
    const u = JSON.parse(raw) as { id?: string; email?: string; role?: string } | null;
    if (u && (u.id || u.email)) return { id: u.id || "", email: u.email, role: u.role };
  } catch {}
  return null;
}

function pruneByRetention() {
  try {
    const raw = localStorage.getItem("ps.settings");
    if (!raw) return;
    const settings = JSON.parse(raw) as { auditRetentionDays?: number } | null;
    const days = Number(settings?.auditRetentionDays || 0);
    if (!days || days <= 0) return;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    cache = cache.filter((e) => new Date(e.ts).getTime() >= cutoff);
  } catch {}
}
