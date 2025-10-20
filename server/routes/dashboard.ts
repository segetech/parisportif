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

export const handleDashboardData: RequestHandler = async (req, res) => {
  try {
    const supabaseClient = getSupabaseClient();
    const { start, end, userId, role } = req.query;

    let txQuery = supabaseClient.from("transactions").select("*");
    let betsQuery = supabaseClient.from("bets").select("*");

    if (start && end) {
      txQuery = txQuery.gte("date", start as string).lte("date", end as string);
      betsQuery = betsQuery
        .gte("date", start as string)
        .lte("date", end as string);
    }

    // If agent, filter by creator
    if (role === "AGENT" && userId) {
      txQuery = txQuery.eq("created_by", userId as string);
      betsQuery = betsQuery.eq("created_by", userId as string);
    }

    const [{ data: txData }, { data: betsData }] = await Promise.all([
      txQuery,
      betsQuery,
    ]);

    res.json({
      transactions: txData || [],
      bets: betsData || [],
    });
  } catch (error: any) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  }
};
