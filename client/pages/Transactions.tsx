import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequireAuth, useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Search, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { CreatableSelect } from "@/components/ui/creatable-select";

interface Transaction {
  id: string;
  date: string;
  time?: string;
  type: string;
  operator: string;
  support: string;
  amount_fcfa: number;
  venue_id?: string;
  notes?: string;
  created_by?: string;
  validation_status?: string;
}

export default function TransactionsPage() {
  return (
    <RequireAuth>
      <Transactions />
    </RequireAuth>
  );
}

function Transactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  
  // Listes déroulantes
  const [operators, setOperators] = useState<string[]>([]);
  const [supports, setSupports] = useState<string[]>([]);
  
  // Formulaire
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    type: "Dépôt",
    operator: "",
    support: "",
    amount_fcfa: 0,
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    await Promise.all([loadTransactions(), loadOperators(), loadSupports()]);
  }

  async function loadTransactions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(100);

      if (error) throw error;
      if (data) setTransactions(data);
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement des transactions");
    } finally {
      setLoading(false);
    }
  }

  async function loadOperators() {
    const { data, error } = await supabase
      .from("operators")
      .select("name")
      .eq("active", true)
      .order("name");
    
    if (error) throw error;
    if (data) setOperators(data.map(o => o.name));
  }

  async function loadSupports() {
    const { data, error } = await supabase
      .from("supports")
      .select("name")
      .eq("active", true)
      .order("name");
    
    if (error) throw error;
    if (data) setSupports(data.map(s => s.name));
  }

  async function createOperator(name: string) {
    const { error } = await supabase
      .from("operators")
      .insert([{ name }]);
    
    if (error) {
      if (error.code === "23505") {
        toast.error("Cet opérateur existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }
    
    await loadOperators();
    toast.success(`Opérateur "${name}" créé avec succès`);
  }

  async function createSupport(name: string) {
    const { error } = await supabase
      .from("supports")
      .insert([{ name }]);
    
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce support existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }
    
    await loadSupports();
    toast.success(`Support "${name}" créé avec succès`);
  }

  function openDialog() {
    setEditingTransaction(null);
    setFormData({
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      type: "Dépôt",
      operator: "",
      support: "",
      amount_fcfa: 0,
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(transaction: Transaction) {
    setEditingTransaction(transaction);
    setFormData({
      date: transaction.date,
      time: transaction.time || "",
      type: transaction.type,
      operator: transaction.operator,
      support: transaction.support,
      amount_fcfa: transaction.amount_fcfa,
      notes: transaction.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!formData.date || !formData.type || !formData.operator || !formData.amount_fcfa) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      const transactionData = {
        ...formData,
        notes: formData.notes || null,
      };

      if (editingTransaction) {
        // Mode édition
        const { error } = await supabase
          .from("transactions")
          .update(transactionData)
          .eq("id", editingTransaction.id);
        
        if (error) throw error;
        toast.success("Transaction modifiée avec succès");
      } else {
        // Mode création
        const isAgent = user?.role === "AGENT";
        const newTransactionData = {
          ...transactionData,
          created_by: user?.id,
          validation_status: isAgent ? "en_attente" : "valide",
        };

        const { error } = await supabase
          .from("transactions")
          .insert([newTransactionData]);
        
        if (error) throw error;
        
        toast.success(
          isAgent
            ? "Transaction créée avec succès. En attente de validation."
            : "Transaction créée avec succès"
        );
      }
      
      setDialogOpen(false);
      setEditingTransaction(null);
      await loadTransactions();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  const filteredTransactions = transactions.filter((tx) => {
    if (typeFilter && tx.type !== typeFilter) return false;
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      tx.operator.toLowerCase().includes(searchLower) ||
      tx.type.toLowerCase().includes(searchLower) ||
      tx.notes?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    depots: filteredTransactions
      .filter((t) => t.type === "Dépôt")
      .reduce((sum, t) => sum + t.amount_fcfa, 0),
    retraits: filteredTransactions
      .filter((t) => t.type === "Retrait")
      .reduce((sum, t) => sum + t.amount_fcfa, 0),
    totalDepots: filteredTransactions.filter((t) => t.type === "Dépôt").length,
    totalRetraits: filteredTransactions.filter((t) => t.type === "Retrait")
      .length,
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("fr-FR").format(amount) + " F CFA";
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Chargement...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Transactions</h1>
            <p className="text-sm text-muted-foreground">
              Historique des dépôts et retraits
            </p>
          </div>
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle transaction
          </Button>
        </div>

        {/* Barre de recherche et filtres */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par opérateur, type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            className="border rounded px-3 py-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Tous les types</option>
            <option value="Dépôt">Dépôts</option>
            <option value="Retrait">Retraits</option>
          </select>
          <Button variant="outline" onClick={loadTransactions}>
            Actualiser
          </Button>
        </div>

        {/* Statistiques rapides */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
          <div className="p-4 border rounded-lg bg-emerald-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Total Dépôts</p>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {formatAmount(stats.depots)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalDepots} transaction(s)
            </p>
          </div>
          <div className="p-4 border rounded-lg bg-red-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Total Retraits</p>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-600">
              {formatAmount(stats.retraits)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalRetraits} transaction(s)
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">Solde net</p>
            <p
              className={`text-2xl font-bold ${
                stats.depots - stats.retraits >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {formatAmount(stats.depots - stats.retraits)}
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">Total transactions</p>
            <p className="text-2xl font-bold">{filteredTransactions.length}</p>
          </div>
        </div>

        {/* Tableau */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Heure</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Opérateur</TableHead>
                <TableHead>Support</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                  <TableRow 
                    key={tx.id}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => openEditDialog(tx)}
                  >
                    <TableCell>
                      {new Date(tx.date).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell>{tx.time || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tx.type === "Dépôt" ? (
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span
                          className={
                            tx.type === "Dépôt"
                              ? "text-emerald-600 font-medium"
                              : "text-red-600 font-medium"
                          }
                        >
                          {tx.type}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{tx.operator}</TableCell>
                    <TableCell>{tx.support}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span
                        className={
                          tx.type === "Dépôt"
                            ? "text-emerald-600"
                            : "text-red-600"
                        }
                      >
                        {tx.type === "Dépôt" ? "+" : "-"}
                        {formatAmount(tx.amount_fcfa)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {tx.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    Aucune transaction trouvée
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          Affichage de {filteredTransactions.length} transactions sur{" "}
          {transactions.length} au total
        </div>
      </div>

      {/* Dialog de création */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTransaction ? "Modifier la transaction" : "Nouvelle transaction"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Date *</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Heure</label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">Type *</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="Dépôt">Dépôt</option>
                <option value="Retrait">Retrait</option>
              </select>
            </div>

            <CreatableSelect
              label="Opérateur"
              required
              value={formData.operator}
              onChange={(value) => setFormData({ ...formData, operator: value })}
              options={operators}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createOperator}
            />

            <CreatableSelect
              label="Support"
              required
              value={formData.support}
              onChange={(value) => setFormData({ ...formData, support: value })}
              options={supports}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createSupport}
            />

            <div>
              <label className="text-xs font-medium">Montant (F CFA) *</label>
              <Input
                type="number"
                value={formData.amount_fcfa || ""}
                onChange={(e) => setFormData({ ...formData, amount_fcfa: parseFloat(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes additionnelles..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSubmit}>
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
