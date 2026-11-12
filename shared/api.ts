/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

export type AiAnalysisFocus = "general" | "transactions" | "anomalies" | "illegal";

export interface AiAnalysisRequest {
  periodStart?: string;
  periodEnd?: string;
  focus?: AiAnalysisFocus;
}

export interface AiMetricsSnapshot {
  totalBets: number;
  totalTransactions: number;
  totalAmountFcfa: number;
  pendingValidations: number;
  rejectedCount: number;
  illegalBetsCount: number;
  illegalTransactionsCount: number;
}

export interface AiAnalysisResponse {
  summary: string;
  highlights: string[];
  anomalies: string[];
  recommendations: string[];
  model: string;
  generatedAt: string;
  metricsSnapshot: AiMetricsSnapshot;
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  periodStart?: string;
  periodEnd?: string;
}

export interface AiChatResponse {
  reply: string;
  model: string;
}
