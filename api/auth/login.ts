import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";

let supabase: ReturnType<typeof createClient<any>> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    supabase = createClient<any>(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseClient = getSupabaseClient();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const emailLower = email.toLowerCase();

    // Try to sign in
    const { data: signInData, error: signInError } =
      await supabaseClient.auth.signInWithPassword({
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
    const { data: userRecord, error: userError } = await supabaseClient
      .from("users")
      .select("*")
      .eq("id", signInData.user.id)
      .single();

    if (userError) {
      return res.status(400).json({ error: "User record not found" });
    }

    // Update last login
    await supabaseClient
      .from("users")
      .update({ derniere_connexion: dayjs().toISOString() } as any)
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
}
