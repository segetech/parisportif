import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, generatePasswordResetToken, generatePasswordResetLink } from "../lib/email";

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

// In-memory token store (in production, use a database table)
const resetTokens = new Map<
  string,
  { email: string; userId: string; expiresAt: number }
>();

export const handleForgotPassword: RequestHandler = async (req, res) => {
  try {
    const supabaseClient = getSupabaseClient();
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const emailLower = email.toLowerCase();

    // Check if user exists
    const { data: user, error } = await supabaseClient
      .from("users")
      .select("id, nom, prenom, email")
      .eq("email", emailLower)
      .single();

    if (error || !user) {
      // Don't reveal if email exists for security
      return res.json({
        message: "Si cet email existe, un lien de réinitialisation sera envoyé.",
      });
    }

    // Generate reset token (valid for 1 hour)
    const token = generatePasswordResetToken();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    resetTokens.set(token, { email: emailLower, userId: user.id, expiresAt });

    // Generate reset link
    const baseUrl = process.env.APP_URL || "http://localhost:8080";
    const resetLink = generatePasswordResetLink(token, baseUrl);

    // Send email
    await sendEmail({
      to: emailLower,
      subject: "Réinitialiser votre mot de passe",
      html: `
        <h2>Réinitialisation de mot de passe</h2>
        <p>Bonjour ${user.nom} ${user.prenom || ""},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p><a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #1f9e64; color: white; text-decoration: none; border-radius: 5px;">Réinitialiser le mot de passe</a></p>
        <p>Ou copiez ce lien dans votre navigateur:</p>
        <p><code>${resetLink}</code></p>
        <p>Ce lien expirera dans 1 heure.</p>
        <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      `,
    });

    res.json({
      message: "Un lien de réinitialisation a été envoyé à votre adresse email.",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};

export const handleResetPassword: RequestHandler = async (req, res) => {
  try {
    const supabaseClient = getSupabaseClient();
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token and password required" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters long",
      });
    }

    // Validate token
    const tokenData = resetTokens.get(token);

    if (!tokenData) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(token);
      return res.status(400).json({ error: "Reset link has expired" });
    }

    // Update password in Supabase auth
    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      tokenData.userId,
      { password }
    );

    if (updateError) {
      throw updateError;
    }

    // Delete used token
    resetTokens.delete(token);

    res.json({ message: "Password reset successfully" });
  } catch (error: any) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};
