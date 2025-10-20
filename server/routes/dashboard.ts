import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const handleDashboardData: RequestHandler = async (req, res) => {
  try {
    const { start, end, userId, role } = req.query;

    let txQuery = supabase.from("transactions").select("*");
    let betsQuery = supabase.from("bets").select("*");

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
