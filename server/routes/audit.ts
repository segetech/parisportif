import { RequestHandler } from "express";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { recordAuditLog } from "../lib/audit-server";

export const handleListAuditLogs: RequestHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user || (user.role !== "ADMIN" && user.role !== "CONTROLEUR")) {
      return res.status(403).json({ error: "Accès réservé aux administrateurs et contrôleurs" });
    }

    const admin = getSupabaseAdmin();
    const { start, end, action, entityType, limit = "100", offset = "0" } = req.query;

    let query = admin
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, user_id, details, created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (typeof start === "string" && start) {
      query = query.gte("created_at", start);
    }
    if (typeof end === "string" && end) {
      query = query.lte("created_at", end);
    }
    if (typeof action === "string" && action) {
      query = query.eq("action", action);
    }
    if (typeof entityType === "string" && entityType) {
      query = query.eq("entity_type", entityType);
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 100, 1), 500);
    const parsedOffset = Math.max(parseInt(offset as string, 10) || 0, 0);

    query = query.range(parsedOffset, parsedOffset + parsedLimit - 1);

    const { data: logs, count, error } = await query;

    if (error) {
      console.error("List audit logs error:", error);
      return res.status(500).json({ error: "Erreur lors de la récupération du journal d'audit" });
    }

    // Optionally enrich with user email/name from users table
    const userIds = Array.from(new Set((logs || []).map((l: any) => l.user_id).filter(Boolean)));
    let userMap: Record<string, { email: string; nom: string; prenom?: string }> = {};

    if (userIds.length > 0) {
      const { data: usersData } = await admin
        .from("users")
        .select("id, email, nom, prenom")
        .in("id", userIds);

      if (usersData) {
        for (const u of usersData) {
          userMap[u.id] = { email: u.email, nom: u.nom, prenom: u.prenom };
        }
      }
    }

    const enrichedLogs = (logs || []).map((log: any) => {
      const u = log.user_id ? userMap[log.user_id] : null;
      return {
        id: log.id,
        action: log.action,
        entity: log.entity_type,
        entityId: log.entity_id,
        userId: log.user_id,
        userEmail: u?.email || log.details?.email || null,
        userName: u ? `${u.nom} ${u.prenom || ""}`.trim() : null,
        details: log.details,
        ts: log.created_at,
      };
    });

    res.json({
      logs: enrichedLogs,
      total: count || enrichedLogs.length,
    });
  } catch (error: any) {
    console.error("Audit log error:", error);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

const FORBIDDEN_CLIENT_ACTIONS = new Set([
  "cree",
  "valide",
  "rejete",
  "refuse",
  "supprime",
  "edite",
  "normalise",
  "connexion",
  "echec_connexion",
  "demande_reinitialisation",
  "reinitialisation_effectuee",
  "role_change",
  "status_change",
]);

const ALLOWED_CLIENT_ACTIONS = new Set([
  "consultation",
  "export",
  "ui_view",
  "ui_navigation",
  "ui_preference",
  "client_ui_view",
  "client_ui_export",
]);

export const handleCreateAuditLog: RequestHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    if (user.statut !== "actif") {
      return res.status(403).json({ error: "Compte non actif" });
    }

    const { action, entity, entityId, details } = req.body;

    if (!action || !entity) {
      return res.status(400).json({ error: "Action et entité requises" });
    }

    const actionLower = String(action).toLowerCase().trim();

    // Prevent client-side forgery of business events
    if (FORBIDDEN_CLIENT_ACTIONS.has(actionLower) || !ALLOWED_CLIENT_ACTIONS.has(actionLower)) {
      return res.status(403).json({
        error:
          "Action non autorisée via l'API client. Les événements métier critiques (création, validation, suppression) sont tracés exclusivement par le serveur ou la base de données.",
      });
    }

    const result = await recordAuditLog({
      action: actionLower,
      entityType: String(entity),
      entityId: String(entityId || "client"),
      userId: user.id, // Strictly derived from verified JWT
      details: {
        ...(details && typeof details === "object" ? details : {}),
        loggedByEmail: user.email,
        loggedByRole: user.role,
        origin: "client_ui",
      },
    });

    if (!result.success) {
      return res.status(500).json({ error: "Échec d'enregistrement du journal d'audit" });
    }

    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error("Create audit log error:", error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de l'audit" });
  }
};
