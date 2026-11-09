import { RequestHandler } from "express";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { sendEmail } from "../lib/email";
import { recordAuditLog } from "../lib/audit-server";
import crypto from "crypto";
import { UserRole } from "../types/auth";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "CONTROLEUR", "AGENT"];

function generateSecureTemporaryPassword(): string {
  // Generate random 10-character alphanumeric password
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

export const handleCreateUserWithPassword: RequestHandler = async (req, res) => {
  try {
    const adminUser = req.user;
    if (!adminUser || adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Opération réservée aux administrateurs" });
    }

    const { nom, prenom, email, role, sendEmail: shouldSendEmail } = req.body;

    if (!nom || typeof nom !== "string" || !nom.trim()) {
      return res.status(400).json({ error: "Le nom est requis" });
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Une adresse email valide est requise" });
    }

    if (!role || !ALLOWED_ROLES.includes(role as UserRole)) {
      return res.status(400).json({ error: "Rôle invalide (ADMIN, CONTROLEUR ou AGENT)" });
    }

    const admin = getSupabaseAdmin();
    const emailLower = email.toLowerCase().trim();

    // Check if user already exists
    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("email", emailLower)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "Un utilisateur avec cet email existe déjà" });
    }

    const temporaryPassword = generateSecureTemporaryPassword();

    // Create Supabase auth user with email_confirm: true
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: emailLower,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        nom: nom.trim(),
        prenom: prenom ? prenom.trim() : null,
        role,
      },
    });

    if (authError || !authData?.user) {
      return res.status(400).json({ error: authError?.message || "Erreur de création de compte auth" });
    }

    // Create user record in users table
    const now = new Date().toISOString();
    const statut = shouldSendEmail ? "invitation_envoyee" : "actif";

    const { data: userData, error: userError } = await admin
      .from("users")
      .insert({
        id: authData.user.id,
        nom: nom.trim(),
        prenom: prenom ? prenom.trim() : null,
        email: emailLower,
        role,
        statut,
        cree_le: now,
        mis_a_jour_le: now,
      })
      .select()
      .single();

    if (userError) {
      // Rollback auth user creation
      await admin.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: userError.message });
    }

    // Record persistent audit log
    await recordAuditLog({
      action: "cree",
      entityType: "Utilisateur",
      entityId: authData.user.id,
      userId: adminUser.id,
      details: {
        targetEmail: emailLower,
        targetRole: role,
        statut,
        createdBy: adminUser.email,
      },
    });

    // Send email if requested
    if (shouldSendEmail) {
      const baseUrl = process.env.APP_URL || "http://localhost:3000";
      const loginUrl = `${baseUrl}/login`;

      await sendEmail({
        to: emailLower,
        subject: "Bienvenue - Vos identifiants d'accès",
        html: `
          <h2>Bienvenue ${nom}!</h2>
          <p>Un compte a été créé pour vous sur la plateforme Pari Sportif.</p>
          <p><strong>Email :</strong> ${emailLower}</p>
          <p><strong>Mot de passe temporaire :</strong> <code>${temporaryPassword}</code></p>
          <p><strong>Rôle :</strong> ${role}</p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #1f9e64; color: white; text-decoration: none; border-radius: 5px;">Se connecter</a></p>
          <p>Veuillez modifier votre mot de passe dès votre première connexion.</p>
        `,
      });
    }

    res.status(201).json({
      user: userData,
      temporaryPassword,
      message: shouldSendEmail
        ? "Utilisateur créé et invitation envoyée par email"
        : "Utilisateur créé avec succès",
    });
  } catch (error: any) {
    console.error("Create user error:", error);
    res.status(500).json({ error: "Erreur interne du serveur lors de la création" });
  }
};

export const handleResetUserPassword: RequestHandler = async (req, res) => {
  try {
    const adminUser = req.user;
    if (!adminUser || adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Opération réservée aux administrateurs" });
    }

    const { userId } = req.params;
    const { sendEmail: shouldSendEmail } = req.body;

    const targetUserId = userId || req.body.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: "L'identifiant de l'utilisateur est requis" });
    }

    const admin = getSupabaseAdmin();

    // Verify target user exists
    const { data: targetUser, error: userError } = await admin
      .from("users")
      .select("id, nom, prenom, email, role")
      .eq("id", targetUserId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const temporaryPassword = generateSecureTemporaryPassword();

    // Update password in Supabase auth
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
      password: temporaryPassword,
    });

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Record persistent audit log
    await recordAuditLog({
      action: "edite",
      entityType: "Utilisateur",
      entityId: targetUserId,
      userId: adminUser.id,
      details: {
        action: "reinitialisation_mot_de_passe",
        targetEmail: targetUser.email,
        resetBy: adminUser.email,
      },
    });

    // Send email if requested
    if (shouldSendEmail) {
      const baseUrl = process.env.APP_URL || "http://localhost:3000";
      const loginUrl = `${baseUrl}/login`;

      await sendEmail({
        to: targetUser.email,
        subject: "Réinitialisation de votre mot de passe",
        html: `
          <h2>Réinitialisation de mot de passe</h2>
          <p>Bonjour ${targetUser.nom} ${targetUser.prenom || ""},</p>
          <p>Votre mot de passe a été réinitialisé par un administrateur.</p>
          <p><strong>Nouveau mot de passe temporaire :</strong> <code>${temporaryPassword}</code></p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #1f9e64; color: white; text-decoration: none; border-radius: 5px;">Se connecter</a></p>
          <p>Veuillez modifier votre mot de passe dès votre connexion.</p>
        `,
      });
    }

    res.json({
      temporaryPassword,
      message: shouldSendEmail
        ? "Mot de passe réinitialisé et envoyé par email"
        : "Mot de passe réinitialisé avec succès",
    });
  } catch (error: any) {
    console.error("Reset user password error:", error);
    res.status(500).json({ error: "Erreur interne lors de la réinitialisation" });
  }
};
