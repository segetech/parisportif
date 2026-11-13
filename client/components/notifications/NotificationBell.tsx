import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Edit3,
  Mail,
  ShieldAlert,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  resolveNotificationTarget,
  sendTestNotificationEmail,
} from "@/lib/notification-navigation";

interface Notification {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string;
  operation_type: string | null;
  operation_id: string | null;
  reference?: string | null;
  read: boolean;
  created_at: string;
  read_at: string | null;
}

type BellFilter = "all" | "unread" | "action_required" | "decision";

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [activeFilter, setActiveFilter] = useState<BellFilter>("all");
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("open_read_synth_notifs");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const isReviewer = user?.role === "ADMIN" || user?.role === "CONTROLEUR";

  const persistLocalRead = useCallback((ids: Set<string>) => {
    try {
      const arr = Array.from(ids).slice(-120);
      localStorage.setItem("open_read_synth_notifs", JSON.stringify(arr));
    } catch {
      // ignore storage errors
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // 1. Load persistent DB notifications for this user
      const { data: dbNotifs } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);

      const rawPersisted: Notification[] = (dbNotifs || []).map((n) => ({
        ...n,
        read: Boolean(n.read),
      }));

      // Dédupliquer les notifications persistantes pour une même opération (privilégier la version enrichie)
      const dedupedMap = new Map<string, Notification>();
      const persisted: Notification[] = [];
      for (const n of rawPersisted) {
        if (!n.operation_id) {
          persisted.push(n);
          continue;
        }
        const key = `${n.operation_id}:${n.type}`;
        const existing = dedupedMap.get(key);
        if (!existing) {
          dedupedMap.set(key, n);
          persisted.push(n);
        } else {
          const existingIsGeneric =
            existing.message === "Une nouvelle opération nécessite votre validation";
          const currentIsGeneric =
            n.message === "Une nouvelle opération nécessite votre validation";
          if (existingIsGeneric && !currentIsGeneric) {
            const idx = persisted.indexOf(existing);
            if (idx !== -1) persisted[idx] = n;
            dedupedMap.set(key, n);
          }
        }
      }

      // Track existing (operation_id + type) pairs to avoid duplicates with synthetic items
      const existingKeys = new Set(
        persisted
          .filter((n) => n.operation_id)
          .map((n) => `${n.operation_id}:${n.type}`),
      );

      // 2. Synthesize recent operational activity with correct `amount_fcfa` column
      const betsQuery = isReviewer
        ? supabase
            .from("bets")
            .select(
              "id, operator, bet_type, amount_fcfa, reference, created_at, validation_status",
            )
            .eq("validation_status", "en_attente")
            .order("created_at", { ascending: false })
            .limit(8)
        : supabase
            .from("bets")
            .select(
              "id, operator, bet_type, amount_fcfa, reference, created_at, validation_status",
            )
            .eq("created_by", user.id)
            .in("validation_status", ["valide", "refuse"])
            .order("created_at", { ascending: false })
            .limit(8);

      const txQuery = isReviewer
        ? supabase
            .from("transactions")
            .select(
              "id, operator, type, amount_fcfa, reference, created_at, validation_status",
            )
            .eq("validation_status", "en_attente")
            .order("created_at", { ascending: false })
            .limit(8)
        : supabase
            .from("transactions")
            .select(
              "id, operator, type, amount_fcfa, reference, created_at, validation_status",
            )
            .eq("created_by", user.id)
            .in("validation_status", ["valide", "refuse"])
            .order("created_at", { ascending: false })
            .limit(8);

      const illegalBetsQuery = isReviewer
        ? supabase
            .from("illegal_bets")
            .select("id, operator, amount_fcfa, created_at")
            .order("created_at", { ascending: false })
            .limit(4)
        : null;

      const illegalTxQuery = isReviewer
        ? supabase
            .from("illegal_transactions")
            .select("id, operator, type, amount_fcfa, created_at")
            .order("created_at", { ascending: false })
            .limit(4)
        : null;

      const [betsRes, txRes, illBetsRes, illTxRes] = await Promise.all([
        betsQuery,
        txQuery,
        illegalBetsQuery ?? Promise.resolve({ data: null }),
        illegalTxQuery ?? Promise.resolve({ data: null }),
      ]);

      const synthesized: Notification[] = [];

      if (betsRes.data) {
        for (const b of betsRes.data) {
          const notifType = isReviewer
            ? "new_operation"
            : b.validation_status === "valide"
              ? "validated"
              : "rejected";
          if (existingKeys.has(`${b.id}:${notifType}`)) continue;

          const synthId = `op-bet-${b.id}-${b.validation_status}`;
          const amountFormatted = Number(b.amount_fcfa || 0).toLocaleString(
            "fr-FR",
          );
          synthesized.push({
            id: synthId,
            user_id: user.id,
            type: notifType,
            title: isReviewer
              ? `Test en attente • ${b.operator}`
              : b.validation_status === "valide"
                ? `Test validé • ${b.operator}`
                : `Test refusé • ${b.operator}`,
            message: `${b.bet_type || "Pari"} de ${amountFormatted} FCFA${b.reference ? ` (Réf: ${b.reference})` : ""}`,
            operation_type: "bets",
            operation_id: b.id,
            reference: b.reference,
            read: localReadIds.has(synthId),
            created_at: b.created_at,
            read_at: null,
          });
        }
      }

      if (txRes.data) {
        for (const t of txRes.data) {
          const notifType = isReviewer
            ? "new_operation"
            : t.validation_status === "valide"
              ? "validated"
              : "rejected";
          if (existingKeys.has(`${t.id}:${notifType}`)) continue;

          const synthId = `op-tx-${t.id}-${t.validation_status}`;
          const amountFormatted = Number(t.amount_fcfa || 0).toLocaleString(
            "fr-FR",
          );
          synthesized.push({
            id: synthId,
            user_id: user.id,
            type: notifType,
            title: isReviewer
              ? `Transaction en attente • ${t.operator}`
              : t.validation_status === "valide"
                ? `Transaction validée • ${t.operator}`
                : `Transaction refusée • ${t.operator}`,
            message: `${t.type || "Opération"} de ${amountFormatted} FCFA${t.reference ? ` (Réf: ${t.reference})` : ""}`,
            operation_type: "transactions",
            operation_id: t.id,
            reference: t.reference,
            read: localReadIds.has(synthId),
            created_at: t.created_at,
            read_at: null,
          });
        }
      }

      if (illBetsRes.data) {
        for (const ib of illBetsRes.data) {
          if (existingKeys.has(`${ib.id}:new_operation`)) continue;
          const synthId = `op-illbet-${ib.id}`;
          const amountFormatted = Number(ib.amount_fcfa || 0).toLocaleString(
            "fr-FR",
          );
          synthesized.push({
            id: synthId,
            user_id: user.id,
            type: "illegal_alert",
            title: `Pari illégal signalé • ${ib.operator}`,
            message: `Signalement de ${amountFormatted} FCFA sur ${ib.operator}`,
            operation_type: "illegal_bets",
            operation_id: ib.id,
            read: localReadIds.has(synthId),
            created_at: ib.created_at,
            read_at: null,
          });
        }
      }

      if (illTxRes.data) {
        for (const it of illTxRes.data) {
          if (existingKeys.has(`${it.id}:new_operation`)) continue;
          const synthId = `op-illtx-${it.id}`;
          const amountFormatted = Number(it.amount_fcfa || 0).toLocaleString(
            "fr-FR",
          );
          synthesized.push({
            id: synthId,
            user_id: user.id,
            type: "illegal_alert",
            title: `Flux illégal signalé • ${it.operator}`,
            message: `${it.type || "Transaction"} illégale de ${amountFormatted} FCFA`,
            operation_type: "illegal_tx",
            operation_id: it.id,
            read: localReadIds.has(synthId),
            created_at: it.created_at,
            read_at: null,
          });
        }
      }

      const combined = [...persisted, ...synthesized]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 35);

      setNotifications(combined);
    } catch (error) {
      console.error("Erreur lors du chargement des notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isReviewer, localReadIds]);

  useEffect(() => {
    if (!user?.id) return;
    loadNotifications();

    const interval = setInterval(loadNotifications, 45000);
    const channel = supabase
      .channel(`notifications-bell-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications();
        },
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadNotifications]);

  const markAsRead = async (notif: Notification) => {
    if (notif.read) return;

    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
    );

    if (notif.id.startsWith("op-")) {
      setLocalReadIds((prev) => {
        const next = new Set(prev);
        next.add(notif.id);
        persistLocalRead(next);
        return next;
      });
      return;
    }

    try {
      await supabase
        .from("notifications")
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("id", notif.id);
    } catch (error) {
      console.error("Erreur lors du marquage comme lu:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;

    const unreadDbIds = notifications
      .filter((n) => !n.read && !n.id.startsWith("op-"))
      .map((n) => n.id);

    const unreadSynthIds = notifications
      .filter((n) => !n.read && n.id.startsWith("op-"))
      .map((n) => n.id);

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    if (unreadSynthIds.length > 0) {
      setLocalReadIds((prev) => {
        const next = new Set(prev);
        unreadSynthIds.forEach((id) => next.add(id));
        persistLocalRead(next);
        return next;
      });
    }

    if (unreadDbIds.length > 0) {
      try {
        await supabase
          .from("notifications")
          .update({ read: true, read_at: new Date().toISOString() })
          .in("id", unreadDbIds);
      } catch (error) {
        console.error("Erreur lors du marquage global:", error);
      }
    }

    toast.success("Toutes les notifications marquées comme lues");
  };

  const handleNotificationClick = (notif: Notification) => {
    const target = resolveNotificationTarget(notif, user?.role);
    setOpen(false);
    navigate(target.path);
    void markAsRead(notif);
  };

  const handleSendTestEmail = async () => {
    setTestingEmail(true);
    try {
      const result = await sendTestNotificationEmail();
      if (!result.success) {
        toast.error(result.error || "Échec du test de notification");
        return;
      }

      if (result.emailSent) {
        toast.success(
          `Notification créée & email Resend envoyé à ${result.emailResult?.to}`,
        );
      } else if (result.emailResult?.restricted) {
        toast.info(
          "Notification in-app créée ! Mode test Resend actif : vérifiez un domaine sur Resend pour envoyer à d'autres adresses que le propriétaire du compte.",
          { duration: 6000 },
        );
      } else {
        toast.warning(
          `Notification in-app créée, mais email non envoyé : ${result.emailResult?.error || "Vérifiez la clé Resend"}`,
        );
      }

      await loadNotifications();
    } finally {
      setTestingEmail(false);
    }
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      if (activeFilter === "unread") return !notif.read;
      const target = resolveNotificationTarget(notif, user?.role);
      if (activeFilter === "action_required") {
        return (
          target.category === "action_required" || target.category === "alert"
        );
      }
      if (activeFilter === "decision") {
        return target.category === "decision";
      }
      return true;
    });
  }, [notifications, activeFilter, user?.role]);

  const getNotificationIcon = (notif: Notification) => {
    if (
      notif.type === "illegal_alert" ||
      notif.operation_type?.includes("illegal")
    ) {
      return <ShieldAlert className="h-4 w-4 text-rose-600" />;
    }
    switch (notif.type) {
      case "new_operation":
        return <Clock className="h-4 w-4 text-amber-600" />;
      case "validated":
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case "rejected":
        return <XCircle className="h-4 w-4 text-rose-600" />;
      case "modified":
        return <Edit3 className="h-4 w-4 text-blue-600" />;
      default:
        return <Bell className="h-4 w-4 text-slate-600" />;
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours} h`;
    if (diffDays === 1) return "Hier";
    return `Il y a ${diffDays} j`;
  };

  if (!user) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          loadNotifications();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="relative h-9 w-9 rounded-full hover:bg-[#EBF3ED] text-slate-700"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center px-1 text-[10px] font-bold bg-[#006B2D] text-white border border-white"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] sm:w-[410px] p-0 border-[#D8E6DB] bg-white shadow-lg"
        align="end"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D8E6DB] bg-[#004D20] text-white rounded-t-md">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#FFD000]" />
              Centre de Notifications
            </h3>
            <p className="text-[11px] text-emerald-100 mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} notification(s) non lue(s)`
                : "Tout est à jour"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="h-7 text-xs text-white hover:bg-[#006B2D] hover:text-white px-2"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Tout lire
            </Button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#D8E6DB] bg-[#F5F8F5] overflow-x-auto">
          {(
            [
              { id: "all", label: "Toutes" },
              { id: "unread", label: "Non lues" },
              { id: "action_required", label: "À traiter" },
              { id: "decision", label: "Décisions" },
            ] as Array<{ id: BellFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap",
                activeFilter === tab.id
                  ? "bg-[#006B2D] text-white"
                  : "bg-white text-slate-600 border border-[#D8E6DB] hover:bg-emerald-50",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ScrollArea className="h-[340px]">
          {loading && notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Chargement des notifications...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-slate-700">
                Aucune notification dans cette catégorie
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Les créations, validations et alertes apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E7EFE9]">
              {filteredNotifications.map((notif) => {
                const target = resolveNotificationTarget(notif, user.role);
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={cn(
                      "p-3.5 hover:bg-[#F5F8F5] transition-colors cursor-pointer group",
                      !notif.read && "bg-emerald-50/70",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0 p-1.5 rounded-full bg-white border border-[#D8E6DB]">
                        {getNotificationIcon(notif)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-xs font-semibold text-slate-900 leading-snug",
                              !notif.read && "text-[#004D20]",
                            )}
                          >
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="h-2 w-2 rounded-full bg-[#006B2D] flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[#D8E6DB] text-[10px] font-semibold text-[#006B2D] group-hover:bg-[#006B2D] group-hover:text-white transition-colors">
                            {target.label}
                            <ArrowRight className="h-2.5 w-2.5" />
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500">
                              {formatTimeAgo(notif.created_at)}
                            </span>
                            {!notif.read && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notif);
                                }}
                                title="Marquer comme lu"
                                className="p-0.5 rounded hover:bg-emerald-100 text-slate-500 hover:text-[#006B2D]"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-[#D8E6DB] bg-[#F5F8F5] rounded-b-md">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testingEmail}
            onClick={handleSendTestEmail}
            className="h-7 text-xs border-[#D8E6DB] bg-white hover:bg-emerald-50 text-[#004D20]"
          >
            {testingEmail ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Mail className="h-3 w-3 mr-1.5 text-[#006B2D]" />
            )}
            Tester mail Resend
          </Button>
          {isReviewer && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                navigate("/validation");
              }}
              className="h-7 text-xs text-[#006B2D] hover:bg-emerald-100"
            >
              Centre de validation
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
