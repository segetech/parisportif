import { RequestHandler } from "express";
import { createAnonClient, getSupabaseAdmin } from "../lib/supabase-admin";
import { recordAuditLog } from "../lib/audit-server";
import dayjs from "dayjs";

export const handleLogin: RequestHandler = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    const emailLower = email.toLowerCase().trim();

    // Authenticate user with an unprivileged isolated client (never mutate admin client auth state)
    const anonClient = createAnonClient();
    const { data: signInData, error: signInError } =
      await anonClient.auth.signInWithPassword({
        email: emailLower,
        password,
      });

    if (signInError || !signInData.user) {
      // Record failed login attempt
      await recordAuditLog({
        action: "echec_connexion",
        entityType: "Authentification",
        entityId: emailLower,
        details: { email: emailLower },
      });
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const admin = getSupabaseAdmin();

    // Fetch authoritative user record
    const { data: userRecord, error: userError } = await admin
      .from("users")
      .select("*")
      .eq("id", signInData.user.id)
      .single();

    if (userError || !userRecord) {
      return res.status(401).json({ error: "Profil utilisateur introuvable" });
    }

    // Check account status
    if (userRecord.statut !== "actif") {
      return res.status(403).json({ error: "Votre compte est inactif ou suspendu" });
    }

    // Update last login
    await admin
      .from("users")
      .update({ derniere_connexion: dayjs().toISOString() })
      .eq("id", signInData.user.id);

    // Record successful login
    await recordAuditLog({
      action: "connexion",
      entityType: "Authentification",
      entityId: userRecord.id,
      userId: userRecord.id,
      details: { email: emailLower, role: userRecord.role },
    });

    res.json({
      user: userRecord,
      session: signInData.session,
    });
  } catch (error: any) {
    console.error("Auth login error:", error);
    res.status(500).json({ error: "Erreur interne lors de la connexion" });
  }
};
