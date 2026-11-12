import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  AiAnalysisFocus,
  AiAnalysisRequest,
  AiAnalysisResponse,
  AiChatMessage,
  AiChatRequest,
  AiChatResponse,
} from "@shared/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

export function AiAssistantPanel() {
  const [focus, setFocus] = useState<AiAnalysisFocus>("general");
  const [analysis, setAnalysis] = useState<AiAnalysisResponse | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");

  const analyzeMutation = useMutation({
    mutationFn: async (payload: AiAnalysisRequest) => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'analyse IA");
      }
      return data as AiAnalysisResponse;
    },
    onSuccess: (data) => {
      setAnalysis(data);
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (payload: AiChatRequest) => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'envoi du message");
      }
      return data as AiChatResponse;
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    const nextMessages: AiChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    chatMutation.mutate({ messages: nextMessages });
  };

  return (
    <Card className="border-[#D8E6DB] bg-white shadow-sm">
      <CardHeader className="border-b border-[#E8F0EA] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#006B2D] text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-[#17251C] sm:text-lg">
                Assistant &amp; Analyses IA (ChatGPT)
              </CardTitle>
              <CardDescription className="text-xs text-[#556B5C]">
                Synthèse automatique des données, détection d&apos;anomalies et questions en langage naturel.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="border-[#D8E6DB] bg-[#F4F8F5] text-[#006B2D]">
            <Sparkles className="mr-1 h-3 w-3" />
            Serveur sécurisé
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        <Tabs defaultValue="analyze" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-[#F4F8F5]">
            <TabsTrigger value="analyze">Analyse structurée</TabsTrigger>
            <TabsTrigger value="chat">Assistant Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="analyze" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={focus} onValueChange={(v) => setFocus(v as AiAnalysisFocus)}>
                <SelectTrigger className="w-[220px] border-[#D8E6DB]">
                  <SelectValue placeholder="Axe d'analyse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Analyse générale</SelectItem>
                  <SelectItem value="transactions">Flux &amp; Transactions</SelectItem>
                  <SelectItem value="anomalies">Anomalies &amp; Rejets</SelectItem>
                  <SelectItem value="illegal">Activités illégales</SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={() => analyzeMutation.mutate({ focus })}
                disabled={analyzeMutation.isPending}
                className="bg-[#006B2D] text-white hover:bg-[#005524]"
              >
                {analyzeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Lancer l&apos;analyse IA
                  </>
                )}
              </Button>
            </div>

            {analyzeMutation.isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {(analyzeMutation.error as Error).message}
              </div>
            )}

            {analysis && (
              <div className="space-y-4 pt-2">
                <div className="rounded-lg border border-[#D8E6DB] bg-[#F8FBF9] p-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#006B2D]">
                      Synthèse ({analysis.model})
                    </span>
                    <span className="text-xs text-[#556B5C]">
                      {new Date(analysis.generatedAt).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#17251C]">{analysis.summary}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-[#D8E6DB] bg-white p-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#17251C]">
                      <TrendingUp className="h-4 w-4 text-[#006B2D]" />
                      Points clés
                    </h4>
                    <ul className="space-y-1.5 text-xs text-[#3D5245]">
                      {analysis.highlights.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#006B2D]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Anomalies &amp; Alertes
                    </h4>
                    <ul className="space-y-1.5 text-xs text-amber-950">
                      {analysis.anomalies.map((item, idx) => (
                        <li key={idx}>• {item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <Lightbulb className="h-4 w-4 text-slate-700" />
                      Recommandations
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {analysis.recommendations.map((item, idx) => (
                        <li key={idx}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="chat" className="space-y-4">
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-[#D8E6DB] bg-[#F8FBF9] p-4">
              {messages.length === 0 ? (
                <p className="text-center text-xs text-[#556B5C]">
                  Posez une question sur vos paris, transactions, validations en attente ou activités illégales.
                </p>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3.5 py-2 text-sm whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-[#006B2D] text-white"
                          : "border border-[#D8E6DB] bg-white text-[#17251C]"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg border border-[#D8E6DB] bg-white px-3.5 py-2 text-xs text-[#556B5C]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Réflexion en cours...
                  </div>
                </div>
              )}
            </div>

            {chatMutation.isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {(chatMutation.error as Error).message}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ex: Quels sont les points d'attention actuels sur les validations ?"
                className="border-[#D8E6DB]"
                disabled={chatMutation.isPending}
              />
              <Button
                type="submit"
                disabled={!input.trim() || chatMutation.isPending}
                className="bg-[#006B2D] text-white hover:bg-[#005524]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
