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
import { Search, TrendingUp, TrendingDown, Plus, FileText, Download, RefreshCw, Sparkles, CheckCircle2 } from "lucide-react";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { exportStyledExcel } from "@/lib/excel-export";
import { exportStyledPDF } from "@/lib/pdf-export";
import { useTransactions, useLookups, useVenues } from "@/hooks/use-data-queries";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { parsePaymentReference, ParsedPaymentRef } from "@/lib/smart-parser";

interface Transaction {
  id: string;
  date: string;
  time?: string;
  type: string;
  operator: string;
  support?: string;
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
  // Centralisation TanStack React Query pour fluidité instantanée
  const { data: transactions = [], isLoading, isFetching, refetch } = useTransactions();
  const { data: lookupsData } = useLookups();
  const { data: venuesData = [] } = useVenues();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  
  // Listes déroulantes synchronisées depuis le cache
  const operators = lookupsData?.operatorNames || [];
  const supports = lookupsData?.supportNames || [];
  const paymentOperators = lookupsData?.paymentOperatorNames || [];
  const venues = venuesData;

  // Assistance intelligente
  const [ticketRef, setTicketRef] = useState<string>("");
  const [parsedRef, setParsedRef] = useState<ParsedPaymentRef | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  
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

  function handleTicketRefChange(val: string) {
    setTicketRef(val);
    const parsed = parsePaymentReference(val);
    setParsedRef(parsed);
    if (parsed.isValid) {
      setFormData(prev => ({
        ...prev,
        time: parsed.time || prev.time,
        date: parsed.date || prev.date,
        type: parsed.type || prev.type,
      }));
    }
  }

  function handleVenueSelect(venueId: string) {
    setSelectedVenueId(venueId);
    if (!venueId) return;
    const v = venues.find(item => item.id === venueId);
    if (v) {
      setFormData(prev => ({
        ...prev,
        operator: v.operator || prev.operator,
        support: "Salle de jeux",
        notes: prev.notes ? `${prev.notes} (Salle: ${v.quartier} - ${v.address})` : `Salle: ${v.quartier} - ${v.address}`,
      }));
    }
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
    
    invalidateRelatedQueries("lookups");
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
    
    invalidateRelatedQueries("lookups");
    toast.success(`Support "${name}" créé avec succès`);
  }

  function openDialog() {
    setEditingTransaction(null);
    setTicketRef("");
    setParsedRef(null);
    setSelectedVenueId("");
    setFormData({
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      type: "Dépôt",
      operator: operators[0] || "",
      support: supports[0] || "",
      amount_fcfa: 0,
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(transaction: Transaction) {
    setEditingTransaction(transaction);
    setTicketRef("");
    setParsedRef(null);
    setSelectedVenueId("");
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
      const fullNotes = [
        ticketRef ? `Réf: ${ticketRef.trim()}` : null,
        formData.notes || null,
      ]
        .filter(Boolean)
        .join(" | ");

      const transactionData = {
        ...formData,
        notes: fullNotes || null,
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
            ? "Transaction enregistrée avec succès. En attente de validation du contrôleur."
            : "Transaction créée avec succès"
        );
      }
      
      setDialogOpen(false);
      setEditingTransaction(null);
      await refetch();
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

  const handleExportExcel = async () => {
    if (filteredTransactions.length === 0) {
      toast.error("Aucune transaction à exporter");
      return;
    }
    const columns = [
      { header: "N°", key: "index", width: 7, align: "center" as const },
      { header: "DATE", key: "date", width: 14, align: "center" as const },
      { header: "HEURE", key: "time", width: 10, align: "center" as const },
      { header: "TYPE", key: "type", width: 14, align: "center" as const, isStatus: true },
      { header: "OPÉRATEUR", key: "operator", width: 22, align: "left" as const },
      { header: "SUPPORT", key: "support", width: 16, align: "center" as const },
      { header: "MONTANT", key: "amount_fcfa", width: 20, align: "right" as const, isCurrency: true },
      { header: "STATUT", key: "validation_status", width: 16, align: "center" as const, isStatus: true },
      { header: "NOTES", key: "notes", width: 30, align: "left" as const },
    ];

    const data = filteredTransactions.map((tx, idx) => ({
      index: idx + 1,
      date: new Date(tx.date).toLocaleDateString("fr-FR"),
      time: tx.time || "—",
      type: tx.type,
      operator: tx.operator,
      support: tx.support || "—",
      amount_fcfa: Number(tx.amount_fcfa) || 0,
      validation_status: tx.validation_status === "valide" ? "Validé" : tx.validation_status === "refuse" ? "Refusé" : "En attente",
      notes: tx.notes || "—",
    }));

    const dateStr = new Date().toISOString().split("T")[0];
    try {
      toast.loading("Génération du rapport Excel en cours...", { id: "tx-excel" });
      await exportStyledExcel({
        sheetName: "Transactions",
        title: "Rapport Officiel des Flux Financiers",
        subtitle: "Historique et récapitulatif certifié des dépôts et retraits",
        periodText: typeFilter ? `Filtre Type : ${typeFilter}` : "Tous les types",
        columns,
        data,
        filename: `transactions_${dateStr}.xlsx`,
        showTotals: true,
      });
      toast.success(`${filteredTransactions.length} transaction(s) exportée(s) en Excel`, { id: "tx-excel" });
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'export Excel", { id: "tx-excel" });
    }
  };

  const handleExportPDF = async () => {
    if (filteredTransactions.length === 0) {
      toast.error("Aucune transaction à exporter");
      return;
    }
    const columns = [
      { header: "N°", key: "index", align: "center" as const },
      { header: "DATE", key: "date", align: "center" as const },
      { header: "HEURE", key: "time", align: "center" as const },
      { header: "TYPE", key: "type", align: "center" as const, isStatus: true },
      { header: "OPÉRATEUR", key: "operator", align: "left" as const },
      { header: "SUPPORT", key: "support", align: "center" as const },
      { header: "MONTANT", key: "amount_fcfa", align: "right" as const, isCurrency: true },
      { header: "STATUT", key: "validation_status", align: "center" as const, isStatus: true },
      { header: "NOTES", key: "notes", align: "left" as const },
    ];

    const data = filteredTransactions.map((tx, idx) => ({
      index: idx + 1,
      date: new Date(tx.date).toLocaleDateString("fr-FR"),
      time: tx.time || "—",
      type: tx.type,
      operator: tx.operator,
      support: tx.support || "—",
      amount_fcfa: Number(tx.amount_fcfa) || 0,
      validation_status: tx.validation_status === "valide" ? "Validé" : tx.validation_status === "refuse" ? "Refusé" : "En attente",
      notes: tx.notes || "—",
    }));

    const dateStr = new Date().toISOString().split("T")[0];
    try {
      toast.loading("Génération du rapport PDF en cours...", { id: "tx-pdf" });
      await exportStyledPDF({
        title: "Rapport Officiel des Flux Financiers",
        subtitle: "Historique et récapitulatif certifié des dépôts et retraits",
        periodText: typeFilter ? `Filtre Type : ${typeFilter}` : "Tous les types",
        columns,
        data,
        filename: `transactions_${dateStr}.pdf`,
        showTotals: true,
        orientation: "landscape",
      });
      toast.success(`${filteredTransactions.length} transaction(s) exportée(s) en PDF`, { id: "tx-pdf" });
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'export PDF", { id: "tx-pdf" });
    }
  };

  if (isLoading && transactions.length === 0) {
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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#D8E6DB]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#17251C]">
              Transactions
            </h1>
            <p className="text-xs sm:text-sm text-[#556B5C] mt-1">
              Historique et pilotage des flux financiers de dépôts et retraits
            </p>
          </div>
          <Button
            onClick={openDialog}
            className="h-10 gap-2 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold text-xs rounded-xl shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="h-4 w-4 text-[#FFD000]" />
            <span>Nouvelle transaction</span>
          </Button>
        </div>

        {/* Barre de recherche et filtres */}
        <div className="p-4 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#556B5C]" />
            <Input
              placeholder="Rechercher par opérateur, type, référence..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C]/70 rounded-xl focus-visible:ring-[#006B2D]"
            />
          </div>
          <select
            className="h-10 px-3.5 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] text-xs font-bold text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D] w-full sm:w-auto"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Tous les types</option>
            <option value="Dépôt">Dépôts</option>
            <option value="Retrait">Retraits</option>
          </select>
          <Button
            variant="outline"
            onClick={() => refetch()}
            className="h-10 text-xs font-bold text-[#17251C] border-[#D8E6DB] hover:bg-[#F5F8F5] rounded-xl w-full sm:w-auto gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-[#006B2D]" : ""}`} />
            <span>Actualiser</span>
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              className="h-10 text-xs font-bold text-[#006B2D] border-[#006B2D]/30 hover:bg-[#006B2D]/10 rounded-xl gap-1.5 flex-1 sm:flex-none"
            >
              <FileText className="h-4 w-4 text-[#006B2D]" />
              <span>PDF</span>
            </Button>
            <Button
              onClick={handleExportExcel}
              className="h-10 text-xs font-bold bg-[#006B2D] hover:bg-[#004D20] text-white rounded-xl gap-1.5 flex-1 sm:flex-none shadow-xs"
            >
              <Download className="h-4 w-4 text-[#FFD000]" />
              <span>Excel</span>
            </Button>
          </div>
        </div>

        {/* Statistiques Bento KPIs synchronisées */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                Total Dépôts
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#EBF7EE] text-[#006B2D] flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-[#006B2D]">
                {formatAmount(stats.depots)}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] font-semibold text-[#556B5C]">
                  {stats.totalDepots} opération(s)
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                Total Retraits
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#FEECEB] text-[#E52329] flex items-center justify-center">
                <TrendingDown className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-[#E52329]">
                {formatAmount(stats.retraits)}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] font-semibold text-[#556B5C]">
                  {stats.totalRetraits} opération(s)
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                Solde Net
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#F5F8F5] text-[#17251C] flex items-center justify-center border border-[#D8E6DB]">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p
                className={`text-2xl font-extrabold ${
                  stats.depots - stats.retraits >= 0
                    ? "text-[#006B2D]"
                    : "text-[#E52329]"
                }`}
              >
                {formatAmount(stats.depots - stats.retraits)}
              </p>
              <span className="text-[11px] font-semibold text-[#556B5C]">
                Flux net conservé
              </span>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-[#D8E6DB] bg-white shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#556B5C]">
                Total Transactions
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#F5F8F5] text-[#17251C] flex items-center justify-center border border-[#D8E6DB]">
                <span className="text-xs font-bold font-mono">#</span>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-[#17251C]">
                {filteredTransactions.length}
              </p>
              <span className="text-[11px] font-semibold text-[#556B5C]">
                Sur la sélection
              </span>
            </div>
          </div>
        </div>

        {/* Tableau */}
        <div className="rounded-2xl border border-[#D8E6DB] bg-white shadow-xs overflow-hidden">
          <Table>
            <TableHeader className="bg-[#F5F8F5] border-b border-[#D8E6DB]">
              <TableRow>
                <TableHead className="text-xs font-bold text-[#17251C]">Date</TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">Heure</TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">Type</TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">Opérateur</TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">Support</TableHead>
                <TableHead className="text-right text-xs font-bold text-[#17251C]">Montant</TableHead>
                <TableHead className="text-xs font-bold text-[#17251C]">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                  <TableRow
                    key={tx.id}
                    className="cursor-pointer hover:bg-[#F5F8F5] transition-colors border-b border-[#E2ECE4]"
                    onClick={() => openEditDialog(tx)}
                  >
                    <TableCell className="text-xs font-semibold text-[#17251C]">
                      {new Date(tx.date).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-xs text-[#556B5C] font-mono">{tx.time || "—"}</TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border" style={{
                        backgroundColor: tx.type === "Dépôt" ? "#EBF7EE" : "#FEECEB",
                        borderColor: tx.type === "Dépôt" ? "#86EFAC" : "#F87171",
                        color: tx.type === "Dépôt" ? "#006B2D" : "#E52329",
                      }}>
                        {tx.type === "Dépôt" ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span>{tx.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-[#17251C]">{tx.operator}</TableCell>
                    <TableCell className="text-xs text-[#556B5C]">{tx.support}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">
                      <span
                        className={
                          tx.type === "Dépôt"
                            ? "text-[#006B2D]"
                            : "text-[#E52329]"
                        }
                      >
                        {tx.type === "Dépôt" ? "+" : "-"}
                        {formatAmount(tx.amount_fcfa)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-[#556B5C]">
                      {tx.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-[#556B5C] py-12"
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#17251C]">
              {editingTransaction ? "Modifier la transaction" : "Nouvelle transaction financière"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 pt-2">
            {/* ASSISTANCE INTELLIGENTE : ANALYSE DU SMS / TICKET ORANGE MONEY / MOOV / WAVE */}
            <div className="p-3 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#17251C] flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#006B2D]" />
                  Référence Transaction / SMS Mobile Money
                </span>
                <span className="text-[10px] text-[#556B5C]">Orange Money / Wave / Moov</span>
              </div>
              <Input
                placeholder="Ex: MP250326.0415.A49647 ou CI250326.0438.B13742"
                value={ticketRef}
                onChange={(e) => handleTicketRefChange(e.target.value)}
                className="h-9 text-xs bg-white border-[#D8E6DB] text-[#17251C]"
              />
              {parsedRef?.isValid && (
                <div className="flex items-center gap-2 text-xs text-[#006B2D] font-bold bg-[#006B2D]/10 p-2 rounded-lg border border-[#006B2D]/20">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#006B2D]" />
                  <span>{parsedRef.message}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">Date *</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="bg-white border-[#D8E6DB]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">Heure</label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="bg-white border-[#D8E6DB]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">Type de flux *</label>
                <select
                  className="w-full border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="Dépôt">Dépôt (Entrée)</option>
                  <option value="Retrait">Retrait (Sortie)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">Montant (F CFA) *</label>
                <Input
                  type="number"
                  value={formData.amount_fcfa || ""}
                  onChange={(e) => setFormData({ ...formData, amount_fcfa: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="bg-white border-[#D8E6DB] font-semibold"
                />
              </div>
            </div>

            <CreatableSelect
              label="Opérateur de jeux"
              required
              value={formData.operator}
              onChange={(value) => setFormData({ ...formData, operator: value })}
              options={operators}
              placeholder="Ex: PremierBet, Bet223, 1xBet, MALIBET..."
              onCreateNew={createOperator}
            />

            <CreatableSelect
              label="Support"
              required
              value={formData.support}
              onChange={(value) => setFormData({ ...formData, support: value })}
              options={supports}
              placeholder="En ligne, Salle de jeux, Guichet..."
              onCreateNew={createSupport}
            />

            {/* SÉLECTEUR EN CASCADE DES SALLES DE JEUX PHYSIQUES */}
            {formData.support === "Salle de jeux" && venues.length > 0 && (
              <div>
                <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                  Point de Vente Physique ({venues.length} salles répertoriées)
                </label>
                <select
                  className="w-full border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-xs text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
                  value={selectedVenueId}
                  onChange={(e) => handleVenueSelect(e.target.value)}
                >
                  <option value="">-- Choisir une salle de jeux enregistrée --</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.quartier} • {v.operator} • {v.address}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">Notes / Observations</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Détails du paiement, guichet, motif..."
                rows={2}
                className="bg-white border-[#D8E6DB]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#D8E6DB]">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-[#D8E6DB] text-[#556B5C] hover:bg-[#F5F8F5]"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-[#006B2D] hover:bg-[#004D20] text-white font-semibold shadow-xs"
              >
                Enregistrer la transaction
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
