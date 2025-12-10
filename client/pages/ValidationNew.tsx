import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import dayjs from "dayjs";

interface Operation {
  id: string;
  date: string;
  time?: string;
  operator?: string;
  support?: string;
  amount_fcfa?: number;
  validation_status: string;
  created_by: string;
  created_at: string;
  validation_notes?: string;
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
  comment: string | null;
  user_name?: string;
}

interface Comment {
  id: string;
  user_id: string;
  comment: string;
  created_at: string;
  user_name?: string;
}

export default function ValidationPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("bets");
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("en_attente");
  
  const [validationDialog, setValidationDialog] = useState<{
    operation: Operation;
    type: string;
  } | null>(null);
  
  const [validationAction, setValidationAction] = useState<"valide" | "refuse" | "modify">("valide");
  const [validationNotes, setValidationNotes] = useState("");
  const [modifiedData, setModifiedData] = useState<Partial<Operation>>({});
  
  const [historyDialog, setHistoryDialog] = useState<{
    operationId: string;
    type: string;
  } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    loadOperations();
  }, [activeTab, filterStatus]);

  async function loadOperations() {
    setLoading(true);
    try {
      const tableName = activeTab;
      let query = supabase.from(tableName).select("*").order("created_at", { ascending: false });

      if (filterStatus !== "all") {
        query = query.eq("validation_status", filterStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      setOperations(data || []);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(operationId: string, type: string) {
    try {
      const { data, error } = await supabase
        .from("operation_history")
        .select(`
          *,
          users:modified_by (nom, prenom)
        `)
        .eq("operation_type", type)
        .eq("operation_id", operationId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const historyWithNames = data?.map((h: any) => ({
        ...h,
        user_name: h.users ? `${h.users.nom} ${h.users.prenom}` : "Système",
      })) || [];

      setHistory(historyWithNames);
    } catch (error) {
      console.error("Erreur:", error);
    }
  }

  async function loadComments(operationId: string, type: string) {
    try {
      const { data, error } = await supabase
        .from("operation_comments")
        .select(`
          *,
          users:user_id (nom, prenom)
        `)
        .eq("operation_type", type)
        .eq("operation_id", operationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const commentsWithNames = data?.map((c: any) => ({
        ...c,
        user_name: c.users ? `${c.users.nom} ${c.users.prenom}` : "Utilisateur",
      })) || [];

      setComments(commentsWithNames);
    } catch (error) {
      console.error("Erreur:", error);
    }
  }

  function openValidationDialog(operation: Operation, type: string) {
    setValidationDialog({ operation, type });
    setValidationAction("valide");
    setValidationNotes("");
    setModifiedData({});
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
      } else {
        updateData.validation_status = validationAction;
      }

      const { error } = await supabase
        .from(type)
        .update(updateData)
        .eq("id", operation.id);

      if (error) throw error;

      toast.success(
        validationAction === "valide"
          ? "Opération validée"
          : validationAction === "refuse"
          ? "Opération refusée"
          : "Modifications enregistrées"
      );

      setValidationDialog(null);
      loadOperations();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la validation");
    }
  }

  async function addComment() {
    if (!historyDialog || !user || !newComment.trim()) return;

    try {
      const { error } = await supabase.from("operation_comments").insert({
        operation_type: historyDialog.type,
        operation_id: historyDialog.operationId,
        user_id: user.id,
        comment: newComment.trim(),
        is_internal: false,
      });

      if (error) throw error;

      setNewComment("");
      loadComments(historyDialog.operationId, historyDialog.type);
      toast.success("Commentaire ajouté");
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'ajout du commentaire");
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
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="bets">Paris</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="venues">Salles</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-4">
                <Card>
                  <CardContent className="p-0">
                    {loading ? (
                      <div className="p-8 text-center">Chargement...</div>
                    ) : operations.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        Aucune opération
                      </div>
                    ) : (
                      <div className="divide-y">
                        {operations.map((operation) => (
                          <div
                            key={operation.id}
                            className="p-4 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  {getStatusBadge(operation.validation_status)}
                                  <span className="text-sm text-muted-foreground">
                                    {dayjs(operation.created_at).format("DD/MM/YYYY HH:mm")}
                                  </span>
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
                                        {operation.amount_fcfa.toLocaleString()} FCFA
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
                                  onClick={() => {
                                    setHistoryDialog({
                                      operationId: operation.id,
                                      type: activeTab,
                                    });
                                    loadHistory(operation.id, activeTab);
                                    loadComments(operation.id, activeTab);
                                  }}
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                                {operation.validation_status === "en_attente" && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      openValidationDialog(operation, activeTab)
                                    }
                                  >
                                    <Edit className="h-4 w-4 mr-1" />
                                    Traiter
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Dialog de validation */}
          {validationDialog && (
            <Dialog
              open={!!validationDialog}
              onOpenChange={() => setValidationDialog(null)}
            >
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Traiter l'opération</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
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
                              value={modifiedData.amount_fcfa || validationDialog.operation.amount_fcfa || ""}
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
                              value={modifiedData.support || validationDialog.operation.support || ""}
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
                  <div>
                    <label className="text-sm font-medium">
                      Notes / Commentaires
                      {validationAction === "refuse" && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>
                    <Textarea
                      value={validationNotes}
                      onChange={(e) => setValidationNotes(e.target.value)}
                      placeholder={
                        validationAction === "refuse"
                          ? "Raison du refus (obligatoire)"
                          : "Commentaires optionnels"
                      }
                      rows={3}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setValidationDialog(null)}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={handleValidation}
                      disabled={
                        validationAction === "refuse" && !validationNotes.trim()
                      }
                    >
                      Confirmer
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Dialog historique et commentaires */}
          {historyDialog && (
            <Dialog
              open={!!historyDialog}
              onOpenChange={() => setHistoryDialog(null)}
            >
              <DialogContent className="max-w-3xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>Historique et commentaires</DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="history" className="w-full">
                  <TabsList className="w-full">
                    <TabsTrigger value="history" className="flex-1">
                      <History className="h-4 w-4 mr-1" />
                      Historique
                    </TabsTrigger>
                    <TabsTrigger value="comments" className="flex-1">
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Commentaires ({comments.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="history" className="space-y-3 max-h-[50vh] overflow-y-auto">
                    {history.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        Aucun historique
                      </p>
                    ) : (
                      history.map((entry) => (
                        <Card key={entry.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline">{entry.action}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {dayjs(entry.modified_at).format("DD/MM/YYYY HH:mm")}
                                  </span>
                                </div>
                                <p className="text-sm">
                                  <span className="font-medium">{entry.user_name}</span>
                                  {entry.previous_status && entry.new_status && (
                                    <span>
                                      {" "}a changé le statut de{" "}
                                      <Badge variant="outline" className="mx-1">
                                        {entry.previous_status}
                                      </Badge>
                                      à
                                      <Badge variant="outline" className="mx-1">
                                        {entry.new_status}
                                      </Badge>
                                    </span>
                                  )}
                                </p>
                                {entry.comment && (
                                  <p className="text-sm text-muted-foreground mt-2 italic">
                                    {entry.comment}
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="comments" className="space-y-3">
                    <div className="max-h-[40vh] overflow-y-auto space-y-3">
                      {comments.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          Aucun commentaire
                        </p>
                      ) : (
                        comments.map((comment) => (
                          <Card key={comment.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium">
                                      {comment.user_name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {dayjs(comment.created_at).format("DD/MM/YYYY HH:mm")}
                                    </span>
                                  </div>
                                  <p className="text-sm">{comment.comment}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2 pt-3 border-t">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Ajouter un commentaire..."
                        rows={2}
                      />
                      <Button onClick={addComment} disabled={!newComment.trim()}>
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          )}
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
