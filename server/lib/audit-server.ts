import { getSupabaseAdmin } from "./supabase-admin";

export interface ServerAuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  details?: Record<string, any>;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "token",
  "temporarypassword",
  "secret",
  "apikey",
  "key",
]);

export function sanitizeAuditDetails(details: any): any {
  if (!details || typeof details !== "object") return details;
  if (Array.isArray(details)) {
    return details.map(sanitizeAuditDetails);
  }

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      clean[k] = sanitizeAuditDetails(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export async function recordAuditLog(
  entry: ServerAuditEntry,
  options?: { throwOnError?: boolean },
): Promise<{ success: boolean; error?: any }> {
  try {
    const admin = getSupabaseAdmin();
    const cleanDetails = entry.details ? sanitizeAuditDetails(entry.details) : null;
    const { error } = await admin.from("audit_logs").insert({
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      user_id: entry.userId || null,
      details: cleanDetails,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase audit log insert error:", error);
      if (options?.throwOnError) {
        throw new Error(`Échec d'enregistrement d'audit: ${error.message || JSON.stringify(error)}`);
      }
      return { success: false, error };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Failed to record audit log:", err);
    if (options?.throwOnError) {
      throw err;
    }
    return { success: false, error: err };
  }
}
