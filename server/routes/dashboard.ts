import { RequestHandler } from "express";
import { getSupabaseAdmin } from "../lib/supabase-admin";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

export const handleDashboardData: RequestHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const admin = getSupabaseAdmin();
    const { start, end, agentId } = req.query;

    let txQuery = admin.from("transactions").select("*");
    let betsQuery = admin.from("bets").select("*");

    // Optional safe date filtering
    if (typeof start === "string" && typeof end === "string") {
      if (ISO_DATE_REGEX.test(start) && ISO_DATE_REGEX.test(end)) {
        txQuery = txQuery.gte("date", start).lte("date", end);
        betsQuery = betsQuery.gte("date", start).lte("date", end);
      }
    }

    // Role-based data isolation
    if (user.role === "AGENT") {
      // Agents can ONLY access their own records
      txQuery = txQuery.eq("created_by", user.id);
      betsQuery = betsQuery.eq("created_by", user.id);
    } else if ((user.role === "ADMIN" || user.role === "CONTROLEUR") && typeof agentId === "string" && agentId) {
      // Admins and Controllers can optionally filter by a specific agent
      txQuery = txQuery.eq("created_by", agentId);
      betsQuery = betsQuery.eq("created_by", agentId);
    }

    const [{ data: txData, error: txError }, { data: betsData, error: betsError }] =
      await Promise.all([txQuery, betsQuery]);

    if (txError) {
      console.error("Dashboard transactions query error:", txError);
      return res.status(500).json({ error: "Erreur lors de la récupération des transactions" });
    }

    if (betsError) {
      console.error("Dashboard bets query error:", betsError);
      return res.status(500).json({ error: "Erreur lors de la récupération des tests" });
    }

    const transactions = txData || [];
    const bets = betsData || [];

    const totalBets = bets.length;
    const totalTransactions = transactions.length;
    const totalAmount = bets.reduce((sum: number, b: any) => sum + (Number(b.amount_fcfa) || 0), 0);
    const pendingValidations = bets.filter((b: any) => b.validation_status === "en_attente").length;

    res.json({
      transactions,
      bets,
      stats: {
        totalBets,
        totalTransactions,
        totalAmount,
        pendingValidations,
      },
    });
  } catch (error: any) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};
