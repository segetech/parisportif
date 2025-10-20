import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { RequireAuth, RequireRole, useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AlertTriangle, Plus } from "lucide-react";

export default function IllegalActivitiesPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "CONTROLEUR", "AGENT"]}>
        <AppLayout>
          <IllegalActivitiesContent />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}

interface IllegalBet {
  id: string;
  no: number;
  date: string;
  operator: string; // Opérateur de jeux
  platform: string; // Plateforme
  payment_operator: string; // Opérateur de paiement
  type: string; // Type
  amount_fcfa: number; // Montant
  time: string; // Heure
  phone?: string; // Numéro de téléphone
  reference: string; // Référence
  proof: boolean; // preuve
  notes?: string; // nouveau
  created_at: string;
  created_by: string;
}

interface IllegalTransaction {
  id: string;
  no: number;
  date: string;
  operator: string; // Opérateur de jeux
  platform: string; // Plateforme
  payment_operator: string; // Opérateur de paiement
  type: "Dépôt" | "Retrait"; // Type
  amount_fcfa: number; // Montant
  time: string; // Heure
  phone?: string; // Numéro de téléphone
  reference: string; // Référence
  proof: boolean; // preuve
  notes?: string; // nouveau
  created_at: string;
  created_by: string;
}

function IllegalActivitiesContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"bets" | "transactions">("bets");
  
  // Listes déroulantes
  const [operators, setOperators] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [paymentOperators, setPaymentOperators] = useState<string[]>([]);
  const [betTypes, setBetTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Paris illégaux
  const [illegalBets, setIllegalBets] = useState<IllegalBet[]>([]);
  const [betDialogOpen, setBetDialogOpen] = useState(false);
  const [newBet, setNewBet] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    operator: "",
    platform: "",
    payment_operator: "",
    type: "",
    amount_fcfa: 0,
    phone: "",
    reference: "",
    proof: false,
    notes: "",
  });

  // Transactions illégales
  const [illegalTransactions, setIllegalTransactions] = useState<IllegalTransaction[]>([]);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    operator: "",
    platform: "",
    payment_operator: "",
    type: "Dépôt" as "Dépôt" | "Retrait",
    amount_fcfa: 0,
    phone: "",
    reference: "",
    proof: false,
    notes: "",
  });

  // Filtres
  const [typeFilter, setTypeFilter] = useState<"tous" | "Dépôt" | "Retrait">("tous");

  // Charger les données de référence
  useEffect(() => {
    loadReferenceData();
    loadIllegalBets();
    loadIllegalTransactions();
  }, []);

  async function loadReferenceData() {
    try {
      const [opsRes, platsRes, payOpsRes, typesRes] = await Promise.all([
        supabase.from('operators').select('name').eq('active', true).order('name'),
        supabase.from('platforms').select('name').eq('active', true).order('name'),
        supabase.from('payment_operators').select('name').eq('active', true).order('name'),
        supabase.from('bet_types').select('name').eq('active', true).order('name'),
      ]);

      if (opsRes.data) setOperators(opsRes.data.map(o => o.name));
      if (platsRes.data) setPlatforms(platsRes.data.map(p => p.name));
      if (payOpsRes.data) setPaymentOperators(payOpsRes.data.map(p => p.name));
      if (typesRes.data) setBetTypes(typesRes.data.map(t => t.name));
    } catch (error) {
      console.error('Erreur lors du chargement des données de référence:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }

  async function loadIllegalBets() {
    try {
      const { data, error } = await supabase
        .from('illegal_bets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setIllegalBets(data as any);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error('Erreur lors du chargement des paris');
    }
  }

  async function loadIllegalTransactions() {
    try {
      const { data, error } = await supabase
        .from('illegal_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setIllegalTransactions(data as any);
    } catch (error: any) {
      console.error('Erreur:', error);
      toast.error('Erreur lors du chargement des transactions');
    }
  }

  // Fonctions pour créer de nouveaux éléments
  async function createOperator(name: string) {
    const { error } = await supabase
      .from('operators')
      .insert([{ name }]);
    
    if (error) {
      if (error.code === '23505') {
        toast.error('Cet opérateur existe déjà');
      } else {
        toast.error('Erreur lors de la création');
      }
      throw error;
    }
    
    await loadReferenceData();
    toast.success(`Opérateur "${name}" créé avec succès`);
  }

  async function createPlatform(name: string) {
    const { error } = await supabase
      .from('platforms')
      .insert([{ name }]);
    
    if (error) {
      if (error.code === '23505') {
        toast.error('Cette plateforme existe déjà');
      } else {
        toast.error('Erreur lors de la création');
      }
      throw error;
    }
    
    await loadReferenceData();
    toast.success(`Plateforme "${name}" créée avec succès`);
  }

  async function createPaymentOperator(name: string) {
    const { error } = await supabase
      .from('payment_operators')
      .insert([{ name }]);
    
    if (error) {
      if (error.code === '23505') {
        toast.error('Cet opérateur de paiement existe déjà');
      } else {
        toast.error('Erreur lors de la création');
      }
      throw error;
    }
    
    await loadReferenceData();
    toast.success(`Opérateur de paiement "${name}" créé avec succès`);
  }

  async function createBetType(name: string) {
    const { error } = await supabase
      .from('bet_types')
      .insert([{ name }]);
    
    if (error) {
      if (error.code === '23505') {
        toast.error('Ce type de pari existe déjà');
      } else {
        toast.error('Erreur lors de la création');
      }
      throw error;
    }
    
    await loadReferenceData();
    toast.success(`Type de pari "${name}" créé avec succès`);
  }

  const handleAddBet = async () => {
    try {
      if (!newBet.operator.trim() || !newBet.reference.trim()) {
        toast.error("Veuillez remplir tous les champs obligatoires");
        return;
      }

      const { data, error } = await supabase
        .from('illegal_bets')
        .insert([{
          ...newBet,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Pari illégal enregistré avec succès");
      await loadIllegalBets();
      setBetDialogOpen(false);
      setNewBet({
        date: new Date().toISOString().split("T")[0],
        time: new Date().toTimeString().slice(0, 5),
        operator: "",
        platform: "",
        payment_operator: "",
        type: "",
        amount_fcfa: 0,
        phone: "",
        reference: "",
        proof: false,
        notes: "",
      });
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors de l'enregistrement");
    }
  };

  const handleAddTransaction = async () => {
    try {
      if (!newTransaction.operator.trim() || !newTransaction.reference.trim()) {
        toast.error("Veuillez remplir tous les champs obligatoires");
        return;
      }

      const { data, error } = await supabase
        .from('illegal_transactions')
        .insert([{
          ...newTransaction,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Transaction illégale enregistrée avec succès");
      await loadIllegalTransactions();
      setTransactionDialogOpen(false);
      setNewTransaction({
        date: new Date().toISOString().split("T")[0],
        time: new Date().toTimeString().slice(0, 5),
        operator: "",
        platform: "",
        payment_operator: "",
        type: "Dépôt",
        amount_fcfa: 0,
        phone: "",
        reference: "",
        proof: false,
        notes: "",
      });
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors de l'enregistrement");
    }
  };

  const filteredBets = illegalBets;

  const filteredTransactions = typeFilter === "tous"
    ? illegalTransactions
    : illegalTransactions.filter((t) => t.type === typeFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Activités Illégales
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Enregistrement des paris et transactions illégaux
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="bets">
              Paris Illégaux ({illegalBets.length})
            </TabsTrigger>
            <TabsTrigger value="transactions">
              Dépôts/Retraits Illégaux ({illegalTransactions.length})
            </TabsTrigger>
          </TabsList>

          <Button
            onClick={() =>
              activeTab === "bets"
                ? setBetDialogOpen(true)
                : setTransactionDialogOpen(true)
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            + {activeTab === "bets" ? "Nouveau pari" : "Nouvelle transaction"}
          </Button>
        </div>

        {activeTab === "transactions" && (
          <div className="flex gap-2 items-center">
            <label className="text-xs font-medium">Filtrer par type:</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
            >
              <option value="tous">Tous</option>
              <option value="Dépôt">Dépôt</option>
              <option value="Retrait">Retrait</option>
            </select>
          </div>
        )}

        <TabsContent value="bets" className="space-y-4">
          <div className="rounded-md border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">N°</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Opérateur de jeux</th>
                  <th className="text-left p-2">Plateforme</th>
                  <th className="text-left p-2">Opérateur de paiement</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Montant</th>
                  <th className="text-left p-2">Heure</th>
                  <th className="text-left p-2">Numéro de téléphone</th>
                  <th className="text-left p-2">Référence</th>
                  <th className="text-left p-2">Preuve</th>
                  <th className="text-left p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredBets.length > 0 ? (
                  filteredBets.map((bet) => (
                    <tr key={bet.id} className="border-t">
                      <td className="p-2">{bet.no}</td>
                      <td className="p-2">
                        {new Date(bet.date).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="p-2">{bet.operator}</td>
                      <td className="p-2">{bet.platform}</td>
                      <td className="p-2">{bet.payment_operator}</td>
                      <td className="p-2">{bet.type}</td>
                      <td className="p-2 font-medium">
                        {bet.amount_fcfa.toLocaleString()} FCFA
                      </td>
                      <td className="p-2">{bet.time}</td>
                      <td className="p-2">{bet.phone || "—"}</td>
                      <td className="p-2 font-mono text-xs">{bet.reference}</td>
                      <td className="p-2">
                        {bet.proof ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {bet.notes || "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="text-center text-sm text-muted-foreground p-4"
                      colSpan={8}
                    >
                      Aucun pari illégal enregistré
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <div className="rounded-md border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">N°</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Opérateur de jeux</th>
                  <th className="text-left p-2">Plateforme</th>
                  <th className="text-left p-2">Opérateur de paiement</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Montant</th>
                  <th className="text-left p-2">Heure</th>
                  <th className="text-left p-2">Numéro de téléphone</th>
                  <th className="text-left p-2">Référence</th>
                  <th className="text-left p-2">Preuve</th>
                  <th className="text-left p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((trans) => (
                    <tr key={trans.id} className="border-t">
                      <td className="p-2">{trans.no}</td>
                      <td className="p-2">
                        {new Date(trans.date).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="p-2">{trans.operator}</td>
                      <td className="p-2">{trans.platform}</td>
                      <td className="p-2">{trans.payment_operator}</td>
                      <td className="p-2">
                        <span
                          className={
                            trans.type === "Dépôt"
                              ? "px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700"
                              : "px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700"
                          }
                        >
                          {trans.type}
                        </span>
                      </td>
                      <td className="p-2 font-medium">
                        {trans.amount_fcfa.toLocaleString()} FCFA
                      </td>
                      <td className="p-2">{trans.time}</td>
                      <td className="p-2">{trans.phone || "—"}</td>
                      <td className="p-2 font-mono text-xs">{trans.reference}</td>
                      <td className="p-2">
                        {trans.proof ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {trans.notes || "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="text-center text-sm text-muted-foreground p-4"
                      colSpan={12}
                    >
                      Aucune transaction illégale enregistrée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Ajouter un pari illégal */}
      <Dialog open={betDialogOpen} onOpenChange={setBetDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enregistrer un pari illégal</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Date *</label>
                <Input
                  type="date"
                  value={newBet.date}
                  onChange={(e) => setNewBet({ ...newBet, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Heure *</label>
                <Input
                  type="time"
                  value={newBet.time}
                  onChange={(e) => setNewBet({ ...newBet, time: e.target.value })}
                />
              </div>
            </div>
            <CreatableSelect
              label="Opérateur"
              required
              value={newBet.operator}
              onChange={(value) => setNewBet({ ...newBet, operator: value })}
              options={operators}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createOperator}
            />
            <CreatableSelect
              label="Plateforme"
              required
              value={newBet.platform}
              onChange={(value) => setNewBet({ ...newBet, platform: value })}
              options={platforms}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createPlatform}
            />
            <CreatableSelect
              label="Opérateur de paiement"
              required
              value={newBet.payment_operator}
              onChange={(value) => setNewBet({ ...newBet, payment_operator: value })}
              options={paymentOperators}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createPaymentOperator}
            />
            <CreatableSelect
              label="Type"
              required
              value={newBet.type}
              onChange={(value) => setNewBet({ ...newBet, type: value })}
              options={betTypes}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createBetType}
            />
            <div>
              <label className="text-xs font-medium">Montant (FCFA) *</label>
              <Input
                type="number"
                value={newBet.amount_fcfa || ""}
                onChange={(e) =>
                  setNewBet({ ...newBet, amount_fcfa: Number(e.target.value) })
                }
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Numéro de téléphone</label>
              <Input
                value={newBet.phone}
                onChange={(e) => setNewBet({ ...newBet, phone: e.target.value })}
                placeholder="Ex: +223..."
              />
            </div>
            <div>
              <label className="text-xs font-medium">Référence *</label>
              <Input
                value={newBet.reference}
                onChange={(e) => setNewBet({ ...newBet, reference: e.target.value })}
                placeholder="Numéro de référence"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Preuve</label>
              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  checked={newBet.proof}
                  onChange={(e) => setNewBet({ ...newBet, proof: e.target.checked })}
                  className="h-4 w-4"
                />
                <span className="text-sm">J'ai une preuve de cette transaction</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                value={newBet.notes}
                onChange={(e) =>
                  setNewBet({ ...newBet, notes: e.target.value })
                }
                placeholder="Notes additionnelles..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBetDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleAddBet}>Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ajouter une transaction illégale */}
      <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enregistrer une transaction illégale</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Date *</label>
                <Input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) =>
                    setNewTransaction({ ...newTransaction, date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium">Heure *</label>
                <Input
                  type="time"
                  value={newTransaction.time}
                  onChange={(e) =>
                    setNewTransaction({ ...newTransaction, time: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Type *</label>
              <select
                className="border rounded px-2 py-2 text-sm w-full"
                value={newTransaction.type}
                onChange={(e) =>
                  setNewTransaction({
                    ...newTransaction,
                    type: e.target.value as "Dépôt" | "Retrait",
                  })
                }
              >
                <option value="Dépôt">Dépôt</option>
                <option value="Retrait">Retrait</option>
              </select>
            </div>
            <CreatableSelect
              label="Opérateur"
              required
              value={newTransaction.operator}
              onChange={(value) => setNewTransaction({ ...newTransaction, operator: value })}
              options={operators}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createOperator}
            />
            <CreatableSelect
              label="Plateforme"
              required
              value={newTransaction.platform}
              onChange={(value) => setNewTransaction({ ...newTransaction, platform: value })}
              options={platforms}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createPlatform}
            />
            <CreatableSelect
              label="Opérateur de paiement"
              required
              value={newTransaction.payment_operator}
              onChange={(value) => setNewTransaction({ ...newTransaction, payment_operator: value })}
              options={paymentOperators}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createPaymentOperator}
            />
            <div>
              <label className="text-xs font-medium">Montant (FCFA) *</label>
              <Input
                type="number"
                value={newTransaction.amount_fcfa || ""}
                onChange={(e) =>
                  setNewTransaction({
                    ...newTransaction,
                    amount_fcfa: Number(e.target.value),
                  })
                }
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Téléphone</label>
              <Input
                value={newTransaction.phone}
                onChange={(e) =>
                  setNewTransaction({ ...newTransaction, phone: e.target.value })
                }
                placeholder="Ex: +223..."
              />
            </div>
            <div>
              <label className="text-xs font-medium">Référence *</label>
              <Input
                value={newTransaction.reference}
                onChange={(e) =>
                  setNewTransaction({ ...newTransaction, reference: e.target.value })
                }
                placeholder="Numéro de référence"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                value={newTransaction.notes}
                onChange={(e) =>
                  setNewTransaction({
                    ...newTransaction,
                    notes: e.target.value,
                  })
                }
                placeholder="Notes additionnelles..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setTransactionDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleAddTransaction}>Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
