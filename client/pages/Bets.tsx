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
import { Search, Plus, Download, Settings, Eye, EyeOff } from "lucide-react";
import * as XLSX from "xlsx";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface Bet {
  id: string;
  date: string;
  time?: string;
  operator: string;
  support: string;
  bet_type: string;
  amount_fcfa: number;
  status: string;
  amount_won_fcfa?: number;
  venue_id?: string;
  notes?: string;
  created_by?: string;
  validation_status?: string;
}

export default function BetsPage() {
  return (
    <RequireAuth>
      <Bets />
    </RequireAuth>
  );
}

function Bets() {
  const { user } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBet, setEditingBet] = useState<Bet | null>(null);
  const [activeOperator, setActiveOperator] = useState<string>("all");
  const [hiddenOperators, setHiddenOperators] = useState<Set<string>>(new Set());
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<string>("all");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  
  // Listes déroulantes
  const [operators, setOperators] = useState<string[]>([]);
  const [supports, setSupports] = useState<string[]>([]);
  const [betTypes, setBetTypes] = useState<string[]>([]);
  
  // Formulaire
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    operator: "",
    support: "",
    bet_type: "",
    amount_fcfa: 0,
    status: "en attente",
    amount_won_fcfa: 0,
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    await Promise.all([loadBets(), loadOperators(), loadSupports(), loadBetTypes()]);
  }

  async function loadBets() {
    setLoading(true);
    try {
      const { data, error} = await supabase
        .from("bets")
        .select("*")
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(100);

      if (error) throw error;
      if (data) setBets(data);
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement des paris");
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

  async function loadBetTypes() {
    const { data, error } = await supabase
      .from("bet_types")
      .select("name")
      .eq("active", true)
      .order("name");
    
    if (error) throw error;
    if (data) setBetTypes(data.map(b => b.name));
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

  async function createBetType(name: string) {
    const { error } = await supabase
      .from("bet_types")
      .insert([{ name }]);
    
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce type de pari existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }
    
    await loadBetTypes();
    toast.success(`Type de pari "${name}" créé avec succès`);
  }

  function openDialog() {
    setEditingBet(null);
    setFormData({
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      operator: "",
      support: "",
      bet_type: "",
      amount_fcfa: 0,
      status: "en attente",
      amount_won_fcfa: 0,
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(bet: Bet) {
    setEditingBet(bet);
    setFormData({
      date: bet.date,
      time: bet.time || "",
      operator: bet.operator,
      support: bet.support,
      bet_type: bet.bet_type,
      amount_fcfa: bet.amount_fcfa,
      status: bet.status,
      amount_won_fcfa: bet.amount_won_fcfa || 0,
      notes: bet.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!formData.date || !formData.operator || !formData.bet_type || !formData.amount_fcfa) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      const betData = {
        ...formData,
        amount_won_fcfa: formData.amount_won_fcfa || null,
        notes: formData.notes || null,
      };

      if (editingBet) {
        // Mode édition
        const { error } = await supabase
          .from("bets")
          .update(betData)
          .eq("id", editingBet.id);
        
        if (error) throw error;
        toast.success("Pari modifié avec succès");
      } else {
        // Mode création
        const isAgent = user?.role === "AGENT";
        const newBetData = {
          ...betData,
          created_by: user?.id,
          validation_status: isAgent ? "en_attente" : "valide",
        };

        const { error } = await supabase
          .from("bets")
          .insert([newBetData]);
        
        if (error) throw error;
        
        toast.success(
          isAgent
            ? "Pari créé avec succès. En attente de validation."
            : "Pari créé avec succès"
        );
      }
      
      setDialogOpen(false);
      setEditingBet(null);
      await loadBets();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  const filteredBets = bets.filter((bet) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      bet.operator.toLowerCase().includes(searchLower) ||
      bet.bet_type.toLowerCase().includes(searchLower) ||
      bet.status.toLowerCase().includes(searchLower) ||
      bet.notes?.toLowerCase().includes(searchLower)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "gagné":
      case "gagne":
        return "px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700";
      case "perdu":
        return "px-2 py-1 text-xs rounded bg-red-100 text-red-700";
      case "en attente":
      case "en_attente":
        return "px-2 py-1 text-xs rounded bg-blue-100 text-blue-700";
      case "annulé":
      case "annule":
        return "px-2 py-1 text-xs rounded bg-slate-100 text-slate-700";
      default:
        return "px-2 py-1 text-xs rounded bg-slate-100 text-slate-700";
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("fr-FR").format(amount) + " F CFA";
  };

  // Grouper les paris par opérateur
  const groupedBets = filteredBets.reduce((acc, bet) => {
    if (!acc[bet.operator]) {
      acc[bet.operator] = [];
    }
    acc[bet.operator].push(bet);
    return acc;
  }, {} as Record<string, Bet[]>);

  // Trier chaque groupe par date
  Object.keys(groupedBets).forEach(operator => {
    groupedBets[operator].sort((a, b) => {
      const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return (b.time || "").localeCompare(a.time || "");
    });
  });

  const toggleOperatorVisibility = (operator: string) => {
    const newHidden = new Set(hiddenOperators);
    if (newHidden.has(operator)) {
      newHidden.delete(operator);
    } else {
      newHidden.add(operator);
    }
    setHiddenOperators(newHidden);
  };

  const filterBetsByPeriod = (betsToFilter: Bet[]) => {
    if (exportPeriod === "all") return betsToFilter;

    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (exportPeriod) {
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "custom":
        if (!exportStartDate || !exportEndDate) return betsToFilter;
        startDate = new Date(exportStartDate);
        endDate = new Date(exportEndDate);
        break;
      default:
        return betsToFilter;
    }

    return betsToFilter.filter(bet => {
      const betDate = new Date(bet.date);
      return betDate >= startDate && betDate <= endDate;
    });
  };

  const exportToExcel = (betsToExport: Bet[] = filteredBets, operatorName: string = "tous") => {
    const filteredByPeriod = filterBetsByPeriod(betsToExport);
    
    if (filteredByPeriod.length === 0) {
      toast.error("Aucun pari à exporter pour cette période");
      return;
    }

    // Créer le titre avec période
    const title = `RAPPORT DES PARIS SUR LES DIFFERENTES PLATEFORMES`;
    const periodText = exportPeriod === "week" ? "DE LA SEMAINE" 
      : exportPeriod === "month" ? "DU MOIS"
      : exportPeriod === "custom" ? `DU ${new Date(exportStartDate).toLocaleDateString("fr-FR")} AU ${new Date(exportEndDate).toLocaleDateString("fr-FR")}`
      : "";
    
    // Préparer les données
    const excelData = filteredByPeriod.map((bet, index) => ({
      "N°": index + 1,
      "DATE": new Date(bet.date).toLocaleDateString("fr-FR"),
      "Opérateur de jeux": bet.operator,
      "Support": bet.support,
      "Type de Pari": bet.bet_type,
      "Montant FCFA": bet.amount_fcfa,
      "Heure": bet.time || "",
      "Numéro de téléphone": "98932544",
      "Référence": bet.id.substring(0, 12)
    }));

    // Créer le workbook
    const wb = XLSX.utils.book_new();
    
    // Créer la feuille avec titre
    const ws_data = [
      [title + (periodText ? " " + periodText : "")], // Titre
      Object.keys(excelData[0] || {}), // En-têtes (ligne 2 maintenant)
      ...excelData.map(row => Object.values(row)) // Données
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Largeurs des colonnes
    ws['!cols'] = [
      { wch: 5 },  // N°
      { wch: 12 }, // DATE
      { wch: 20 }, // Opérateur
      { wch: 15 }, // Support
      { wch: 15 }, // Type
      { wch: 15 }, // Montant
      { wch: 10 }, // Heure
      { wch: 18 }, // Téléphone
      { wch: 15 }  // Référence
    ];

    // Fusionner les cellules du titre
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } } // Fusionner A1:I1
    ];

    // Appliquer les styles (titre, en-têtes, données)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    
    // Style pour le titre (ligne 1)
    const titleCell = ws['A1'];
    if (titleCell) {
      titleCell.s = {
        font: { bold: true, sz: 14 },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: "FFFFFF" } },
        border: {
          top: { style: 'thin', color: { rgb: "000000" } },
          bottom: { style: 'thin', color: { rgb: "000000" } },
          left: { style: 'thin', color: { rgb: "000000" } },
          right: { style: 'thin', color: { rgb: "000000" } }
        }
      };
    }

    // Style pour les en-têtes (ligne 2) - FOND BLEU + TEXTE BLANC
    for (let col = 0; col <= 8; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col });
      const cell = ws[cellAddress];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: 'center', vertical: 'center' },
          fill: { fgColor: { rgb: "4472C4" } }, // Bleu comme votre image
          border: {
            top: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          }
        };
      }
    }

    // Style pour les données (lignes 3+) - Alternance bleu clair / blanc
    for (let row = 2; row <= range.e.r; row++) {
      const isBlueRow = (row - 2) % 2 === 0; // Lignes paires en bleu clair
      for (let col = 0; col <= 8; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = ws[cellAddress];
        if (cell) {
          cell.s = {
            alignment: { horizontal: col === 0 ? 'center' : 'left', vertical: 'center' },
            fill: { fgColor: { rgb: isBlueRow ? "B4C7E7" : "FFFFFF" } }, // Bleu clair alternant
            border: {
              top: { style: 'thin', color: { rgb: "000000" } },
              bottom: { style: 'thin', color: { rgb: "000000" } },
              left: { style: 'thin', color: { rgb: "000000" } },
              right: { style: 'thin', color: { rgb: "000000" } }
            }
          };
        }
      }
    }

    // Ajouter la feuille au workbook
    XLSX.utils.book_append_sheet(wb, ws, "Paris");

    // Générer le fichier
    const fileName = operatorName === "tous" 
      ? `rapport_paris_tous_${new Date().toISOString().split("T")[0]}.xlsx`
      : `rapport_paris_${operatorName}_${new Date().toISOString().split("T")[0]}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
    
    toast.success(`Export réussi: ${filteredByPeriod.length} pari${filteredByPeriod.length > 1 ? "s" : ""}`);
    setExportDialogOpen(false);
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
            <h1 className="text-2xl font-bold">Paris</h1>
            <p className="text-sm text-muted-foreground">
              Historique des paris enregistrés
            </p>
          </div>
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau pari
          </Button>
        </div>

        {/* Barre d'actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par opérateur, type, statut..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Gestion des opérateurs visibles */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Opérateurs visibles</h4>
                <div className="space-y-2">
                  {Object.keys(groupedBets).sort().map((operator) => (
                    <div key={operator} className="flex items-center gap-2">
                      <Checkbox
                        id={`op-${operator}`}
                        checked={!hiddenOperators.has(operator)}
                        onCheckedChange={() => toggleOperatorVisibility(operator)}
                      />
                      <label
                        htmlFor={`op-${operator}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {operator} ({groupedBets[operator].length})
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          
          <Button variant="outline" onClick={loadBets}>
            Actualiser
          </Button>
        </div>

        {/* Statistiques rapides */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">Total paris</p>
            <p className="text-2xl font-bold">{filteredBets.length}</p>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">Gagnés</p>
            <p className="text-2xl font-bold text-emerald-600">
              {filteredBets.filter((b) => b.status.toLowerCase() === "gagné" || b.status.toLowerCase() === "gagne").length}
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">Perdus</p>
            <p className="text-2xl font-bold text-red-600">
              {filteredBets.filter((b) => b.status.toLowerCase() === "perdu").length}
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">En attente</p>
            <p className="text-2xl font-bold text-blue-600">
              {filteredBets.filter((b) => b.status.toLowerCase().includes("attente")).length}
            </p>
          </div>
        </div>

        {/* Onglets par opérateur */}
        <Tabs value={activeOperator} onValueChange={setActiveOperator} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
            <TabsTrigger value="all" className="gap-2">
              Tous ({filteredBets.length})
            </TabsTrigger>
            {Object.keys(groupedBets)
              .filter(op => !hiddenOperators.has(op))
              .sort()
              .map((operator) => (
                <TabsTrigger key={operator} value={operator} className="gap-2">
                  📊 {operator} ({groupedBets[operator].length})
                </TabsTrigger>
              ))}
          </TabsList>

          {/* Contenu: Tous les paris */}
          <TabsContent value="all" className="space-y-3 mt-4">
            {/* Bouton export pour l'onglet "Tous" */}
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setExportDialogOpen(true)}
              >
                <Download className="h-4 w-4 mr-2" />
                Exporter tous les paris ({filteredBets.length})
              </Button>
            </div>
            
            {filteredBets.length > 0 ? (
              filteredBets.map((bet, index) => (
                <div
                  key={bet.id}
                  className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => openEditDialog(bet)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                      #{index + 1}
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-primary">{bet.operator}</span>
                        <span className="font-medium">
                          {new Date(bet.date).toLocaleDateString("fr-FR")}
                        </span>
                        {bet.time && (
                          <span className="text-sm text-muted-foreground">
                            {bet.time}
                          </span>
                        )}
                        <span className="text-sm px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                          {bet.support}
                        </span>
                        <span className="text-sm px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                          {bet.bet_type}
                        </span>
                        <span className={getStatusBadge(bet.status)}>
                          {bet.status}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Montant: </span>
                          <span className="font-semibold">{formatAmount(bet.amount_fcfa)}</span>
                        </div>
                        {bet.amount_won_fcfa && bet.amount_won_fcfa > 0 && (
                          <div>
                            <span className="text-muted-foreground">Gains: </span>
                            <span className="font-semibold text-emerald-600">
                              {formatAmount(bet.amount_won_fcfa)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {bet.notes && (
                        <p className="text-sm text-muted-foreground italic">
                          {bet.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Aucun pari trouvé
              </div>
            )}
          </TabsContent>

          {/* Contenu: Par opérateur */}
          {Object.keys(groupedBets)
            .filter(op => !hiddenOperators.has(op))
            .map((operator) => {
              const operatorBets = groupedBets[operator];
              return (
                <TabsContent key={operator} value={operator} className="space-y-3 mt-4">
                  {/* Bouton export pour cet opérateur */}
                  <div className="flex justify-end">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setExportDialogOpen(true)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Exporter {operator} ({operatorBets.length})
                    </Button>
                  </div>
                  
                  {operatorBets.map((bet, index) => (
                    <div
                      key={bet.id}
                      className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => openEditDialog(bet)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          #{index + 1}
                        </div>
                        
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-medium">
                              {new Date(bet.date).toLocaleDateString("fr-FR")}
                            </span>
                            {bet.time && (
                              <span className="text-sm text-muted-foreground">
                                {bet.time}
                              </span>
                            )}
                            <span className="text-sm px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                              {bet.support}
                            </span>
                            <span className="text-sm px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                              {bet.bet_type}
                            </span>
                            <span className={getStatusBadge(bet.status)}>
                              {bet.status}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Montant: </span>
                              <span className="font-semibold">{formatAmount(bet.amount_fcfa)}</span>
                            </div>
                            {bet.amount_won_fcfa && bet.amount_won_fcfa > 0 && (
                              <div>
                                <span className="text-muted-foreground">Gains: </span>
                                <span className="font-semibold text-emerald-600">
                                  {formatAmount(bet.amount_won_fcfa)}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {bet.notes && (
                            <p className="text-sm text-muted-foreground italic">
                              {bet.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              );
            })}
        </Tabs>

        <div className="text-sm text-muted-foreground">
          Affichage de {filteredBets.length} paris sur {bets.length} au total
        </div>
      </div>

      {/* Dialog de création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBet ? "Modifier le pari" : "Nouveau pari"}</DialogTitle>
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

            <CreatableSelect
              label="Type de pari"
              required
              value={formData.bet_type}
              onChange={(value) => setFormData({ ...formData, bet_type: value })}
              options={betTypes}
              placeholder="Tapez pour rechercher ou créer..."
              onCreateNew={createBetType}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Montant misé (F CFA) *</label>
                <Input
                  type="number"
                  value={formData.amount_fcfa || ""}
                  onChange={(e) => setFormData({ ...formData, amount_fcfa: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Statut</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="en attente">En attente</option>
                  <option value="gagné">Gagné</option>
                  <option value="perdu">Perdu</option>
                  <option value="annulé">Annulé</option>
                </select>
              </div>
            </div>

            {formData.status === "gagné" && (
              <div>
                <label className="text-xs font-medium">Montant gagné (F CFA)</label>
                <Input
                  type="number"
                  value={formData.amount_won_fcfa || ""}
                  onChange={(e) => setFormData({ ...formData, amount_won_fcfa: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            )}

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

      {/* Dialog d'export avancé */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>📥 Exporter les paris</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Période d'export</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={exportPeriod}
                onChange={(e) => setExportPeriod(e.target.value)}
              >
                <option value="all">Tous les paris</option>
                <option value="week">Dernière semaine</option>
                <option value="month">Dernier mois</option>
                <option value="custom">Période personnalisée</option>
              </select>
            </div>

            {exportPeriod === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Date de début</label>
                  <Input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Date de fin</label>
                  <Input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="bg-slate-50 p-3 rounded text-sm">
              <p className="font-medium mb-1">Aperçu de l'export :</p>
              <p className="text-muted-foreground">
                {filterBetsByPeriod(filteredBets).length} pari(s) seront exportés
              </p>
              {activeOperator !== "all" && (
                <p className="text-muted-foreground mt-1">
                  Opérateur: {activeOperator}
                </p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm">
              <p className="font-medium text-blue-900 mb-1">📋 Format d'export</p>
              <ul className="text-blue-700 space-y-1 text-xs">
                <li>✓ Titre du rapport avec période</li>
                <li>✓ Colonnes: N°, Date, Opérateur, Support, Type, Montant, Heure, Téléphone, Référence</li>
                <li>✓ Compatible Excel avec encodage UTF-8</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                Annuler
              </Button>
              <Button 
                onClick={() => {
                  const betsToExport = activeOperator === "all" 
                    ? filteredBets 
                    : groupedBets[activeOperator] || [];
                  exportToExcel(betsToExport, activeOperator);
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Exporter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
