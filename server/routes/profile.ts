import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";

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

// Middleware to check if user is authenticated
export function requireAuth(req: any, res: any, next: any) {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
}

export const handleUpdateProfile: RequestHandler = async (req, res) => {
  try {
    const supabaseClient = getSupabaseClient();
    const userId = (req as any).userId;
    const { nom, prenom } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({ error: "Nom is required" });
    }

    // Get current session to verify user identity
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const { data, error } = await supabaseClient
      .from("users")
      .update({
        nom: nom.trim(),
        prenom: prenom && prenom.trim() ? prenom.trim() : null,
      })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ user: data });
  } catch (error: any) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};

export const handleChangePassword: RequestHandler = async (req, res) => {
  try {
    const supabaseClient = getSupabaseClient();
    const userId = (req as any).userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Current and new password required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "New password must be at least 6 characters",
      });
    }

    // Get user email
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("email")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      return res.status(400).json({ error: "User not found" });
    }

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabaseClient.auth.signInWithPassword(
      {
        email: userData.email,
        password: currentPassword,
      },
    );

    if (signInError) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Update password
    const { error: updateError } =
      await supabaseClient.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    res.json({ message: "Password changed successfully" });
  } catch (error: any) {
    console.error("Change password error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};
