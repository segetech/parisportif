import { RequestHandler } from "express";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { sendEmail } from "../lib/email";
import { recordAuditLog } from "../lib/audit-server";
import crypto from "crypto";
import { UserRole } from "../types/auth";
import { validateAdminPassword } from "../../shared/admin-password";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "CONTROLEUR", "AGENT"];
const ALLOWED_STATUSES = ["actif", "suspendu", "desactive", "invitation_envoyee"] as const;

class PasswordSelectionError extends Error {}

function selectPassword(body: Record<string, unknown>) {
  const { password, newPassword, passwordMode } = body;
  if (passwordMode !== undefined && passwordMode !== "manual" && passwordMode !== "generate") {
    throw new PasswordSelectionError("Choix de mot de passe invalide.");
  }
  // Accept the old field during rollout, but never silently ignore a supplied value.
  if (password !== undefined && newPassword !== undefined && password !== newPassword) {
    throw new PasswordSelectionError("Deux mots de passe différents ont été transmis. Veuillez réessayer.");
  }
  const supplied = password !== undefined ? password : newPassword;
  const mode = passwordMode ?? (supplied !== undefined ? "manual" : "generate");
  if (mode === "generate") {
    if (supplied !== undefined) throw new PasswordSelectionError("Retirez la saisie manuelle avant de demander une génération automatique.");
    return { password: generateCryptographicPassword(), passwordSource: "generated" as const };
  }
  const error = validateAdminPassword(supplied);
  if (error) throw new PasswordSelectionError(error);
  // Passwords are opaque secrets: preserve whitespace and every character exactly.
  return { password: supplied as string, passwordSource: "manual" as const };
}

/**
 * Générateur cryptographique fort de mot de passe (sans Math.random)
 * Conforme aux règles de complexité Supabase (majuscules, minuscules, chiffres, caractères spéciaux).
 */
export function generateCryptographicPassword(length: number = 14): string {
  const targetLength = Math.max(8, length);
  const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowers = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const specials = "!@#$%*-_+=";

  let pwd = "";
  pwd += uppers[crypto.randomInt(0, uppers.length)];
  pwd += lowers[crypto.randomInt(0, lowers.length)];
  pwd += digits[crypto.randomInt(0, digits.length)];
  pwd += specials[crypto.randomInt(0, specials.length)];

  const allChars = uppers + lowers + digits + specials;
  while (pwd.length < targetLength) {
    pwd += allChars[crypto.randomInt(0, allChars.length)];
  }

  // Mélange Fisher-Yates cryptographique
  const chars = pwd.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Vérifie le nombre d'administrateurs actifs dans la base de données.
 * Empêche toute opération menant à 0 administrateur actif.
 */
async function getActiveAdminCount(adminClient: any, excludeUserId?: string): Promise<number> {
  let query = adminClient
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "ADMIN")
    .eq("statut", "actif");

  if (excludeUserId && typeof query.neq === "function") {
    query = query.neq("id", excludeUserId);
  }

  const { count, error } = await query;
  if (error) {
    console.error("Erreur comptage administrateurs actifs:", error);
    throw new Error("Impossible de vérifier les administrateurs du système");
  }
  return count || 0;
}

/**
 * Création d'utilisateur avec mot de passe unique garanti (source de vérité serveur).
 */
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

    const { password: finalPassword, passwordSource } = selectPassword(req.body);
    const admin = getSupabaseAdmin();
    const emailLower = email.toLowerCase().trim();

    // Vérifier l'existence préalable dans la table users
    const { data: existingUser } = await admin
      .from("users")
      .select("id")
      .eq("email", emailLower)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: "Un utilisateur avec cet email existe déjà" });
    }

    // Création Supabase Auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: emailLower,
      password: finalPassword,
      email_confirm: true,
      user_metadata: {
        nom: nom.trim(),
        prenom: prenom ? prenom.trim() : null,
        role,
        must_change_password: true,
      },
    });

    if (authError || !authData?.user) {
      return res.status(400).json({
        error: authError?.message || "Erreur de création du compte d'authentification",
      });
    }

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
        must_change_password: true,
        cree_le: now,
        mis_a_jour_le: now,
      })
      .select()
      .single();

    if (userError) {
      // Rollback Auth user
      await admin.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: userError.message });
    }

    // Audit log sans secret
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

    // Envoi email si demandé
    if (shouldSendEmail) {
      const baseUrl = process.env.APP_URL || "http://localhost:3000";
      const loginUrl = `${baseUrl}/login`;

      await sendEmail({
        to: emailLower,
        subject: "Bienvenue - Vos identifiants d'accès",
        html: `
          <h2>Bienvenue ${nom}!</h2>
          <p>Un compte a été créé pour vous sur la plateforme Test.</p>
          <p><strong>Email :</strong> ${emailLower}</p>
          <p><strong>Mot de passe :</strong> <code>${finalPassword}</code></p>
          <p><strong>Rôle :</strong> ${role}</p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #006B2D; color: white; text-decoration: none; border-radius: 5px;">Se connecter</a></p>
          <p>Veuillez modifier votre mot de passe dès votre première connexion.</p>
        `,
      });
    }

    res.status(201).json({
      user: userData,
      temporaryPassword: finalPassword,
      passwordSource,
      message: shouldSendEmail
        ? "Utilisateur créé et invitation envoyée par email"
        : "Utilisateur créé avec succès",
    });
  } catch (error: any) {
    if (error instanceof PasswordSelectionError) return res.status(400).json({ error: error.message });
    console.error("Create user error:", error);
    res.status(500).json({ error: "Erreur interne du serveur lors de la création" });
  }
};

/**
 * Réinitialisation administrative du mot de passe (source de vérité serveur).
 */
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

    const { password: finalPassword, passwordSource } = selectPassword(req.body);
    const admin = getSupabaseAdmin();

    const { data: targetUser, error: userError } = await admin
      .from("users")
      .select("id, nom, prenom, email, role")
      .eq("id", targetUserId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // Mise à jour Auth Supabase
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
      password: finalPassword,
      user_metadata: { must_change_password: true },
    });

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Synchronisation table users
    await admin
      .from("users")
      .update({
        must_change_password: true,
        mis_a_jour_le: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    // Audit log sans mot de passe
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
          <p><strong>Nouveau mot de passe :</strong> <code>${finalPassword}</code></p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #006B2D; color: white; text-decoration: none; border-radius: 5px;">Se connecter</a></p>
          <p>Veuillez modifier votre mot de passe dès votre connexion.</p>
        `,
      });
    }

    res.json({
      temporaryPassword: finalPassword,
      passwordSource,
      message: shouldSendEmail
        ? "Mot de passe réinitialisé et envoyé par email"
        : "Mot de passe réinitialisé avec succès",
    });
  } catch (error: any) {
    if (error instanceof PasswordSelectionError) return res.status(400).json({ error: error.message });
    console.error("Reset user password error:", error);
    res.status(500).json({ error: "Erreur interne lors de la réinitialisation" });
  }
};

/**
 * Mise à jour du rôle utilisateur avec protection absolue du dernier administrateur.
 */
export const handleUpdateUserRole: RequestHandler = async (req, res) => {
  try {
    const adminUser = req.user;
    if (!adminUser || adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Opération réservée aux administrateurs" });
    }

    const { userId } = req.params;
    const { role } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Identifiant utilisateur requis" });
    }

    if (!role || !ALLOWED_ROLES.includes(role as UserRole)) {
      return res.status(400).json({ error: "Rôle invalide (ADMIN, CONTROLEUR ou AGENT)" });
    }

    const admin = getSupabaseAdmin();

    const { data: targetUser, error: findError } = await admin
      .from("users")
      .select("id, role, statut, email, nom")
      .eq("id", userId)
      .single();

    if (findError || !targetUser) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // Protection du dernier administrateur actif
    if (targetUser.role === "ADMIN" && role !== "ADMIN") {
      const remainingAdmins = await getActiveAdminCount(admin, userId);
      if (remainingAdmins < 1) {
        return res.status(400).json({
          error: "Action refusée : impossible de rétrograder le dernier administrateur actif du système.",
        });
      }
    }

    // 1. Mettre à jour Supabase Auth metadata
    try {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: { role },
      });
    } catch (authErr: any) {
      console.warn("Mise à jour Auth metadata rôle:", authErr.message);
    }

    // 2. Mettre à jour la table users
    const { data: updatedUser, error: updateError } = await admin
      .from("users")
      .update({
        role,
        mis_a_jour_le: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Audit log
    await recordAuditLog({
      action: "edite",
      entityType: "Utilisateur",
      entityId: userId,
      userId: adminUser.id,
      details: {
        action: "changement_role",
        ancienRole: targetUser.role,
        nouveauRole: role,
        targetEmail: targetUser.email,
        updatedBy: adminUser.email,
      },
    });

    res.json({
      success: true,
      user: updatedUser,
      message: `Rôle mis à jour vers ${role} avec succès`,
    });
  } catch (error: any) {
    console.error("Update role error:", error);
    res.status(500).json({ error: error.message || "Erreur interne lors de la mise à jour du rôle" });
  }
};

/**
 * Modification de statut avec protection du dernier administrateur.
 */
export const handleUpdateUserStatus: RequestHandler = async (req, res) => {
  try {
    const adminUser = req.user;
    if (!adminUser || adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Opération réservée aux administrateurs" });
    }

    const { userId } = req.params;
    const { statut } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Identifiant utilisateur requis" });
    }

    if (!statut || !ALLOWED_STATUSES.includes(statut)) {
      return res.status(400).json({
        error: "Statut invalide (actif, suspendu, desactive, invitation_envoyee)",
      });
    }

    const admin = getSupabaseAdmin();

    const { data: targetUser, error: findError } = await admin
      .from("users")
      .select("id, role, statut, email, nom")
      .eq("id", userId)
      .single();

    if (findError || !targetUser) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // Protection du dernier administrateur actif
    if (targetUser.role === "ADMIN" && targetUser.statut === "actif" && statut !== "actif") {
      const remainingAdmins = await getActiveAdminCount(admin, userId);
      if (remainingAdmins < 1) {
        return res.status(400).json({
          error: "Action refusée : impossible de suspendre ou désactiver le dernier administrateur actif.",
        });
      }
    }

    const { data: updatedUser, error: updateError } = await admin
      .from("users")
      .update({
        statut,
        mis_a_jour_le: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Audit log
    await recordAuditLog({
      action: "edite",
      entityType: "Utilisateur",
      entityId: userId,
      userId: adminUser.id,
      details: {
        action: "changement_statut",
        ancienStatut: targetUser.statut,
        nouveauStatut: statut,
        targetEmail: targetUser.email,
        updatedBy: adminUser.email,
      },
    });

    res.json({
      success: true,
      user: updatedUser,
      message: `Statut modifié avec succès (${statut})`,
    });
  } catch (error: any) {
    console.error("Update status error:", error);
    res.status(500).json({ error: error.message || "Erreur interne lors du changement de statut" });
  }
};

/**
 * Mise à jour de l'email de connexion dans Supabase Auth et synchronisation dans users.
 */
export const handleUpdateUserEmail: RequestHandler = async (req, res) => {
  try {
    const adminUser = req.user;
    if (!adminUser || adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Opération réservée aux administrateurs" });
    }

    const { userId } = req.params;
    const { email } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Identifiant utilisateur requis" });
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Adresse email invalide" });
    }

    const emailLower = email.toLowerCase().trim();
    const admin = getSupabaseAdmin();

    const { data: targetUser, error: findError } = await admin
      .from("users")
      .select("id, email, role")
      .eq("id", userId)
      .single();

    if (findError || !targetUser) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    if (targetUser.email === emailLower) {
      return res.json({ success: true, user: targetUser, message: "L'adresse email est déjà identique" });
    }

    // Vérifier les doublons
    const { data: existingUser } = await admin
      .from("users")
      .select("id")
      .eq("email", emailLower)
      .maybeSingle();

    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ error: "Cette adresse email est déjà utilisée par un autre compte" });
    }

    // 1. Mettre à jour Supabase Auth (source d'authentification)
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      email: emailLower,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({
        error: `Erreur Supabase Auth: ${authError.message}`,
      });
    }

    // 2. Mettre à jour la table métier users
    const { data: updatedUser, error: updateError } = await admin
      .from("users")
      .update({
        email: emailLower,
        mis_a_jour_le: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (updateError) {
      // Tenter une compensation sur Auth si la table échoue
      console.error("Échec update users après Auth, compensation en cours...");
      try {
        await admin.auth.admin.updateUserById(userId, { email: targetUser.email });
      } catch (compensateErr) {
        console.error("Échec compensation Auth:", compensateErr);
      }
      return res.status(500).json({ error: "Erreur synchronisation profil métier" });
    }

    // Audit log
    await recordAuditLog({
      action: "edite",
      entityType: "Utilisateur",
      entityId: userId,
      userId: adminUser.id,
      details: {
        action: "changement_email",
        ancienEmail: targetUser.email,
        nouvelEmail: emailLower,
        updatedBy: adminUser.email,
      },
    });

    res.json({
      success: true,
      user: updatedUser,
      message: "Adresse email mise à jour et synchronisée avec succès",
    });
  } catch (error: any) {
    console.error("Update email error:", error);
    res.status(500).json({ error: error.message || "Erreur interne lors de la mise à jour de l'email" });
  }
};

/**
 * Mise à jour administrative du profil (nom, prénom) via le serveur
 */
export const handleUpdateUserProfile: RequestHandler = async (req, res) => {
  try {
    const adminUser = req.user;
    if (!adminUser || adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Opération réservée aux administrateurs" });
    }

    const { userId } = req.params;
    const { nom, prenom } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Identifiant utilisateur requis" });
    }

    if (!nom || typeof nom !== "string" || !nom.trim()) {
      return res.status(400).json({ error: "Le nom est obligatoire" });
    }

    const admin = getSupabaseAdmin();

    const { data: targetUser, error: findError } = await admin
      .from("users")
      .select("id, email, nom, prenom")
      .eq("id", userId)
      .single();

    if (findError || !targetUser) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const { data: updatedUser, error: updateError } = await admin
      .from("users")
      .update({
        nom: nom.trim(),
        prenom: prenom && typeof prenom === "string" && prenom.trim() ? prenom.trim() : null,
        mis_a_jour_le: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Mettre à jour les métadonnées auth
    try {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          nom: nom.trim(),
          prenom: prenom && typeof prenom === "string" && prenom.trim() ? prenom.trim() : null,
        },
      });
    } catch (authErr) {
      console.warn("Mise à jour Auth metadata nom/prénom:", authErr);
    }

    // Audit log
    await recordAuditLog({
      action: "edite",
      entityType: "Utilisateur",
      entityId: userId,
      userId: adminUser.id,
      details: {
        action: "modification_profil_admin",
        ancienNom: targetUser.nom,
        nouveauNom: nom.trim(),
        updatedBy: adminUser.email,
      },
    });

    res.json({
      success: true,
      user: updatedUser,
      message: "Profil utilisateur mis à jour avec succès",
    });
  } catch (error: any) {
    console.error("Update user profile error:", error);
    res.status(500).json({ error: error.message || "Erreur interne lors de la mise à jour du profil" });
  }
};
