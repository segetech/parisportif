import { Request, Response, NextFunction } from "express";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { AuthenticatedUser, UserRole } from "../types/auth";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Jeton d'authentification requis" });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ error: "Jeton d'authentification invalide" });
    }

    const admin = getSupabaseAdmin();

    // Verify token with Supabase Auth
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: "Session invalide ou expirée" });
    }

    // Verify user in the users table to get authoritative role and status
    const { data: userRecord, error: userError } = await admin
      .from("users")
      .select("id, email, role, statut, nom, prenom")
      .eq("id", authData.user.id)
      .single();

    if (userError || !userRecord) {
      return res.status(401).json({ error: "Compte utilisateur introuvable" });
    }

    if (userRecord.statut !== "actif") {
      return res.status(403).json({ error: "Compte inactif ou suspendu" });
    }

    req.user = {
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role as UserRole,
      statut: userRecord.statut,
      nom: userRecord.nom,
      prenom: userRecord.prenom,
    };

    next();
  } catch (err: any) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Erreur interne d'authentification" });
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé pour ce rôle" });
    }

    next();
  };
}
