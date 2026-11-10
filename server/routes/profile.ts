import { RequestHandler } from "express";
import { getSupabaseAdmin, createAnonClient } from "../lib/supabase-admin";
import { recordAuditLog } from "../lib/audit-server";

export const handleUpdateProfile: RequestHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const { nom, prenom } = req.body;

    if (!nom || typeof nom !== "string" || !nom.trim()) {
      return res.status(400).json({ error: "Le nom est obligatoire" });
    }

    const admin = getSupabaseAdmin();

    const { data: updatedUser, error: updateError } = await admin
      .from("users")
      .update({
        nom: nom.trim(),
        prenom: prenom && typeof prenom === "string" && prenom.trim() ? prenom.trim() : null,
        mis_a_jour_le: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id, nom, prenom, email, role, statut")
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    await recordAuditLog({
      action: "edite",
      entityType: "Profil",
      entityId: user.id,
      userId: user.id,
      details: {
        action: "mise_a_jour_profil",
        email: user.email,
      },
    });

    res.json({ user: updatedUser });
  } catch (error: any) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Erreur interne lors de la mise à jour du profil" });
  }
};

export const handleChangePassword: RequestHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Le mot de passe actuel et le nouveau mot de passe sont requis" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        error: "Le nouveau mot de passe doit être différent du mot de passe temporaire actuel",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({
        error: "Le nouveau mot de passe doit comporter au moins 8 caractères",
      });
    }

    // Verify current password with an isolated unprivileged client (prevents session sharing)
    const anonClient = createAnonClient();
    const { error: verifyError } = await anonClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verifyError) {
      return res.status(400).json({ error: "Le mot de passe actuel est incorrect" });
    }

    // Update password with the admin client and mark renewal in metadata
    const admin = getSupabaseAdmin();
    const renewalTimestamp = new Date().toISOString();
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
      user_metadata: {
        must_change_password: false,
        password_renewed_at: renewalTimestamp,
      },
    });

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Synchroniser la table users pour lever la restriction de manière vérifiée
    const { error: dbError } = await admin
      .from("users")
      .update({
        must_change_password: false,
        password_changed_at: renewalTimestamp,
        mis_a_jour_le: renewalTimestamp,
      })
      .eq("id", user.id);

    if (dbError) {
      console.error("Erreur synchronisation must_change_password:", dbError);
      // Secret mis à jour dans Auth mais finalisation métier interrompue : proposer la reprise explicite
      return res.status(409).json({
        error: "Votre nouveau mot de passe a bien été enregistré dans le système d'authentification, mais la finalisation de votre profil métier a été interrompue. Veuillez cliquer sur 'Finaliser la synchronisation' pour terminer l'opération.",
        pendingFinalization: true,
      });
    }

    await recordAuditLog({
      action: "edite",
      entityType: "Profil",
      entityId: user.id,
      userId: user.id,
      details: {
        action: "changement_mot_de_passe",
        email: user.email,
      },
    });

    res.json({ message: "Mot de passe modifié avec succès" });
  } catch (error: any) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Erreur interne lors de la modification du mot de passe" });
  }
};

/**
 * Endpoint de reprise en cas de désynchronisation :
 * Permet de finaliser la levée de restriction dans la table public.users
 * dès lors que Supabase Auth atteste de la mise à jour récente du secret,
 * sans exiger l'ancien mot de passe qui a déjà été invalidé.
 */
export const handleFinalizePasswordChange: RequestHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const admin = getSupabaseAdmin();

    // 1. Vérifier dans Auth que l'utilisateur existe et qu'un renouvellement a bien eu lieu
    const { data: authUserData, error: authError } = await admin.auth.admin.getUserById(user.id);
    if (authError || !authUserData?.user) {
      return res.status(400).json({ error: "Compte utilisateur introuvable dans le service d'authentification" });
    }

    const authUser = authUserData.user;
    const renewedAt = authUser.user_metadata?.password_renewed_at || authUser.updated_at;

    if (!renewedAt) {
      return res.status(400).json({
        error: "Aucun changement de mot de passe préalable n'a été détecté pour ce compte. Veuillez procéder au changement régulier.",
      });
    }

    // 2. Synchroniser la table users
    const nowIso = new Date().toISOString();
    const { error: dbError } = await admin
      .from("users")
      .update({
        must_change_password: false,
        password_changed_at: nowIso,
        mis_a_jour_le: nowIso,
      })
      .eq("id", user.id);

    if (dbError) {
      console.error("Erreur finalisation must_change_password:", dbError);
      return res.status(500).json({
        error: "Impossible de finaliser l'enregistrement en base. Veuillez réessayer.",
      });
    }

    await recordAuditLog({
      action: "edite",
      entityType: "Profil",
      entityId: user.id,
      userId: user.id,
      details: {
        action: "changement_mot_de_passe_finalise",
        email: user.email,
      },
    });

    res.json({ message: "Renouvellement du mot de passe et profil synchronisés avec succès" });
  } catch (error: any) {
    console.error("Finalize password change error:", error);
    res.status(500).json({ error: "Erreur interne lors de la finalisation du mot de passe" });
  }
};
