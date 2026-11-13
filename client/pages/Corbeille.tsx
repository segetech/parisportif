import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { RequireAuth, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, RotateCcw, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import {
  useRolePermissions,
  useTrashOperations,
} from "@/hooks/use-data-queries";
import {
  hardDeleteOperationRecord,
  restoreFromTrashRecord,
} from "@/lib/operation-archive";
import { supabase } from "@/lib/supabase";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { toast } from "sonner";

type TrashKind = "bets" | "transactions" | "venues";

interface TrashItem {
  kind: TrashKind;
  id: string;
  title: string;
  subtitle: string;
  amountLabel?: string;
  deleted_at: string;
  purge_after?: string | null;
  delete_reason?: string | null;
  validation_status?: string;
  created_by?: string | null;
}

function daysRemaining(purgeAfter?: string | null, deletedAt?: string): number {
  const target = purgeAfter
    ? dayjs(purgeAfter)
    : deletedAt
      ? dayjs(deletedAt).add(30, "day")
      : dayjs().add(30, "day");
  const diff = Math.ceil(target.diff(dayjs(), "hour") / 24);
  return Math.max(0, diff);
}

export default function Corbeille() {
  const { user } = useAuth();
  const { data, isLoading, isFetching, refetch } = useTrashOperations();
  const { data: rolePerms } = useRolePermissions();
  const [activeTab, setActiveTab] = useState<"all" | TrashKind>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmHardId, setConfirmHardId] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";
  const isControleur = user?.role === "CONTROLEUR";
  const controleurCanRestore = Boolean(
    rolePerms?.CONTROLEUR?.includes("restore_records"),
  );

  const items = useMemo<TrashItem[]>(() => {
    const out: TrashItem[] = [];
    for (const b of data?.bets || []) {
      out.push({
        kind: "bets",
        id: b.id,
        title: `Test — ${b.operator || "—"}`,
        subtitle: `${b.date || "—"} ${b.time || ""} · ${b.bet_type || "Test"} · ${b.ticket_ref || "Sans réf."}`,
        amountLabel: `${Number(b.amount_fcfa || 0).toLocaleString("fr-FR")} FCFA`,
        deleted_at: b.deleted_at,
        purge_after: b.purge_after,
        delete_reason: b.delete_reason,
        validation_status: b.validation_status,
        created_by: b.created_by,
      });
    }
    for (const t of data?.transactions || []) {
      out.push({
        kind: "transactions",
        id: t.id,
        title: `${t.type || "Transaction"} — ${t.operator || "—"}`,
        subtitle: `${t.date || "—"} ${t.time || ""} · ${t.payment_operator || t.mode || "Paiement"}`,
        amountLabel: `${Number(t.amount_fcfa || 0).toLocaleString("fr-FR")} FCFA`,
        deleted_at: t.deleted_at,
        purge_after: t.purge_after,
        delete_reason: t.delete_reason,
        validation_status: t.validation_status,
        created_by: t.created_by,
      });
    }
    for (const v of data?.venues || []) {
      out.push({
        kind: "venues",
        id: v.id,
        title: `Salle — ${v.operator || "—"}`,
        subtitle: `Quartier ${v.quartier || v.quartier_no || "—"} · ${v.address || ""}`,
        deleted_at: v.deleted_at,
        purge_after: v.purge_after,
        delete_reason: v.delete_reason,
        validation_status: v.validation_status,
        created_by: v.created_by,
      });
    }
    return out.sort(
      (a, b) =>
        new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
    );
  }, [data]);

  const filteredItems = useMemo(
    () =>
      activeTab === "all"
        ? items
        : items.filter((item) => item.kind === activeTab),
    [items, activeTab],
  );

  function canRestoreItem(item: TrashItem) {
    if (isAdmin) return true;
    if (isControleur) return controleurCanRestore;
    return (
      user?.role === "AGENT" &&
      item.created_by === user?.id &&
      item.validation_status === "brouillon"
    );
  }

  async function handleRestore(item: TrashItem) {
    setBusyId(item.id);
    try {
      await restoreFromTrashRecord(item.kind, item.id);
    } finally {
      setBusyId(null);
    }
  }

  async function handleHardDelete(item: TrashItem) {
    setBusyId(item.id);
    try {
      const ok = await hardDeleteOperationRecord(
        item.kind,
        item.id,
        "Suppression manuelle depuis la corbeille",
      );
      if (ok) setConfirmHardId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePurgeExpired() {
    try {
      const { data: purged, error } = await supabase.rpc("purge_expired_trash");
      if (error) throw error;
      invalidateRelatedQueries("validation");
      toast.success(
        Number(purged || 0) > 0
          ? `${purged} élément(s) expiré(s) purgé(s)`
          : "Aucun élément expiré à purger",
      );
      void refetch();
    } catch (err: any) {
      toast.error(err?.message || "Impossible de purger la corbeille");
    }
  }

  return (
    <RequireAuth>
      <AppLayout>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Trash2 className="h-6 w-6 text-rose-600" />
                Corbeille (conservation 30 jours)
              </h1>
              <p className="text-sm text-muted-foreground">
                Les éléments supprimés sont conservés 30 jours avant suppression automatique.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`}
                />
                Actualiser
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handlePurgeExpired()}
                  className="border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  <AlertTriangle className="h-4 w-4 mr-1.5" />
                  Purger les expirés
                </Button>
              )}
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "all" | TrashKind)}
          >
            <TabsList>
              <TabsTrigger value="all">Tout ({items.length})</TabsTrigger>
              <TabsTrigger value="bets">
                Tests ({data?.bets?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="transactions">
                Transactions ({data?.transactions?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="venues">
                Salles ({data?.venues?.length || 0})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {filteredItems.length} élément(s) dans la corbeille
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Chargement de la corbeille...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  La corbeille est vide.
                </div>
              ) : (
                <div className="divide-y">
                  {filteredItems.map((item) => {
                    const days = daysRemaining(item.purge_after, item.deleted_at);
                    const restorable = canRestoreItem(item);
                    const isBusy = busyId === item.id;
                    return (
                      <div
                        key={`${item.kind}-${item.id}`}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {item.title}
                            </span>
                            {item.amountLabel && (
                              <Badge variant="secondary" className="font-mono text-xs">
                                {item.amountLabel}
                              </Badge>
                            )}
                            {item.validation_status === "brouillon" && (
                              <Badge variant="outline" className="text-xs">
                                Brouillon
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className="text-xs border-amber-200 bg-amber-50 text-amber-900 gap-1"
                            >
                              <Clock className="h-3 w-3" />
                              {days === 0
                                ? "Expire aujourd'hui"
                                : `Suppression dans ${days} j`}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.subtitle}
                          </p>
                          <p className="text-xs text-slate-500">
                            Mis en corbeille le{" "}
                            {dayjs(item.deleted_at).format("DD/MM/YYYY à HH:mm")}
                            {item.delete_reason ? ` · Motif : ${item.delete_reason}` : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {restorable && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy}
                              onClick={() => void handleRestore(item)}
                              className="border-[#B8DEC6] text-[#006B2D] hover:bg-[#E8F5EC]"
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                              Restaurer
                            </Button>
                          )}
                          {isAdmin &&
                            (confirmHardId === item.id ? (
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => setConfirmHardId(null)}
                                >
                                  Annuler
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={isBusy}
                                  onClick={() => void handleHardDelete(item)}
                                >
                                  Confirmer
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => setConfirmHardId(item.id)}
                                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                Supprimer définitivement
                              </Button>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    </RequireAuth>
  );
}
