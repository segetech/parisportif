import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { dispatchAppNotification } from "@/lib/notification-navigation";
import {
  DEFAULT_ACTIVITY_PAGE_SIZE,
  OperationCommentItem,
  OperationHistoryItem,
  OperationType,
  fetchOperationCommentsPage,
  fetchOperationHistoryPage,
  generateClientRequestId,
  mergeConfirmedComment,
  mergeFetchedComments,
  sortCommentsDeterministically,
  sortHistoryDeterministically,
  submitOperationCommentRpc,
  formatHistoryFieldLabel,
  formatHistoryFieldValue,
} from "@/lib/operation-activity";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  History,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

export interface OperationCommentsPanelProps {
  operationType: OperationType;
  operationId: string;
  operator?: string;
  amountFcfa?: number;
  reference?: string;
  authorId?: string | null;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getRoleLabel(role?: string): string | null {
  if (role === "ADMIN") return "Admin";
  if (role === "CONTROLEUR") return "Contrôleur";
  if (role === "AGENT") return "Agent";
  return null;
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    created: "Création",
    modified: "Modification",
    validated: "Validation",
    rejected: "Refus",
    reopened: "Réouverture",
    créé: "Création",
    modifié: "Modification",
    validé: "Validation",
    refusé: "Refus",
  };
  return map[action] || action;
}

function getStatusLabel(status?: string | null): string {
  if (!status) return "";
  const map: Record<string, string> = {
    en_attente: "En attente",
    valide: "Validé",
    refuse: "Refusé",
  };
  return map[status] || status;
}

export function OperationCommentsPanel({
  operationType,
  operationId,
  operator,
  amountFcfa,
  reference,
  authorId,
}: OperationCommentsPanelProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"comments" | "history">("comments");
  const [comments, setComments] = useState<OperationCommentItem[]>([]);
  const [history, setHistory] = useState<OperationHistoryItem[]>([]);
  const [commentsTotal, setCommentsTotal] = useState<number>(0);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [draftByOp, setDraftByOp] = useState<Record<string, string>>({});
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "subscribed" | "degraded"
  >("connecting");

  const opKey = `${operationType}:${operationId}`;
  const newComment = draftByOp[opKey] ?? "";
  const setNewComment = useCallback(
    (value: string) => {
      setDraftByOp((prev) => ({ ...prev, [opKey]: value }));
    },
    [opKey],
  );

  const activeOpKeyRef = useRef(opKey);
  const commentsSeqRef = useRef(0);
  const historySeqRef = useRef(0);
  const inFlightSubmitRef = useRef(false);
  const activeAttemptKeyRef = useRef<string | null>(null);

  const isControllerOrAdmin =
    user?.role === "ADMIN" || user?.role === "CONTROLEUR";
  const isAgent = user?.role === "AGENT";

  useEffect(() => {
    activeOpKeyRef.current = opKey;
    commentsSeqRef.current += 1;
    historySeqRef.current += 1;
    inFlightSubmitRef.current = false;
    activeAttemptKeyRef.current = null;
    setComments([]);
    setHistory([]);
    setCommentsTotal(0);
    setHistoryTotal(0);
    setHasMoreComments(false);
    setHasMoreHistory(false);
    setCommentsError(null);
    setHistoryError(null);
    setIsInternalNote(false);
  }, [opKey]);

  const loadComments = useCallback(
    async (options?: { append?: boolean; offset?: number }) => {
      if (!operationId) return;
      const targetKey = `${operationType}:${operationId}`;
      const seq = ++commentsSeqRef.current;
      const append = Boolean(options?.append);
      const offset = options?.offset ?? 0;

      if (append) {
        setLoadingMoreComments(true);
      } else {
        setLoadingComments(true);
      }

      try {
        const page = await fetchOperationCommentsPage({
          operationType,
          operationId,
          offset,
          limit: DEFAULT_ACTIVITY_PAGE_SIZE,
          isAgent,
        });

        if (activeOpKeyRef.current !== targetKey || commentsSeqRef.current !== seq) {
          return;
        }

        setCommentsError(null);
        setCommentsTotal(page.totalCount);
        setHasMoreComments(page.hasMore);
        setComments((prev) =>
          mergeFetchedComments(prev, page.items, operationType, operationId, append),
        );
      } catch (err: any) {
        if (activeOpKeyRef.current !== targetKey || commentsSeqRef.current !== seq) {
          return;
        }
        setCommentsError(
          err?.message || "Impossible de charger les commentaires.",
        );
      } finally {
        if (activeOpKeyRef.current === targetKey && commentsSeqRef.current === seq) {
          setLoadingComments(false);
          setLoadingMoreComments(false);
        }
      }
    },
    [isAgent, operationId, operationType],
  );

  const loadHistory = useCallback(
    async (options?: { append?: boolean; offset?: number }) => {
      if (!operationId) return;
      const targetKey = `${operationType}:${operationId}`;
      const seq = ++historySeqRef.current;
      const append = Boolean(options?.append);
      const offset = options?.offset ?? 0;

      if (append) {
        setLoadingMoreHistory(true);
      } else {
        setLoadingHistory(true);
      }

      try {
        const page = await fetchOperationHistoryPage({
          operationType,
          operationId,
          offset,
          limit: DEFAULT_ACTIVITY_PAGE_SIZE,
        });

        if (activeOpKeyRef.current !== targetKey || historySeqRef.current !== seq) {
          return;
        }

        setHistoryError(null);
        setHistoryTotal(page.totalCount);
        setHasMoreHistory(page.hasMore);
        setHistory((prev) => {
          if (!append) return page.items;
          const byId = new Map<string, OperationHistoryItem>();
          for (const h of prev) byId.set(h.id, h);
          for (const h of page.items) byId.set(h.id, h);
          return sortHistoryDeterministically(Array.from(byId.values()));
        });
      } catch (err: any) {
        if (activeOpKeyRef.current !== targetKey || historySeqRef.current !== seq) {
          return;
        }
        setHistoryError(
          err?.message || "Impossible de charger l'historique des modifications.",
        );
      } finally {
        if (activeOpKeyRef.current === targetKey && historySeqRef.current === seq) {
          setLoadingHistory(false);
          setLoadingMoreHistory(false);
        }
      }
    },
    [operationId, operationType],
  );

  useEffect(() => {
    void loadComments();
    void loadHistory();

    if (!operationId || typeof supabase.channel !== "function") {
      setRealtimeStatus("degraded");
      return;
    }

    setRealtimeStatus("connecting");
    const targetKey = `${operationType}:${operationId}`;
    const channel = supabase
      .channel(`operation-activity-${operationType}-${operationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operation_comments",
          filter: `operation_id=eq.${operationId}`,
        },
        (payload: any) => {
          if (activeOpKeyRef.current !== targetKey) return;
          const record = payload?.new;
          if (record && record.operation_type && record.operation_type !== operationType) {
            return;
          }
          if (payload?.eventType === "INSERT" && record?.id) {
            if (isAgent && record.is_internal) return;
            void loadComments();
          } else {
            void loadComments();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operation_history",
          filter: `operation_id=eq.${operationId}`,
        },
        (payload: any) => {
          if (activeOpKeyRef.current !== targetKey) return;
          const record = payload?.new;
          if (record && record.operation_type && record.operation_type !== operationType) {
            return;
          }
          void loadHistory();
        },
      )
      .subscribe((status: string) => {
        if (activeOpKeyRef.current !== targetKey) return;
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("subscribed");
          // Rattrapage systématique après confirmation d'abonnement (évite le trou entre fetch initial et subscribe)
          void loadComments();
          void loadHistory();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeStatus("degraded");
        }
      });

    const handleOnline = () => {
      if (activeOpKeyRef.current !== targetKey) return;
      void loadComments();
      void loadHistory();
    };
    const handleOffline = () => {
      if (activeOpKeyRef.current !== targetKey) return;
      setRealtimeStatus("degraded");
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
      if (typeof supabase.removeChannel === "function") {
        void supabase.removeChannel(channel);
      }
    };
  }, [isAgent, loadComments, loadHistory, operationId, operationType]);

  // Rattrapage périodique discret uniquement lorsque le temps réel est indisponible
  useEffect(() => {
    if (realtimeStatus !== "degraded" || !operationId) return;
    const timer = setInterval(() => {
      void loadComments();
      void loadHistory();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadComments, loadHistory, operationId, realtimeStatus]);

  const sendCommentAttempt = useCallback(
    async (params: {
      text: string;
      isInternal: boolean;
      clientRequestId: string;
      clearDraftOnStart: boolean;
    }) => {
      if (!user || !operationId || inFlightSubmitRef.current) return;
      const targetKey = `${operationType}:${operationId}`;
      const { text, isInternal, clientRequestId, clearDraftOnStart } = params;

      inFlightSubmitRef.current = true;
      activeAttemptKeyRef.current = clientRequestId;
      setSubmitting(true);

      const optimisticItem: OperationCommentItem = {
        id: `pending-${clientRequestId}`,
        operation_type: operationType,
        operation_id: operationId,
        user_id: user.id,
        comment: text,
        is_internal: isInternal,
        created_at: new Date().toISOString(),
        client_request_id: clientRequestId,
        user_name:
          `${user.prenom || ""} ${user.nom || ""}`.trim() ||
          user.email ||
          "Vous",
        user_role: user.role,
        deliveryStatus: "sending",
      };

      setComments((prev) => {
        const filtered = prev.filter(
          (c) => c.client_request_id !== clientRequestId && c.id !== optimisticItem.id,
        );
        return sortCommentsDeterministically([...filtered, optimisticItem]);
      });

      if (clearDraftOnStart) {
        setDraftByOp((prev) => ({ ...prev, [targetKey]: "" }));
      }

      try {
        const confirmed = await submitOperationCommentRpc({
          operationType,
          operationId,
          comment: text,
          isInternal,
          clientRequestId,
          user,
        });

        if (activeOpKeyRef.current === targetKey) {
          setComments((prev) => mergeConfirmedComment(prev, confirmed));
          setCommentsTotal((prev) => Math.max(prev, 1));
          setDraftByOp((prev) =>
            prev[targetKey] === text ? { ...prev, [targetKey]: "" } : prev,
          );
          toast.success("Commentaire envoyé");
        }

        if (!isInternal) {
          void dispatchAppNotification({
            eventType: "operation_reviewed",
            operationType,
            operationId,
            status: "comment",
            operator: operator || "Opérateur",
            amountFcfa,
            reference,
            authorId,
            notes: text,
          });
        }
      } catch (error: any) {
        const errMsg = error?.message || "Échec de l'envoi";
        if (activeOpKeyRef.current === targetKey) {
          setComments((prev) =>
            prev.map((c) =>
              c.client_request_id === clientRequestId
                ? {
                    ...c,
                    deliveryStatus: "failed",
                    errorMessage: errMsg,
                  }
                : c,
            ),
          );
          if (clearDraftOnStart) {
            setDraftByOp((prev) =>
              prev[targetKey] ? prev : { ...prev, [targetKey]: text },
            );
          }
          toast.error("Échec de l'envoi du commentaire");
        }
      } finally {
        inFlightSubmitRef.current = false;
        activeAttemptKeyRef.current = null;
        setSubmitting(false);
      }
    },
    [
      amountFcfa,
      authorId,
      operationId,
      operationType,
      operator,
      reference,
      user,
    ],
  );

  const handleSubmit = async () => {
    const text = newComment.trim();
    if (!text || !user || !operationId || inFlightSubmitRef.current) return;
    const clientRequestId = generateClientRequestId();
    await sendCommentAttempt({
      text,
      isInternal: isControllerOrAdmin && isInternalNote,
      clientRequestId,
      clearDraftOnStart: true,
    });
  };

  const handleRetryFailedComment = async (item: OperationCommentItem) => {
    if (!item.client_request_id || inFlightSubmitRef.current) return;
    await sendCommentAttempt({
      text: item.comment,
      isInternal: item.is_internal,
      clientRequestId: item.client_request_id,
      clearDraftOnStart: false,
    });
  };

  const displayedCommentsCount = Math.max(comments.length, commentsTotal);
  const displayedHistoryCount = Math.max(history.length, historyTotal);

  return (
    <div className="space-y-3 pt-4 border-t border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("comments")}
            className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "comments"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-[#006B2D]" />
            Commentaires ({displayedCommentsCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "history"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <History className="h-3.5 w-3.5 text-[#006B2D]" />
            Historique ({displayedHistoryCount})
          </button>
        </div>

        {realtimeStatus === "degraded" && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            <WifiOff className="h-3 w-3 shrink-0" />
            <span>Temps réel indisponible</span>
            <button
              type="button"
              onClick={() => {
                void loadComments();
                void loadHistory();
              }}
              className="underline font-semibold hover:text-amber-900 ml-1"
              aria-label="Actualiser manuellement"
            >
              Actualiser
            </button>
          </div>
        )}
      </div>

      {activeTab === "comments" ? (
        <div className="space-y-3">
          {commentsError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
            >
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {commentsError}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadComments()}
                className="h-7 px-2 text-xs border-rose-300 text-rose-800 hover:bg-rose-100"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Réessayer
              </Button>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            {loadingComments && comments.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Chargement des commentaires...
              </div>
            ) : comments.length === 0 && !commentsError ? (
              <p className="text-xs text-slate-500 text-center py-3">
                Aucun commentaire pour cette opération.
              </p>
            ) : (
              <>
                {comments.map((c) => {
                  const roleLabel = getRoleLabel(c.user_role);
                  const isSending = c.deliveryStatus === "sending";
                  const isFailed = c.deliveryStatus === "failed";
                  const isOwnComment = Boolean(user?.id && c.user_id === user.id);
                  return (
                    <div
                      key={c.id}
                      className={`flex w-full ${
                        isOwnComment ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`w-fit max-w-[88%] sm:max-w-[78%] rounded-2xl border px-3 py-2 text-sm shadow-2xs ${
                          isOwnComment ? "rounded-tr-sm" : "rounded-tl-sm"
                        } ${
                          isFailed
                            ? "border-rose-300 bg-rose-50"
                            : isSending
                              ? "border-amber-200 bg-amber-50"
                              : isOwnComment
                                ? "border-[#B8DEC6] bg-[#E8F5EC]"
                                : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-xs text-slate-900">
                              {c.user_name}
                            </span>
                            {roleLabel && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white/80">
                                {roleLabel}
                              </Badge>
                            )}
                            {c.is_internal && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 border-amber-300 bg-amber-50 text-amber-800 gap-0.5"
                              >
                                <Lock className="h-2.5 w-2.5" />
                                Interne
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isSending && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 border-amber-300 bg-amber-100 text-amber-900"
                              >
                                Envoi…
                              </Badge>
                            )}
                            {isFailed && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 border-rose-300 bg-rose-100 text-rose-900"
                              >
                                Échec de l&apos;envoi
                              </Badge>
                            )}
                            <span className="text-[11px] text-slate-500">
                              {formatDateTime(c.created_at)}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-800 whitespace-pre-wrap break-words">
                          {c.comment}
                        </p>
                        {isFailed && (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-rose-700">
                              {c.errorMessage || "Impossible d'envoyer le message."}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={submitting}
                              onClick={() => void handleRetryFailedComment(c)}
                              className="h-7 px-2 text-xs border-rose-300 text-rose-800 hover:bg-rose-100"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Réessayer
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {hasMoreComments && (
                  <div className="pt-1 text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loadingMoreComments}
                      onClick={() =>
                        void loadComments({
                          append: true,
                          offset: comments.length,
                        })
                      }
                      className="h-8 text-xs"
                    >
                      {loadingMoreComments ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : null}
                      Charger plus ({comments.length}/{commentsTotal})
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            {isControllerOrAdmin && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <Lock className="h-3 w-3 text-amber-700" />
                Note interne (contrôleurs et administrateurs uniquement)
              </label>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Textarea
                placeholder="Écrire un commentaire ou une précision..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                rows={2}
                maxLength={2000}
                className="min-h-[48px] text-sm resize-none"
                aria-label="Nouveau commentaire"
              />
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || !newComment.trim()}
                className="min-h-[44px] sm:self-end bg-[#006B2D] hover:bg-[#004D20] text-white shrink-0"
                aria-label="Envoyer le commentaire"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 sm:mr-1.5" />
                    <span className="sm:inline">Envoyer</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {historyError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
            >
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {historyError}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadHistory()}
                className="h-7 px-2 text-xs border-rose-300 text-rose-800 hover:bg-rose-100"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Réessayer
              </Button>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            {loadingHistory && history.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Chargement de l&apos;historique...
              </div>
            ) : history.length === 0 && !historyError ? (
              <p className="text-xs text-slate-500 text-center py-3">
                Aucune modification enregistrée pour cette opération.
              </p>
            ) : (
              <>
                {history.map((entry) => {
                  const changedKeys = entry.changes?.after
                    ? Object.keys(entry.changes.after)
                    : [];
                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[11px]">
                            {getActionLabel(entry.action)}
                          </Badge>
                          <span className="font-semibold text-xs text-slate-900">
                            {entry.user_name}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {formatDateTime(entry.modified_at || entry.created_at)}
                        </span>
                      </div>
                      {entry.previous_status &&
                        entry.new_status &&
                        entry.previous_status !== entry.new_status && (
                          <p className="text-xs text-slate-700">
                            Statut :{" "}
                            <span className="font-medium">
                              {getStatusLabel(entry.previous_status)}
                            </span>{" "}
                            →{" "}
                            <span className="font-medium">
                              {getStatusLabel(entry.new_status)}
                            </span>
                          </p>
                        )}
                      {entry.changes?.before && changedKeys.length > 0 && (
                        <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                          {changedKeys.slice(0, 5).map((key) => (
                            <div key={key} className="truncate">
                              <span className="font-medium text-slate-700">
                                {formatHistoryFieldLabel(key)}
                              </span>{" "}
                              :{" "}
                              <span className="line-through text-slate-400">
                                {formatHistoryFieldValue(key, entry.changes?.before?.[key])}
                              </span>{" "}
                              →{" "}
                              <span className="font-medium text-slate-900">
                                {formatHistoryFieldValue(key, entry.changes?.after?.[key])}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {entry.comment && (
                        <p className="text-xs text-slate-600 italic mt-1">
                          {entry.comment}
                        </p>
                      )}
                    </div>
                  );
                })}
                {hasMoreHistory && (
                  <div className="pt-1 text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loadingMoreHistory}
                      onClick={() =>
                        void loadHistory({
                          append: true,
                          offset: history.length,
                        })
                      }
                      className="h-8 text-xs"
                    >
                      {loadingMoreHistory ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : null}
                      Charger plus ({history.length}/{historyTotal})
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
