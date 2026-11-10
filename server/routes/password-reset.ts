import { RequestHandler } from "express";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { sendEmail, generatePasswordResetToken, generatePasswordResetLink } from "../lib/email";
import { recordAuditLog } from "../lib/audit-server";
import crypto from "crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const handleForgotPassword: RequestHandler = async (req, res) => {
  // Always respond with a generic message to prevent email enumeration
  const genericResponse = {
    message: "Si cet email correspond à un compte actif, un lien de réinitialisation vous a été envoyé.",
  };

  try {
    const { email } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Adresse email requise" });
    }

    const emailLower = email.toLowerCase().trim();
    const admin = getSupabaseAdmin();

    // Check if user exists
    const { data: user, error: userError } = await admin
      .from("users")
      .select("id, nom, prenom, email, statut")
      .eq("email", emailLower)
      .maybeSingle();

    if (userError || !user || user.statut !== "actif") {
      return res.json(genericResponse);
    }

    // Generate secure token (valid for 1 hour)
    const rawToken = generatePasswordResetToken();
    const tokenHashed = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Persist token in database
    const { error: dbError } = await admin.from("password_resets").insert({
      user_id: user.id,
      token_hash: tokenHashed,
      expires_at: expiresAt,
      used: false,
    });

    if (dbError) {
      console.error("Failed to insert password reset token into db:", dbError);
      return res.json(genericResponse);
    }

    // Generate reset link
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const resetLink = generatePasswordResetLink(rawToken, baseUrl);

    // Send email
    try {
      await sendEmail({
        to: emailLower,
        subject: "Réinitialisation de votre mot de passe",
        html: `
          <h2>Réinitialisation de mot de passe</h2>
          <p>Bonjour ${user.nom} ${user.prenom || ""},</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe pour la plateforme Test.</p>
          <p><a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #1f9e64; color: white; text-decoration: none; border-radius: 5px;">Réinitialiser mon mot de passe</a></p>
          <p>Ou copiez ce lien dans votre navigateur :</p>
          <p><code>${resetLink}</code></p>
          <p>Ce lien est à usage unique et expirera dans 1 heure.</p>
          <p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.</p>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send reset email:", emailErr);
    }

    await recordAuditLog({
      action: "demande_reinitialisation",
      entityType: "Authentification",
      entityId: user.id,
      userId: user.id,
      details: {
        action: "demande_reinitialisation_mdp",
        email: emailLower,
      },
    });

    return res.json(genericResponse);
  } catch (error: any) {
    console.error("Forgot password error:", error);
    // Silent generic response to avoid leaking server state or existence of accounts
    return res.json(genericResponse);
  }
};

export const handleResetPassword: RequestHandler = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Jeton de réinitialisation requis" });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        error: "Le nouveau mot de passe doit comporter au moins 6 caractères",
      });
    }

    const admin = getSupabaseAdmin();
    const tokenHashed = hashToken(token);
    const nowIso = new Date().toISOString();

    // Atomic token consumption: mark used = true ONLY IF used = false AND expires_at > now()
    const { data: consumedRecord, error: consumeError } = await admin
      .from("password_resets")
      .update({ used: true })
      .eq("token_hash", tokenHashed)
      .eq("used", false)
      .gt("expires_at", nowIso)
      .select("user_id")
      .maybeSingle();

    if (consumeError || !consumedRecord || !consumedRecord.user_id) {
      return res.status(400).json({
        error: "Lien de réinitialisation invalide, déjà utilisé ou expiré",
      });
    }

    const targetUserId = consumedRecord.user_id;

    // Update password in Supabase auth
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
      password,
    });

    if (updateError) {
      console.error("Failed to update user password in auth:", updateError);
      // Invalider ou restaurer en cas d'échec
      await admin.from("password_resets").update({ used: false }).eq("token_hash", tokenHashed);
      return res.status(500).json({ error: "Échec de mise à jour du mot de passe" });
    }

    await recordAuditLog({
      action: "reinitialisation_effectuee",
      entityType: "Authentification",
      entityId: targetUserId,
      userId: targetUserId,
      details: {
        action: "succes_reinitialisation_mdp",
      },
    });

    return res.json({ message: "Votre mot de passe a été réinitialisé avec succès" });
  } catch (error: any) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Erreur interne lors de la réinitialisation" });
  }
};
