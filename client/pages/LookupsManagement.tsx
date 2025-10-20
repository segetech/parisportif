import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequireAuth, RequireRole } from "@/context/AuthContext";
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
import { Plus, Trash2, Settings } from "lucide-react";

export default function LookupsManagementPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <LookupsManagementContent />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}

interface LookupItem {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

function LookupsManagementContent() {
  const [activeTab, setActiveTab] = useState<"operators" | "platforms" | "payment_operators" | "bet_types">("operators");
  
  // États pour chaque type
  const [operators, setOperators] = useState<LookupItem[]>([]);
  const [platforms, setPlatforms] = useState<LookupItem[]>([]);
  const [paymentOperators, setPaymentOperators] = useState<LookupItem[]>([]);
  const [betTypes, setBetTypes] = useState<LookupItem[]>([]);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    try {
      await Promise.all([
        loadOperators(),
        loadPlatforms(),
        loadPaymentOperators(),
        loadBetTypes(),
      ]);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOperators() {
    const { data, error } = await supabase
      .from("operators")
      .select("*")
      .order("name");
    if (error) throw error;
    if (data) setOperators(data);
  }

  async function loadPlatforms() {
    const { data, error } = await supabase
      .from("platforms")
      .select("*")
      .order("name");
    if (error) throw error;
    if (data) setPlatforms(data);
  }

  async function loadPaymentOperators() {
    const { data, error } = await supabase
      .from("payment_operators")
      .select("*")
      .order("name");
    if (error) throw error;
    if (data) setPaymentOperators(data);
  }

  async function loadBetTypes() {
    const { data, error } = await supabase
      .from("bet_types")
      .select("*")
      .order("name");
    if (error) throw error;
    if (data) setBetTypes(data);
  }

  async function handleAdd() {
    if (!newItemName.trim()) {
      toast.error("Veuillez entrer un nom");
      return;
    }

    try {
      const { error } = await supabase
        .from(activeTab)
        .insert([{ name: newItemName.trim() }]);

      if (error) throw error;

      toast.success("Élément ajouté avec succès");
      setNewItemName("");
      setDialogOpen(false);
      
      // Recharger la liste appropriée
      switch (activeTab) {
        case "operators":
          await loadOperators();
          break;
        case "platforms":
          await loadPlatforms();
          break;
        case "payment_operators":
          await loadPaymentOperators();
          break;
        case "bet_types":
          await loadBetTypes();
          break;
      }
    } catch (error: any) {
      console.error("Erreur:", error);
      if (error.code === "23505") {
        toast.error("Cet élément existe déjà");
      } else {
        toast.error("Erreur lors de l'ajout");
      }
    }
  }

  async function handleDelete(id: string, table: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet élément ?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Élément supprimé avec succès");
      
      // Recharger la liste appropriée
      switch (table) {
        case "operators":
          await loadOperators();
          break;
        case "platforms":
          await loadPlatforms();
          break;
        case "payment_operators":
          await loadPaymentOperators();
          break;
        case "bet_types":
          await loadBetTypes();
          break;
      }
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la suppression");
    }
  }

  async function toggleActive(id: string, table: string, currentActive: boolean) {
    try {
      const { error } = await supabase
        .from(table)
        .update({ active: !currentActive })
        .eq("id", id);

      if (error) throw error;

      toast.success(currentActive ? "Élément désactivé" : "Élément activé");
      
      // Recharger la liste appropriée
      switch (table) {
        case "operators":
          await loadOperators();
          break;
        case "platforms":
          await loadPlatforms();
          break;
        case "payment_operators":
          await loadPaymentOperators();
          break;
        case "bet_types":
          await loadBetTypes();
          break;
      }
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la modification");
    }
  }

  const getTabLabel = () => {
    switch (activeTab) {
      case "operators":
        return "Opérateurs de jeux";
      case "platforms":
        return "Plateformes";
      case "payment_operators":
        return "Opérateurs de paiement";
      case "bet_types":
        return "Types de paris";
    }
  };

  const getCurrentData = () => {
    switch (activeTab) {
      case "operators":
        return operators;
      case "platforms":
        return platforms;
      case "payment_operators":
        return paymentOperators;
      case "bet_types":
        return betTypes;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Gestion des Référentiels
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Gérer les opérateurs, plateformes et types
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="operators">
              Opérateurs ({operators.length})
            </TabsTrigger>
            <TabsTrigger value="platforms">
              Plateformes ({platforms.length})
            </TabsTrigger>
            <TabsTrigger value="payment_operators">
              Op. Paiement ({paymentOperators.length})
            </TabsTrigger>
            <TabsTrigger value="bet_types">
              Types de paris ({betTypes.length})
            </TabsTrigger>
          </TabsList>

          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter
          </Button>
        </div>

        <TabsContent value={activeTab} className="space-y-4">
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-3">Nom</th>
                  <th className="text-left p-3">Statut</th>
                  <th className="text-left p-3">Date de création</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {getCurrentData().length > 0 ? (
                  getCurrentData().map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleActive(item.id, activeTab, item.active)}
                          className={`px-2 py-1 text-xs rounded ${
                            item.active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {item.active ? "Actif" : "Inactif"}
                        </button>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id, activeTab)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="text-center text-sm text-muted-foreground p-8"
                      colSpan={4}
                    >
                      Aucun élément
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog pour ajouter un élément */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter - {getTabLabel()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nom *</label>
              <Input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Entrez le nom"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAdd();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleAdd}>Ajouter</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
