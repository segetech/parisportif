import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RequireAuth, RequireRole } from "@/context/AuthContext";
import { useAuth } from "@/context/AuthContext";
import {
  CheckCircle,
  XCircle,
  Clock,
  Edit,
  History,
  MessageSquare,
  Filter,
  Archive,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  useValidationOperations,
  useValidateOperation,
  usePendingValidationCounts,
} from "@/hooks/use-data-queries";
import { supabase } from "@/lib/supabase";
import { dispatchAppNotification } from "@/lib/notification-navigation";
import { OperationCommentsPanel } from "@/components/common/OperationCommentsPanel";
import { ProofPreview } from "@/components/common/ProofPreview";
import type { OperationType } from "@/lib/operation-activity";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";

interface Operation {
  id: string;
  date?: string;
  time?: string;
  operator?: string;
  support?: string;
  platform?: string;
  payment_operator?: string;
  amount_fcfa?: number;
  validation_status: string;
  created_by: string;
  created_at: string;
  validation_notes?: string;
  notes?: string;
  reference?: string;
  phone?: string;
  phone_number?: string;
  contact_phone?: string;
  proof_status?: string;
  ticket_url?: string;
  proof_attachment_url?: string;
  edit_unlocked_until?: string | null;
  refusal_fields?: string[] | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  // Bet specific
  bet_type?: string;
  status?: string;
  amount_won_fcfa?: number;
  // Transaction specific
  type?: string;
  // Venue specific
  quartier?: string;
  address?: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  modified_by: string;
  modified_at: string;
  created_at?: string;
  comment: string | null;
  user_name?: string;
}

interface Comment {
  id: string;
  operation_id?: string;
  user_id: string;
  comment: string;
  is_internal?: boolean;
  created_at: string;
  user_name?: string;
}

export default function ValidationPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get("tab");
  const initialStatus = searchParams.get("status");
  const highlightedId = searchParams.get("id");

  const [activeTab, setActiveTab] = useState(
    initialTab === "transactions" || initialTab === "venues" || initialTab === "bets"
      ? initialTab
      : "bets"
  );
  const [filterStatus, setFilterStatus] = useState(
    initialStatus === "valide" ||
      initialStatus === "refuse" ||
      initialStatus === "en_attente" ||
      initialStatus === "archived" ||
      initialStatus === "all"
      ? initialStatus
      : "en_attente"
  );

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const statusParam = searchParams.get("status");
    if (
      tabParam === "bets" ||
      tabParam === "transactions" ||
      tabParam === "venues"
    ) {
      setActiveTab(tabParam);
    }
    if (
      statusParam === "en_attente" ||
      statusParam === "valide" ||
      statusParam === "refuse" ||
      statusParam === "archived" ||
      statusParam === "all"
    ) {
      setFilterStatus(statusParam);
    }
  }, [searchParams]);

  const [validationDialog, setValidationDialog] = useState<{
    operation: Operation;
    type: string;
  } | null>(null);

  const [validationAction, setValidationAction] = useState<"valide" | "refuse" | "modify">("valide");
  const [validationNotes, setValidationNotes] = useState("");
  const [refusalFields, setRefusalFields] = useState<string[]>([]);
  const [grantingUnlock, setGrantingUnlock] = useState<number | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [confirmHardDelete, setConfirmHardDelete] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [modifiedData, setModifiedData] = useState<Partial<Operation>>({});

  const [historyDialog, setHistoryDialog] = useState<{
    operationId: string;
    type: string;
  } | null>(null);

  // Centralisation TanStack React Query pour navigation instantanée
  const { data: operations = [], isLoading, isFetching, refetch } = useValidationOperations(
    activeTab as "bets" | "transactions" | "venues",
    filterStatus
  );
  const { data: pendingCounts } = usePendingValidationCounts(true);
  const validateMutation = useValidateOperation();

  useEffect(() => {
    if (!highlightedId || operations.length === 0) return;
    const el = document.getElementById(`validation-op-${highlightedId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedId, operations]);

  function openValidationDialog(operation: Operation, type: string) {
    setValidationDialog({ operation, type });
    setValidationAction("valide");
    setValidationNotes("");
    setRefusalFields(Array.isArray(operation.refusal_fields) ? operation.refusal_fields : []);
    setModifiedData({});
    setConfirmHardDelete(false);
    setArchiveReason("");
  }

  async function handleArchiveOperation() {
    if (!validationDialog || !user) return;
    const { operation, type } = validationDialog;
    setArchiveBusy(true);
    try {
      const { error } = await supabase.rpc("archive_operation", {
        p_operation_type: type,
        p_operation_id: operation.id,
        p_reason: archiveReason.trim() || null,
      });
      if (error) throw error;
      toast.success("Opération archivée (réversible depuis l'onglet Archivées)");
      setValidationDialog(null);
      refetch();
    } catch (error: any) {
      console.error("Erreur archivage:", error);
      toast.error(error?.message || "Impossible d'archiver l'opération");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function handleRestoreOperation() {
    if (!validationDialog || !user) return;
    const { operation, type } = validationDialog;
    setArchiveBusy(true);
    try {
      const { error } = await supabase.rpc("restore_operation", {
        p_operation_type: type,
        p_operation_id: operation.id,
      });
      if (error) throw error;
      toast.success("Opération restaurée avec succès");
      setValidationDialog(null);
      refetch();
    } catch (error: any) {
      console.error("Erreur restauration:", error);
      toast.error(error?.message || "Impossible de restaurer l'opération");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function handleHardDeleteOperation() {
    if (!validationDialog || !user) return;
    const { operation, type } = validationDialog;
    setArchiveBusy(true);
    try {
      const { error } = await supabase.rpc("hard_delete_operation", {
        p_operation_type: type,
        p_operation_id: operation.id,
        p_reason: archiveReason.trim() || null,
      });
      if (error) throw error;
      toast.success("Opération supprimée définitivement (trace conservée dans l'audit)");
      setValidationDialog(null);
      refetch();
    } catch (error: any) {
      console.error("Erreur suppression définitive:", error);
      toast.error(error?.message || "Impossible de supprimer définitivement");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function handleGrantEditWindow(minutes: number) {
    if (!validationDialog || !user) return;
    const { operation, type } = validationDialog;
    setGrantingUnlock(minutes);
    try {
      const { data, error } = await supabase.rpc("grant_operation_edit_window", {
        p_operation_type: type,
        p_operation_id: operation.id,
        p_extra_minutes: minutes,
        p_reason: `Délai de modification prolongé (+${minutes} min)`,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const unlockedUntil =
        row?.edit_unlocked_until ||
        new Date(Date.now() + minutes * 60_000).toISOString();

      setValidationDialog((prev) =>
        prev
          ? {
              ...prev,
              operation: { ...prev.operation, edit_unlocked_until: unlockedUntil },
            }
          : null,
      );

      dispatchAppNotification({
        eventType: "operation_reviewed",
        operationType: type as "bets" | "transactions" | "venues",
        operationId: operation.id,
        status: "modify",
        operator: operation.operator || operation.quartier || "Opérateur",
        amountFcfa: operation.amount_fcfa,
        authorId: operation.created_by,
        notes: `Délai de modification accordé (+${minutes} min)`,
      });

      toast.success(`Délai de modification accordé (+${minutes} min)`);
      refetch();
    } catch (error: any) {
      console.error("Erreur prolongation délai:", error);
      toast.error(error?.message || "Impossible d'accorder le délai");
    } finally {
      setGrantingUnlock(null);
    }
  }

  async function handleValidation() {
    if (!validationDialog || !user) return;

    const { operation, type } = validationDialog;

    try {
      let updateData: any = {
        validated_by: user.id,
        validated_at: new Date().toISOString(),
        validation_notes: validationNotes || null,
      };

      if (validationAction === "modify") {
        // Appliquer les modifications
        updateData = { ...updateData, ...modifiedData };
        updateData.validation_status = "en_attente"; // Reste en attente après modification
      } else if (validationAction === "refuse") {
        updateData.validation_status = "refuse";
        updateData.refusal_fields = refusalFields;
      } else {
        updateData.validation_status = validationAction;
        updateData.refusal_fields = [];
      }

      const { error } = await supabase
        .from(type)
        .update(updateData)
        .eq("id", operation.id);

      if (error) throw error;

      // Notification in-app + email Resend pour l'auteur
      dispatchAppNotification({
        eventType: "operation_reviewed",
        operationType: type as "bets" | "transactions" | "venues",
        operationId: operation.id,
        status: validationAction,
        operator: operation.operator || operation.quartier || "Opérateur",
        amountFcfa: operation.amount_fcfa,
        authorId: operation.created_by,
        notes: validationNotes || undefined,
      });

      toast.success(
        validationAction === "valide"
          ? "Opération validée"
          : validationAction === "refuse"
          ? "Opération refusée"
          : "Modifications enregistrées"
      );

      setValidationDialog(null);
      refetch();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la validation");
    }
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      en_attente: { variant: "secondary", icon: Clock, label: "En attente" },
      valide: { variant: "default", icon: CheckCircle, label: "Validé" },
      refuse: { variant: "destructive", icon: XCircle, label: "Refusé" },
    };

    const config = variants[status] || variants.en_attente;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  }

  const stats = {
    en_attente: operations.filter((o) => o.validation_status === "en_attente").length,
    valide: operations.filter((o) => o.validation_status === "valide").length,
    refuse: operations.filter((o) => o.validation_status === "refuse").length,
  };

  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "CONTROLEUR"]}>
        <AppLayout>
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold">Validation des opérations</h1>
              <p className="text-sm text-muted-foreground">
                Valider, refuser ou modifier les opérations en attente
              </p>
            </div>

            {/* Statistiques */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-500" />
                    En attente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.en_attente}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Validées
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.valide}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Refusées
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.refuse}</div>
                </CardContent>
              </Card>
            </div>

            {/* Filtres */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Button
                variant={filterStatus === "en_attente" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("en_attente")}
              >
                En attente
              </Button>
              <Button
                variant={filterStatus === "valide" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("valide")}
              >
                Validées
              </Button>
              <Button
                variant={filterStatus === "refuse" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("refuse")}
              >
                Refusées
              </Button>
              <Button
                variant={filterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("all")}
              >
                Toutes
              </Button>
              <Button
                variant={filterStatus === "archived" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("archived")}
                className="gap-1.5"
              >
                <Archive className="h-3.5 w-3.5" />
                Archivées
              </Button>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="bets" className="gap-1.5">
                  Tests
                  {pendingCounts && (
                    <Badge
                      variant={pendingCounts.bets > 0 ? "default" : "secondary"}
                      className={cn(
                        "h-5 px-1.5 text-[11px] font-mono",
                        pendingCounts.bets > 0 && "bg-amber-600 text-white hover:bg-amber-600"
                      )}
                    >
                      {pendingCounts.bets}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="transactions" className="gap-1.5">
                  Transactions
                  {pendingCounts && (
                    <Badge
                      variant={pendingCounts.transactions > 0 ? "default" : "secondary"}
                      className={cn(
                        "h-5 px-1.5 text-[11px] font-mono",
                        pendingCounts.transactions > 0 && "bg-amber-600 text-white hover:bg-amber-600"
                      )}
                    >
                      {pendingCounts.transactions}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="venues" className="gap-1.5">
                  Sites
                  {pendingCounts && (
                    <Badge
                      variant={pendingCounts.venues > 0 ? "default" : "secondary"}
                      className={cn(
                        "h-5 px-1.5 text-[11px] font-mono",
                        pendingCounts.venues > 0 && "bg-amber-600 text-white hover:bg-amber-600"
                      )}
                    >
                      {pendingCounts.venues}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-4">
                <Card>
                  <CardContent className="p-0">
                    {(isLoading && operations.length === 0) ? (
                      <div className="p-8 text-center">Chargement...</div>
                    ) : operations.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        Aucune opération
                      </div>
                    ) : (
                      <div className="divide-y">
                        {operations.map((operation) => {
                          const isTargeted = Boolean(highlightedId && operation.id === highlightedId);
                          return (
                          <div
                            key={operation.id}
                            id={`validation-op-${operation.id}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (operation.validation_status === "en_attente") {
                                openValidationDialog(operation, activeTab);
                              } else {
                                setHistoryDialog({
                                  operationId: operation.id,
                                  type: activeTab,
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                if (operation.validation_status === "en_attente") {
                                  openValidationDialog(operation, activeTab);
                                } else {
                                  setHistoryDialog({
                                    operationId: operation.id,
                                    type: activeTab,
                                  });
                                }
                              }
                            }}
                            className={cn(
                              "p-4 hover:bg-slate-50 transition-colors cursor-pointer",
                              isTargeted && "bg-emerald-50 border-l-4 border-[#006B2D]"
                            )}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  {getStatusBadge(operation.validation_status)}
                                  {isTargeted && (
                                    <Badge className="bg-[#006B2D] text-white hover:bg-[#004D20]">
                                      Ciblé depuis vos notifications
                                    </Badge>
                                  )}
                                  <span className="text-sm text-muted-foreground">
                                    {dayjs(operation.created_at).format("DD/MM/YYYY HH:mm")}
                                  </span>
                                  {isTargeted && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const next = new URLSearchParams(searchParams);
                                        next.delete("id");
                                        setSearchParams(next, { replace: true });
                                      }}
                                      className="text-xs text-[#006B2D] underline ml-1"
                                    >
                                      Effacer le ciblage
                                    </button>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                  {operation.operator && (
                                    <div>
                                      <span className="text-muted-foreground">Opérateur:</span>{" "}
                                      <span className="font-medium">{operation.operator}</span>
                                    </div>
                                  )}
                                  {operation.support && (
                                    <div>
                                      <span className="text-muted-foreground">Support:</span>{" "}
                                      <span className="font-medium">{operation.support}</span>
                                    </div>
                                  )}
                                  {operation.amount_fcfa && (
                                    <div>
                                      <span className="text-muted-foreground">Montant:</span>{" "}
                                      <span className="font-medium">
                                        {operation.amount_fcfa.toLocaleString("fr-FR")} FCFA
                                      </span>
                                    </div>
                                  )}
                                  {operation.type && (
                                    <div>
                                      <span className="text-muted-foreground">Type:</span>{" "}
                                      <span className="font-medium">{operation.type}</span>
                                    </div>
                                  )}
                                </div>
                                {operation.validation_notes && (
                                  <div className="mt-2 text-sm text-muted-foreground italic">
                                    Note: {operation.validation_notes}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setHistoryDialog({
                                      operationId: operation.id,
                                      type: activeTab,
                                    });
                                  }}
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                                {operation.validation_status === "en_attente" && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openValidationDialog(operation, activeTab);
                                    }}
                                  >
                                    <Edit className="h-4 w-4 mr-1" />
                                    Traiter
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Dialog de validation */}
          {validationDialog && (() => {
            const op = validationDialog.operation;
            const opTypeLabel =
              validationDialog.type === "bets"
                ? "Test de pari"
                : validationDialog.type === "transactions"
                  ? "Transaction"
                  : "Site / Point de vente";
            const proofLink = op.ticket_url || op.proof_attachment_url;
            const phoneValue = op.phone || op.phone_number || op.contact_phone;
            const supportValue = op.support || op.platform;

            return (
              <Dialog
                open={!!validationDialog}
                onOpenChange={() => setValidationDialog(null)}
              >
                <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Traiter l&apos;opération — {opTypeLabel}</DialogTitle>
                    <DialogDescription>
                      Consultez le contenu complet de l&apos;opération, puis validez, modifiez ou refusez.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Contenu complet de l'opération */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(op.validation_status)}
                          <span className="font-semibold text-slate-900">
                            {op.operator || op.quartier || opTypeLabel}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {op.date ? dayjs(op.date).format("DD/MM/YYYY") : dayjs(op.created_at).format("DD/MM/YYYY")}
                          {op.time ? ` à ${String(op.time).slice(0, 5)}` : ""}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                        {supportValue && (
                          <div>
                            <span className="text-slate-500 block">Support / Plateforme</span>
                            <span className="font-semibold text-slate-900">{supportValue}</span>
                          </div>
                        )}
                        {(op.bet_type || op.type) && (
                          <div>
                            <span className="text-slate-500 block">Type</span>
                            <span className="font-semibold text-slate-900">{op.bet_type || op.type}</span>
                          </div>
                        )}
                        {op.payment_operator && (
                          <div>
                            <span className="text-slate-500 block">Moyen de paiement</span>
                            <span className="font-semibold text-slate-900">{op.payment_operator}</span>
                          </div>
                        )}
                        {typeof op.amount_fcfa === "number" && (
                          <div>
                            <span className="text-slate-500 block">Montant</span>
                            <span className="font-semibold text-slate-900">
                              {op.amount_fcfa.toLocaleString("fr-FR")} FCFA
                            </span>
                          </div>
                        )}
                        {op.status && (
                          <div>
                            <span className="text-slate-500 block">Résultat / Statut</span>
                            <span className="font-semibold text-slate-900">{op.status}</span>
                          </div>
                        )}
                        {typeof op.amount_won_fcfa === "number" && op.amount_won_fcfa > 0 && (
                          <div>
                            <span className="text-slate-500 block">Gain</span>
                            <span className="font-semibold text-emerald-700">
                              {op.amount_won_fcfa.toLocaleString("fr-FR")} FCFA
                            </span>
                          </div>
                        )}
                        {phoneValue && (
                          <div>
                            <span className="text-slate-500 block">Téléphone</span>
                            <span className="font-semibold text-slate-900">{phoneValue}</span>
                          </div>
                        )}
                        {op.reference && (
                          <div>
                            <span className="text-slate-500 block">Référence</span>
                            <span className="font-semibold text-slate-900 break-all">{op.reference}</span>
                          </div>
                        )}
                        {op.quartier && (
                          <div>
                            <span className="text-slate-500 block">Quartier</span>
                            <span className="font-semibold text-slate-900">{op.quartier}</span>
                          </div>
                        )}
                        {op.address && (
                          <div className="col-span-2">
                            <span className="text-slate-500 block">Adresse</span>
                            <span className="font-semibold text-slate-900">{op.address}</span>
                          </div>
                        )}
                        {op.proof_status && (
                          <div>
                            <span className="text-slate-500 block">Preuve</span>
                            <span className="font-semibold text-slate-900">{op.proof_status}</span>
                          </div>
                        )}
                      </div>

                      {op.notes && (
                        <div className="pt-1 border-t border-slate-200 text-xs">
                          <span className="text-slate-500 block">Notes / Observations</span>
                          <p className="text-slate-800 whitespace-pre-wrap">{op.notes}</p>
                        </div>
                      )}

                      {proofLink ? (
                        <ProofPreview url={proofLink} />
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <span>Aucun fichier justificatif joint à cette opération.</span>
                          {op.validation_status !== "valide" && (
                            <button
                              type="button"
                              onClick={() => {
                                setValidationAction("refuse");
                                setRefusalFields((prev) =>
                                  prev.includes("Justificatif") ? prev : [...prev, "Justificatif"],
                                );
                                setValidationNotes((prev) =>
                                  prev.trim() ? prev : "Justificatif manquant",
                                );
                              }}
                              className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              Pré-remplir refus (Justificatif manquant)
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Prolongation ciblée du délai de modification pour l'agent */}
                    {op.validation_status !== "valide" && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-800 block">
                            Délai de modification agent
                          </span>
                          <span className="text-slate-600 block">
                            {op.edit_unlocked_until &&
                            new Date(op.edit_unlocked_until).getTime() > Date.now()
                              ? `Débloqué jusqu'au ${dayjs(op.edit_unlocked_until).format("DD/MM/YYYY HH:mm")}`
                              : "Accorder un délai supplémentaire à l'agent :"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {[
                            { label: "+30 min", minutes: 30 },
                            { label: "+1 h", minutes: 60 },
                            { label: "+2 h", minutes: 120 },
                            { label: "+24 h", minutes: 1440 },
                          ].map((opt) => (
                            <Button
                              key={opt.minutes}
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={grantingUnlock !== null}
                              onClick={() => void handleGrantEditWindow(opt.minutes)}
                              className="h-7 px-2.5 text-[11px] bg-white border-[#B8DEC6] text-[#006B2D] hover:bg-[#E8F5EC]"
                            >
                              {grantingUnlock === opt.minutes ? "…" : opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant={validationAction === "valide" ? "default" : "outline"}
                        onClick={() => setValidationAction("valide")}
                        className="flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Valider
                      </Button>
                      <Button
                        variant={validationAction === "modify" ? "default" : "outline"}
                        onClick={() => setValidationAction("modify")}
                        className="flex-1"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Modifier
                      </Button>
                      <Button
                        variant={validationAction === "refuse" ? "destructive" : "outline"}
                        onClick={() => setValidationAction("refuse")}
                        className="flex-1"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Refuser
                      </Button>
                    </div>

                    {/* Modifications (si mode modify) */}
                    {validationAction === "modify" && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Modifications</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium">Montant (FCFA)</label>
                              <Input
                                type="number"
                                value={modifiedData.amount_fcfa ?? op.amount_fcfa ?? ""}
                                onChange={(e) =>
                                  setModifiedData({
                                    ...modifiedData,
                                    amount_fcfa: parseFloat(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium">Support</label>
                              <Input
                                value={modifiedData.support ?? op.support ?? ""}
                                onChange={(e) =>
                                  setModifiedData({
                                    ...modifiedData,
                                    support: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Notes */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {validationAction === "refuse"
                          ? "Motif du refus (ce qui ne va pas)"
                          : "Notes / Commentaires de décision"}
                        {validationAction === "refuse" && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </label>
                      {validationAction === "refuse" && (
                        <div className="space-y-2.5 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                          <div>
                            <p className="font-semibold mb-1.5">
                              Éléments à corriger par l&apos;agent (optionnel) :
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                "Montant",
                                "Justificatif",
                                "Référence",
                                "Téléphone",
                                "Opérateur / Support",
                              ].map((field) => {
                                const selected = refusalFields.includes(field);
                                return (
                                  <button
                                    key={field}
                                    type="button"
                                    onClick={() =>
                                      setRefusalFields((prev) =>
                                        selected
                                          ? prev.filter((f) => f !== field)
                                          : [...prev, field],
                                      )
                                    }
                                    className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                      selected
                                        ? "border-rose-600 bg-rose-600 text-white"
                                        : "border-rose-300 bg-white text-rose-800 hover:bg-rose-100"
                                    }`}
                                  >
                                    {selected ? `✓ ${field}` : field}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium mb-1.5">
                              Indiquez le motif du refus ci-dessous ou sélectionnez un motif rapide :
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                            {[
                              "Justificatif manquant",
                              "Justificatif illisible",
                              "Montant incorrect",
                              "Référence invalide",
                              "Opération en double",
                            ].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() =>
                                  setValidationNotes((prev) =>
                                    prev.trim()
                                      ? prev.includes(preset)
                                        ? prev
                                        : `${prev.trim()} — ${preset}`
                                      : preset
                                  )
                                }
                                className="rounded-full border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100"
                              >
                                + {preset}
                              </button>
                            ))}
                            </div>
                          </div>
                        </div>
                      )}
                      <Textarea
                        value={validationNotes}
                        onChange={(e) => setValidationNotes(e.target.value)}
                        placeholder={
                          validationAction === "refuse"
                            ? "Raison du refus (obligatoire)"
                            : "Commentaires optionnels"
                        }
                        rows={2}
                      />
                    </div>

                    {/* Actions */}
                    {op.archived_at ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3 text-xs">
                        <div className="space-y-1 text-amber-900">
                          <p className="font-semibold flex items-center gap-1.5">
                            <Archive className="h-4 w-4 text-amber-700" />
                            Opération archivée le{" "}
                            {dayjs(op.archived_at).format("DD/MM/YYYY à HH:mm")}
                          </p>
                          {op.archive_reason && (
                            <p className="text-amber-800">Motif : {op.archive_reason}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={archiveBusy}
                            onClick={() => void handleRestoreOperation()}
                            className="bg-white border-[#B8DEC6] text-[#006B2D] hover:bg-[#E8F5EC]"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Restaurer l&apos;opération
                          </Button>
                          {user?.role === "ADMIN" && !confirmHardDelete && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={archiveBusy}
                              onClick={() => setConfirmHardDelete(true)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                              Supprimer définitivement
                            </Button>
                          )}
                        </div>
                        {user?.role === "ADMIN" && confirmHardDelete && (
                          <div className="rounded-md border border-rose-300 bg-rose-50 p-2.5 space-y-2 text-rose-900">
                            <p className="font-semibold">
                              Confirmer la suppression définitive (irréversible) ?
                            </p>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={archiveBusy}
                                onClick={() => setConfirmHardDelete(false)}
                              >
                                Annuler
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={archiveBusy}
                                onClick={() => void handleHardDeleteOperation()}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                Oui, supprimer définitivement
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setValidationDialog(null)}
                          >
                            Annuler
                          </Button>
                          <Button
                            variant={validationAction === "refuse" ? "destructive" : "default"}
                            onClick={handleValidation}
                            disabled={
                              validationAction === "refuse" && !validationNotes.trim()
                            }
                          >
                            {validationAction === "refuse"
                              ? "Confirmer le refus"
                              : validationAction === "modify"
                                ? "Enregistrer les modifications"
                                : "Confirmer la validation"}
                          </Button>
                        </div>

                        {(user?.role === "ADMIN" || user?.role === "CONTROLEUR") && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                            <Input
                              value={archiveReason}
                              onChange={(e) => setArchiveReason(e.target.value)}
                              placeholder="Motif d'archivage (optionnel)..."
                              className="h-8 flex-1 min-w-[180px] bg-white text-xs"
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={archiveBusy}
                                onClick={() => void handleArchiveOperation()}
                                className="h-8 text-xs text-slate-700 hover:bg-slate-100"
                              >
                                <Archive className="h-3.5 w-3.5 mr-1.5" />
                                Archiver (réversible)
                              </Button>
                              {user?.role === "ADMIN" && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={archiveBusy}
                                  onClick={() => setConfirmHardDelete((v) => !v)}
                                  className="h-8 text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                  Supprimer
                                </Button>
                              )}
                            </div>
                            {user?.role === "ADMIN" && confirmHardDelete && (
                              <div className="w-full rounded-md border border-rose-300 bg-rose-50 p-2.5 flex flex-wrap items-center justify-between gap-2 text-rose-900">
                                <span className="font-semibold">
                                  Suppression définitive réservée à l&apos;Admin : confirmer ?
                                </span>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={archiveBusy}
                                    onClick={() => setConfirmHardDelete(false)}
                                    className="h-7 text-xs"
                                  >
                                    Annuler
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={archiveBusy}
                                    onClick={() => void handleHardDeleteOperation()}
                                    className="h-7 text-xs"
                                  >
                                    Supprimer définitivement
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Commentaires & Historique directement accessibles */}
                    <OperationCommentsPanel
                      operationType={validationDialog.type as OperationType}
                      operationId={op.id}
                      operator={op.operator || op.quartier}
                      amountFcfa={op.amount_fcfa}
                      reference={op.reference}
                      authorId={op.created_by}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            );
          })()}

          {/* Dialog historique et commentaires */}
          {historyDialog && (() => {
            const targetOp = operations.find(
              (op: Operation) => op.id === historyDialog.operationId,
            );
            return (
              <Dialog
                open={!!historyDialog}
                onOpenChange={() => setHistoryDialog(null)}
              >
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Historique et commentaires</DialogTitle>
                    <DialogDescription>
                      Consultez les changements de statut et échangez des commentaires avec l'équipe.
                    </DialogDescription>
                  </DialogHeader>
                  <OperationCommentsPanel
                    operationType={historyDialog.type as OperationType}
                    operationId={historyDialog.operationId}
                    operator={targetOp?.operator || targetOp?.quartier}
                    amountFcfa={targetOp?.amount_fcfa}
                    authorId={targetOp?.created_by}
                  />
                </DialogContent>
              </Dialog>
            );
          })()}
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
