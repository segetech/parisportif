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

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({
        error: "Le nouveau mot de passe doit comporter au moins 6 caractères",
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

    // Update password with the admin client
    const admin = getSupabaseAdmin();
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
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
