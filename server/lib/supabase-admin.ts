import { createClient, SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient<any, "public", any> | null = null;

export function getSupabaseUrl(): string {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL environment variable");
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY environment variable");
  }
  return key;
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }
  return key;
}

/**
 * Returns a privileged Supabase client with the service role key.
 * Configured with persistSession: false to prevent session leaking across requests.
 */
export function getSupabaseAdmin(): SupabaseClient<any, "public", any> {
  if (!adminClient) {
    const url = getSupabaseUrl();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

/**
 * Creates an unprivileged client with anon key.
 * Used for authenticating individual users (signInWithPassword, etc.)
 * without mutating or sharing session state on the admin client.
 */
export function createAnonClient(): SupabaseClient<any, "public", any> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
