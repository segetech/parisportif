import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAuth, RequireRole, useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Edit } from "lucide-react";

interface PendingItem {
  id: string;
  type: "bet" | "transaction" | "venue";
  date: string;
  created_by: string;
  data: any;
  validation_notes?: string;
}

export default function ValidationPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "CONTROLEUR"]}>
        <AppLayout>
          <ValidationContent />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}

function ValidationContent() {
  const { user } = useAuth();
  const [pendingBets, setPendingBets] = useState<any[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [pendingVenues, setPendingVenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [validationNotes, setValidationNotes] = useState("");
  const [actionType, setActionType] = useState<"validate" | "reject" | "edit">("validate");

  useEffect(() => {
    loadPendingItems();
  }, []);

  async function loadPendingItems() {
    setLoading(true);
    try {
      const [betsData, transactionsData, venuesData] = await Promise.all([
        supabase
          .from("bets")
          .select("*, users!bets_created_by_fkey(nom, prenom)")
          .eq("validation_status", "en_attente")
          .order("created_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("*, users!transactions_created_by_fkey(nom, prenom)")
          .eq("validation_status", "en_attente")
          .order("created_at", { ascending: false }),
        supabase
          .from("venues")
          .select("*, users!venues_created_by_fkey(nom, prenom)")
          .eq("validation_status", "en_attente")
          .order("created_at", { ascending: false }),
      ]);

      if (betsData.data) setPendingBets(betsData.data);
      if (transactionsData.data) setPendingTransactions(transactionsData.data);
      if (venuesData.data) setPendingVenues(venuesData.data);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }

  function openValidationDialog(item: any, type: "bet" | "transaction" | "venue", action: "validate" | "reject") {
    setSelectedItem({ ...item, type });
    setActionType(action);
    setValidationNotes("");
    setDialogOpen(true);
  }

  async function handleValidation() {
    if (!selectedItem || !user) return;

    const table = selectedItem.type === "bet" ? "bets" : selectedItem.type === "transaction" ? "transactions" : "venues";
    const status = actionType === "validate" ? "valide" : "refuse";

    try {
      const { error } = await supabase
        .from(table)
        .update({
          validation_status: status,
          validated_by: user.id,
          validated_at: new Date().toISOString(),
          validation_notes: validationNotes || null,
        })
        .eq("id", selectedItem.id);

      if (error) throw error;

      toast.success(
        actionType === "validate"
          ? "Opération validée avec succès"
          : "Opération refusée"
      );
      setDialogOpen(false);
      await loadPendingItems();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la validation");
    }
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("fr-FR").format(amount) + " F CFA";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  const totalPending = pendingBets.length + pendingTransactions.length + pendingVenues.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Validation des opérations</h1>
        <p className="text-sm text-muted-foreground">
          Valider ou refuser les opérations en attente
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-orange-600" />
            <p className="text-sm text-muted-foreground">Total en attente</p>
          </div>
          <p className="text-2xl font-bold text-orange-600">{totalPending}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Paris</p>
          <p className="text-2xl font-bold">{pendingBets.length}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Transactions</p>
          <p className="text-2xl font-bold">{pendingTransactions.length}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Salles</p>
          <p className="text-2xl font-bold">{pendingVenues.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bets">
            Paris ({pendingBets.length})
          </TabsTrigger>
          <TabsTrigger value="transactions">
            Transactions ({pendingTransactions.length})
          </TabsTrigger>
          <TabsTrigger value="venues">
            Salles ({pendingVenues.length})
          </TabsTrigger>
        </TabsList>

        {/* Paris en attente */}
        <TabsContent value="bets">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Opérateur</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créé par</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingBets.length > 0 ? (
                  pendingBets.map((bet) => (
                    <TableRow key={bet.id}>
                      <TableCell>
                        {new Date(bet.date).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>{bet.operator}</TableCell>
                      <TableCell>{bet.bet_type}</TableCell>
                      <TableCell>{formatAmount(bet.amount_fcfa)}</TableCell>
                      <TableCell>{bet.status}</TableCell>
                      <TableCell>
                        {bet.users?.nom} {bet.users?.prenom}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => openValidationDialog(bet, "bet", "validate")}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Valider
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => openValidationDialog(bet, "bet", "reject")}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Refuser
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucun pari en attente
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Transactions en attente */}
        <TabsContent value="transactions">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Opérateur</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Créé par</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingTransactions.length > 0 ? (
                  pendingTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        {new Date(tx.date).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>{tx.type}</TableCell>
                      <TableCell>{tx.operator}</TableCell>
                      <TableCell>{formatAmount(tx.amount_fcfa)}</TableCell>
                      <TableCell>
                        {tx.users?.nom} {tx.users?.prenom}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => openValidationDialog(tx, "transaction", "validate")}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Valider
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => openValidationDialog(tx, "transaction", "reject")}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Refuser
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucune transaction en attente
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Salles en attente */}
        <TabsContent value="venues">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quartier</TableHead>
                  <TableHead>Opérateur</TableHead>
                  <TableHead>Type de pari</TableHead>
                  <TableHead>Adresse</TableHead>
                  <TableHead>Créé par</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingVenues.length > 0 ? (
                  pendingVenues.map((venue) => (
                    <TableRow key={venue.id}>
                      <TableCell>{venue.quartier}</TableCell>
                      <TableCell>{venue.operator}</TableCell>
                      <TableCell>{venue.bet_type}</TableCell>
                      <TableCell>{venue.address}</TableCell>
                      <TableCell>
                        {venue.users?.nom} {venue.users?.prenom}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => openValidationDialog(venue, "venue", "validate")}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Valider
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => openValidationDialog(venue, "venue", "reject")}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Refuser
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucune salle en attente
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de validation */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "validate" ? "Valider" : "Refuser"} l'opération
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-sm font-medium">
                {selectedItem?.type === "bet" && "Pari"}
                {selectedItem?.type === "transaction" && "Transaction"}
                {selectedItem?.type === "venue" && "Salle"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Créé par : {selectedItem?.users?.nom} {selectedItem?.users?.prenom}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">
                Notes {actionType === "reject" && "(obligatoire)"}
              </label>
              <Textarea
                value={validationNotes}
                onChange={(e) => setValidationNotes(e.target.value)}
                placeholder={
                  actionType === "validate"
                    ? "Notes optionnelles..."
                    : "Raison du refus..."
                }
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleValidation}
                disabled={actionType === "reject" && !validationNotes}
                className={
                  actionType === "validate"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }
              >
                {actionType === "validate" ? "Valider" : "Refuser"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
