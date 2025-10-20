import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, generatePasswordResetToken } from "../lib/email";
import crypto from "crypto";

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
}

// In-memory store for temporary passwords (use DB in production)
const tempPasswords = new Map<
  string,
  { password: string; expiresAt: number; email: string }
>();

function generateTemporaryPassword(): string {
  return crypto.randomBytes(8).toString("hex").toUpperCase();
}

export const handleCreateUserWithPassword: RequestHandler = async (
  req,
  res,
) => {
  try {
    const supabaseClient = getSupabaseClient();
    const { nom, prenom, email, role, sendEmail: shouldSendEmail } = req.body;

    if (!nom || !email || !role) {
      return res.status(400).json({
        error: "nom, email, and role are required",
      });
    }

    const emailLower = email.toLowerCase();

    // Check if user already exists
    const { data: existing } = await supabaseClient
      .from("users")
      .select("id")
      .eq("email", emailLower);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const temporaryPassword = generateTemporaryPassword();

    // Create Supabase auth user
    const { data: authData, error: authError } =
      await supabaseClient.auth.admin.createUser({
        email: emailLower,
        password: temporaryPassword,
        user_metadata: { nom, role },
      });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Create user record
    const now = new Date().toISOString();
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .insert({
        id: authData.user.id,
        nom: nom.trim(),
        prenom: prenom ? prenom.trim() : null,
        email: emailLower,
        role,
        statut: shouldSendEmail ? "invitation_envoyee" : "actif",
        cree_le: now,
        mis_a_jour_le: now,
      })
      .select()
      .single();

    if (userError) {
      // Clean up auth user if DB insert fails
      await supabaseClient.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: userError.message });
    }

    // Store temporary password for later retrieval
    tempPasswords.set(authData.user.id, {
      password: temporaryPassword,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      email: emailLower,
    });

    // Send email if requested
    if (shouldSendEmail) {
      const baseUrl = process.env.APP_URL || "http://localhost:8080";
      const loginUrl = `${baseUrl}/login`;

      await sendEmail({
        to: emailLower,
        subject: "Bienvenue - Vos identifiants d'accès",
        html: `
          <h2>Bienvenue ${nom}!</h2>
          <p>Un compte a été créé pour vous.</p>
          <p><strong>Email:</strong> ${emailLower}</p>
          <p><strong>Mot de passe temporaire:</strong> <code>${temporaryPassword}</code></p>
          <p><strong>Rôle:</strong> ${role}</p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #1f9e64; color: white; text-decoration: none; border-radius: 5px;">Se connecter</a></p>
          <p>Veuillez changer votre mot de passe après votre première connexion.</p>
        `,
      });
    }

    res.status(201).json({
      user: userData,
      temporaryPassword: shouldSendEmail ? undefined : temporaryPassword,
      message: shouldSendEmail
        ? "User created and invitation sent via email"
        : "User created successfully",
    });
  } catch (error: any) {
    console.error("Create user error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};

export const handleResetUserPassword: RequestHandler = async (req, res) => {
  try {
    const supabaseClient = getSupabaseClient();
    const { userId, sendEmail: shouldSendEmail } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get user
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("id, nom, prenom, email")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      return res.status(400).json({ error: "User not found" });
    }

    const temporaryPassword = generateTemporaryPassword();

    // Update password in Supabase
    const { error: updateError } =
      await supabaseClient.auth.admin.updateUserById(userId, {
        password: temporaryPassword,
      });

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Store temporary password
    tempPasswords.set(userId, {
      password: temporaryPassword,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      email: userData.email,
    });

    // Send email if requested
    if (shouldSendEmail) {
      const baseUrl = process.env.APP_URL || "http://localhost:8080";
      const loginUrl = `${baseUrl}/login`;

      await sendEmail({
        to: userData.email,
        subject: "Réinitialisation de mot de passe",
        html: `
          <h2>Réinitialisation de mot de passe</h2>
          <p>Bonjour ${userData.nom} ${userData.prenom || ""},</p>
          <p>Votre mot de passe a été réinitialisé par un administrateur.</p>
          <p><strong>Nouveau mot de passe temporaire:</strong> <code>${temporaryPassword}</code></p>
          <p><a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #1f9e64; color: white; text-decoration: none; border-radius: 5px;">Se connecter</a></p>
          <p>Veuillez changer votre mot de passe après votre connexion.</p>
        `,
      });
    }

    res.json({
      temporaryPassword: shouldSendEmail ? undefined : temporaryPassword,
      message: shouldSendEmail
        ? "Password reset and sent via email"
        : "Password reset successfully",
    });
  } catch (error: any) {
    console.error("Reset user password error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};

export const handleGetTemporaryPassword: RequestHandler = async (req, res) => {
  try {
    const { userId } = req.params;

    const stored = tempPasswords.get(userId);

    if (!stored) {
      return res.status(404).json({ error: "No temporary password found" });
    }

    if (Date.now() > stored.expiresAt) {
      tempPasswords.delete(userId);
      return res.status(410).json({ error: "Temporary password has expired" });
    }

    res.json({ password: stored.password });
    tempPasswords.delete(userId); // Clear after retrieval
  } catch (error: any) {
    console.error("Get temp password error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};
