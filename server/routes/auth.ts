import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const handleLogin: RequestHandler = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const emailLower = email.toLowerCase();

    // Try to sign in
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: emailLower,
      password,
    });

    if (signInError) {
      if (signInError.message.includes("Invalid login credentials")) {
        return res.status(401).json({ error: "Identifiants invalides" });
      }
      return res.status(400).json({ error: signInError.message });
    }

    if (!signInData.user) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    // Get user record from users table
    const { data: userRecord, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", signInData.user.id)
      .single();

    if (userError) {
      return res.status(400).json({ error: "User record not found" });
    }

    // Update last login
    await supabase
      .from("users")
      .update({ derniere_connexion: dayjs().toISOString() })
      .eq("id", signInData.user.id);

    // Return user data and session token
    res.json({
      user: userRecord,
      session: signInData.session,
    });
  } catch (error: any) {
    console.error("Auth error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};
