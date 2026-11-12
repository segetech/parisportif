import { RequestHandler } from "express";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { AuthenticatedUser } from "../types/auth";
import type {
  AiAnalysisResponse,
  AiChatResponse,
  AiMetricsSnapshot,
} from "@shared/api";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

const AnalyzeRequestSchema = z.object({
  periodStart: z.string().regex(ISO_DATE_REGEX).optional(),
  periodEnd: z.string().regex(ISO_DATE_REGEX).optional(),
  focus: z.enum(["general", "transactions", "anomalies", "illegal"]).optional().default("general"),
});

const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(20),
  periodStart: z.string().regex(ISO_DATE_REGEX).optional(),
  periodEnd: z.string().regex(ISO_DATE_REGEX).optional(),
});

const AnalysisOutputSchema = z.object({
  summary: z.string().describe("Synthèse claire et concise de la situation sur la période"),
  highlights: z.array(z.string()).describe("Points clés et tendances observées"),
  anomalies: z.array(z.string()).describe("Anomalies, alertes ou risques détectés"),
  recommendations: z.array(z.string()).describe("Actions concrètes recommandées"),
});

function getOpenAIConfig(): { client: OpenAI; model: string } | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your-openai-api-key-here") {
    return null;
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return {
    client: new OpenAI({ apiKey }),
    model,
  };
}

interface AggregatedContext {
  snapshot: AiMetricsSnapshot;
  breakdown: {
    betsByStatus: Record<string, number>;
    transactionsByStatus: Record<string, number>;
    transactionsByType: Record<string, { count: number; totalFcfa: number }>;
    topOperators: Array<{ name: string; count: number; totalFcfa: number }>;
  };
}

function countBy<T extends Record<string, any>>(items: T[], key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const val = String(item[key] || "non_specifie");
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

async function fetchAggregatedContext(
  user: AuthenticatedUser,
  periodStart?: string,
  periodEnd?: string
): Promise<AggregatedContext> {
  const admin = getSupabaseAdmin();

  let txQuery = admin.from("transactions").select("id, date, type, amount_fcfa, validation_status, operator, created_by");
  let betsQuery = admin.from("bets").select("id, date, amount_fcfa, validation_status, operator, created_by");
  let illegalBetsQuery = admin.from("illegal_bets").select("id, date, created_by");
  let illegalTxQuery = admin.from("illegal_transactions").select("id, date, created_by");

  if (periodStart && periodEnd) {
    txQuery = txQuery.gte("date", periodStart).lte("date", periodEnd);
    betsQuery = betsQuery.gte("date", periodStart).lte("date", periodEnd);
    illegalBetsQuery = illegalBetsQuery.gte("date", periodStart).lte("date", periodEnd);
    illegalTxQuery = illegalTxQuery.gte("date", periodStart).lte("date", periodEnd);
  }

  if (user.role === "AGENT") {
    txQuery = txQuery.eq("created_by", user.id);
    betsQuery = betsQuery.eq("created_by", user.id);
    illegalBetsQuery = illegalBetsQuery.eq("created_by", user.id);
    illegalTxQuery = illegalTxQuery.eq("created_by", user.id);
  }

  const [txRes, betsRes, illegalBetsRes, illegalTxRes] = await Promise.all([
    txQuery,
    betsQuery,
    illegalBetsQuery,
    illegalTxQuery,
  ]);

  if (txRes.error) throw new Error(`Transactions query failed: ${txRes.error.message}`);
  if (betsRes.error) throw new Error(`Bets query failed: ${betsRes.error.message}`);

  const transactions = txRes.data || [];
  const bets = betsRes.data || [];
  const illegalBets = illegalBetsRes.data || [];
  const illegalTransactions = illegalTxRes.data || [];

  const totalAmountFcfa =
    bets.reduce((sum, b) => sum + (Number(b.amount_fcfa) || 0), 0) +
    transactions.reduce((sum, t) => sum + (Number(t.amount_fcfa) || 0), 0);

  const pendingValidations =
    bets.filter((b) => b.validation_status === "en_attente").length +
    transactions.filter((t) => t.validation_status === "en_attente").length;

  const rejectedCount =
    bets.filter((b) => b.validation_status === "rejete").length +
    transactions.filter((t) => t.validation_status === "rejete").length;

  const transactionsByType: Record<string, { count: number; totalFcfa: number }> = {};
  for (const tx of transactions) {
    const typeKey = String(tx.type || "autre");
    if (!transactionsByType[typeKey]) {
      transactionsByType[typeKey] = { count: 0, totalFcfa: 0 };
    }
    transactionsByType[typeKey].count += 1;
    transactionsByType[typeKey].totalFcfa += Number(tx.amount_fcfa) || 0;
  }

  const operatorMap = new Map<string, { count: number; totalFcfa: number }>();
  for (const item of [...bets, ...transactions]) {
    const op = String(item.operator || "Inconnu");
    const current = operatorMap.get(op) || { count: 0, totalFcfa: 0 };
    current.count += 1;
    current.totalFcfa += Number(item.amount_fcfa) || 0;
    operatorMap.set(op, current);
  }

  const topOperators = Array.from(operatorMap.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.totalFcfa - a.totalFcfa)
    .slice(0, 8);

  return {
    snapshot: {
      totalBets: bets.length,
      totalTransactions: transactions.length,
      totalAmountFcfa,
      pendingValidations,
      rejectedCount,
      illegalBetsCount: illegalBets.length,
      illegalTransactionsCount: illegalTransactions.length,
    },
    breakdown: {
      betsByStatus: countBy(bets, "validation_status"),
      transactionsByStatus: countBy(transactions, "validation_status"),
      transactionsByType,
      topOperators,
    },
  };
}

export const handleAiAnalyze: RequestHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const config = getOpenAIConfig();
    if (!config) {
      return res.status(503).json({
        error:
          "Clé API OpenAI non configurée. Ajoutez OPENAI_API_KEY dans le fichier .env côté serveur.",
      });
    }

    const parsed = AnalyzeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres d'analyse invalides", details: parsed.error.flatten() });
    }

    const { periodStart, periodEnd, focus } = parsed.data;
    const context = await fetchAggregatedContext(user, periodStart, periodEnd);

    const completion = await config.client.chat.completions.parse({
      model: config.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Tu es un analyste expert en conformité, contrôle des paris sportifs et flux financiers (FCFA). " +
            "Réponds toujours en français, de manière factuelle, concise et actionnable, uniquement à partir des métriques fournies.",
        },
        {
          role: "user",
          content: JSON.stringify({
            focus,
            period: periodStart && periodEnd ? { start: periodStart, end: periodEnd } : "toutes_periodes",
            roleScope: user.role,
            metrics: context,
          }),
        },
      ],
      response_format: zodResponseFormat(AnalysisOutputSchema, "pari_sportif_analysis"),
    });

    const result = completion.choices[0]?.message?.parsed;
    if (!result) {
      return res.status(502).json({ error: "Réponse IA vide ou invalide" });
    }

    const response: AiAnalysisResponse = {
      summary: result.summary ?? "",
      highlights: result.highlights ?? [],
      anomalies: result.anomalies ?? [],
      recommendations: result.recommendations ?? [],
      model: config.model,
      generatedAt: new Date().toISOString(),
      metricsSnapshot: context.snapshot,
    };

    res.json(response);
  } catch (error: any) {
    console.error("AI analyze error:", error);
    res.status(500).json({ error: error?.message || "Erreur lors de l'analyse IA" });
  }
};

export const handleAiChat: RequestHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const config = getOpenAIConfig();
    if (!config) {
      return res.status(503).json({
        error:
          "Clé API OpenAI non configurée. Ajoutez OPENAI_API_KEY dans le fichier .env côté serveur.",
      });
    }

    const parsed = ChatRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Requête de chat invalide", details: parsed.error.flatten() });
    }

    const { messages, periodStart, periodEnd } = parsed.data;
    const context = await fetchAggregatedContext(user, periodStart, periodEnd);

    const completion = await config.client.chat.completions.create({
      model: config.model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Tu es l'assistant IA intégré à la plateforme de contrôle des paris sportifs. " +
            "Réponds en français, de manière claire et structurée, en t'appuyant sur les données agrégées ci-dessous. " +
            "Si une information n'est pas disponible dans le contexte, indique-le honnêtement sans inventer de chiffres.\n\n" +
            `Contexte agrégé (${user.role}): ${JSON.stringify(context)}`,
        },
        ...messages.map((m) =>
          m.role === "assistant"
            ? { role: "assistant" as const, content: m.content ?? "" }
            : { role: "user" as const, content: m.content ?? "" }
        ),
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ error: "Aucune réponse générée par le modèle" });
    }

    const response: AiChatResponse = {
      reply,
      model: config.model,
    };

    res.json(response);
  } catch (error: any) {
    console.error("AI chat error:", error);
    res.status(500).json({ error: error?.message || "Erreur lors de la discussion IA" });
  }
};
