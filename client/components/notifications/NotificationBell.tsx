import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";

dayjs.extend(relativeTime);
dayjs.locale("fr");

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  operation_type: string | null;
  operation_id: string | null;
  read: boolean;
  created_at: string;
}

function getReadOpIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`ps.read_notifs.${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadOpIds(userId: string, ids: string[]) {
  try {
    const existing = getReadOpIds(userId);
    ids.forEach((id) => existing.add(id));
    localStorage.setItem(
      `ps.read_notifs.${userId}`,
      JSON.stringify(Array.from(existing).slice(-200))
    );
  } catch {
    // ignore storage errors
  }
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    loadNotifications();

    const interval = window.setInterval(() => {
      loadNotifications();
    }, 60_000);

    // S'abonner aux nouvelles notifications en temps réel
    const channel = supabase
      .channel(`notifications-${user.id}`)
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
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (open && user) {
      loadNotifications();
    }
  }, [open]);

  async function loadNotifications() {
    if (!user) return;

    const readOpIds = getReadOpIds(user.id);
    const isReviewer = user.role === "ADMIN" || user.role === "CONTROLEUR";

    const [notifRes, betsRes, txRes] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      isReviewer
        ? supabase
            .from("bets")
            .select("id, operator, bet_type, amount, created_at, validation_status")
            .eq("validation_status", "en_attente")
            .order("created_at", { ascending: false })
            .limit(8)
        : supabase
            .from("bets")
            .select("id, operator, bet_type, amount, created_at, validation_status")
            .eq("created_by", user.id)
            .in("validation_status", ["valide", "refuse", "en_attente"])
            .order("created_at", { ascending: false })
            .limit(8),
      isReviewer
        ? supabase
            .from("transactions")
            .select("id, operator, type, amount, created_at, validation_status")
            .eq("validation_status", "en_attente")
            .order("created_at", { ascending: false })
            .limit(8)
        : supabase
            .from("transactions")
            .select("id, operator, type, amount, created_at, validation_status")
            .eq("created_by", user.id)
            .in("validation_status", ["valide", "refuse", "en_attente"])
            .order("created_at", { ascending: false })
            .limit(8),
    ]);

    if (notifRes.error) {
      console.error("Erreur chargement notifications:", notifRes.error);
    }

    const dbNotifications: Notification[] = Array.isArray(notifRes.data)
      ? notifRes.data
      : [];

    const opNotifications: Notification[] = [];

    if (Array.isArray(betsRes.data)) {
      for (const row of betsRes.data) {
        const status = row.validation_status || "en_attente";
        const id = `op-bet-${row.id}-${status}`;
        const amountStr = Number(row.amount || 0).toLocaleString("fr-FR");
        const type =
          status === "valide"
            ? "validated"
            : status === "refuse"
              ? "rejected"
              : "new_operation";
        const title = isReviewer
          ? `Test en attente — ${row.operator || "Opérateur"}`
          : status === "valide"
            ? `Test validé — ${row.operator || "Opérateur"}`
            : status === "refuse"
              ? `Test refusé — ${row.operator || "Opérateur"}`
              : `Test soumis — ${row.operator || "Opérateur"}`;
        opNotifications.push({
          id,
          type,
          title,
          message: `${row.bet_type || "Test"} (${amountStr} F CFA)`,
          operation_type: "bets",
          operation_id: String(row.id),
          read: readOpIds.has(id),
          created_at: row.created_at || new Date().toISOString(),
        });
      }
    }

    if (Array.isArray(txRes.data)) {
      for (const row of txRes.data) {
        const status = row.validation_status || "en_attente";
        const id = `op-tx-${row.id}-${status}`;
        const amountStr = Number(row.amount || 0).toLocaleString("fr-FR");
        const txLabel = row.type === "retrait" ? "Retrait" : "Dépôt";
        const type =
          status === "valide"
            ? "validated"
            : status === "refuse"
              ? "rejected"
              : "new_operation";
        const title = isReviewer
          ? `${txLabel} en attente — ${row.operator || "Opérateur"}`
          : status === "valide"
            ? `${txLabel} validé — ${row.operator || "Opérateur"}`
            : status === "refuse"
              ? `${txLabel} refusé — ${row.operator || "Opérateur"}`
              : `${txLabel} soumis — ${row.operator || "Opérateur"}`;
        opNotifications.push({
          id,
          type,
          title,
          message: `${txLabel} de ${amountStr} F CFA`,
          operation_type: "transactions",
          operation_id: String(row.id),
          read: readOpIds.has(id),
          created_at: row.created_at || new Date().toISOString(),
        });
      }
    }

    const merged = [...dbNotifications, ...opNotifications]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 25);

    setNotifications(merged);
    setUnreadCount(merged.filter((n) => !n.read).length);
  }

  async function markAsRead(notificationId: string) {
    if (!user) return;

    if (notificationId.startsWith("op-")) {
      saveReadOpIds(user.id, [notificationId]);
      setNotifications((prev) => {
        const next = prev.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        );
        setUnreadCount(next.filter((n) => !n.read).length);
        return next;
      });
      return;
    }

    await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId);

    loadNotifications();
  }

  async function markAllAsRead() {
    if (!user) return;

    const opIds = notifications
      .filter((n) => n.id.startsWith("op-") && !n.read)
      .map((n) => n.id);
    if (opIds.length > 0) {
      saveReadOpIds(user.id, opIds);
    }

    await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("read", false);

    loadNotifications();
  }

  function handleNotificationClick(notification: Notification) {
    markAsRead(notification.id);
    setOpen(false);

    // Naviguer vers la page appropriée
    if (notification.operation_type && notification.operation_id) {
      if (user?.role === "CONTROLEUR" || user?.role === "ADMIN") {
        navigate("/validation");
      } else {
        // Pour les agents, naviguer vers la page de l'opération
        const pageMap: Record<string, string> = {
          bets: "/tests",
          transactions: "/transactions",
          venues: "/venues",
        };
        navigate(pageMap[notification.operation_type] || "/");
      }
    }
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case "validated":
        return "✅";
      case "rejected":
        return "❌";
      case "modified":
        return "✏️";
      case "new_operation":
        return "📋";
      default:
        return "🔔";
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>Aucune notification</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                    !notification.read ? "bg-blue-50" : ""
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex gap-3">
                    <div className="text-2xl">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {dayjs(notification.created_at).fromNow()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
