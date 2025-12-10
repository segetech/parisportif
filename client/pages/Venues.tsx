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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Venue {
  id: string;
  quartier_no?: string;
  quartier: string;
  operator: string;
  support: string;
  bet_type: string;
  address: string;
  contact_phone?: string;
  gps_lat?: number;
  gps_lng?: number;
  notes?: string;
}

export default function VenuesPage() {
  return (
    <RequireAuth>
      <Venues />
    </RequireAuth>
  );
}

function Venues() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  
  // États
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  
  // Listes déroulantes
  const [operators, setOperators] = useState<string[]>([]);
  const [supports, setSupports] = useState<string[]>([]);
  const [betTypes, setBetTypes] = useState<string[]>([]);
  
  // Filtres
  const [search, setSearch] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [betTypeFilter, setBetTypeFilter] = useState("");
  
  // Formulaire
  const [formData, setFormData] = useState({
    quartier_no: "",
    quartier: "",
    operator: "",
    support: "",
    bet_type: "",
    address: "",
    contact_phone: "",
    gps_lat: undefined as number | undefined,
    gps_lng: undefined as number | undefined,
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadVenues(),
        loadOperators(),
        loadSupports(),
        loadBetTypes(),
      ]);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }

  async function loadVenues() {
    const { data, error } = await supabase
      .from("venues")
      .select("*")
      .order("quartier");
    
    if (error) throw error;
    if (data) setVenues(data);
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

  // Fonctions pour créer de nouveaux éléments
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

  const filteredVenues = useMemo(() => {
    return venues.filter(v => {
      if (operatorFilter && v.operator !== operatorFilter) return false;
      if (betTypeFilter && v.bet_type !== betTypeFilter) return false;
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          v.quartier.toLowerCase().includes(searchLower) ||
          v.address.toLowerCase().includes(searchLower) ||
          v.contact_phone?.toLowerCase().includes(searchLower) ||
          v.notes?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [venues, operatorFilter, betTypeFilter, search]);

  function openDialog(venue?: Venue) {
    if (venue) {
      setEditing(venue);
      setFormData({
        quartier_no: venue.quartier_no || "",
        quartier: venue.quartier,
        operator: venue.operator,
        support: venue.support,
        bet_type: venue.bet_type,
        address: venue.address,
        contact_phone: venue.contact_phone || "",
        gps_lat: venue.gps_lat,
        gps_lng: venue.gps_lng,
        notes: venue.notes || "",
      });
    } else {
      setEditing(null);
      setFormData({
        quartier_no: "",
        quartier: "",
        operator: "",
        support: "",
        bet_type: "",
        address: "",
        contact_phone: "",
        gps_lat: undefined,
        gps_lng: undefined,
        notes: "",
      });
    }
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!formData.quartier || !formData.operator || !formData.bet_type || !formData.address) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    try {
      const isAgent = user?.role === "AGENT";
      const venueData = {
        ...formData,
        quartier_no: formData.quartier_no || null,
        contact_phone: formData.contact_phone || null,
        gps_lat: formData.gps_lat || null,
        gps_lng: formData.gps_lng || null,
        notes: formData.notes || null,
        created_by: user?.id,
        validation_status: isAgent ? "en_attente" : "valide",
      };

      if (editing) {
        const { error } = await supabase
          .from("venues")
          .update(venueData)
          .eq("id", editing.id);
        
        if (error) throw error;
        toast.success("Salle mise à jour avec succès");
      } else {
        const { error } = await supabase
          .from("venues")
          .insert([venueData]);
        
        if (error) throw error;
        toast.success(
          isAgent
            ? "Salle créée avec succès. En attente de validation."
            : "Salle créée avec succès"
        );
      }

      setDialogOpen(false);
      await loadVenues();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette salle ?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("venues")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Salle supprimée avec succès");
      await loadVenues();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la suppression");
    }
  }

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
            <h1 className="text-2xl font-bold">Salles de jeux</h1>
            <p className="text-sm text-muted-foreground">
              Gérer les salles de paris physiques
            </p>
          </div>
          <Button onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle salle
          </Button>
        </div>

        {/* Filtres */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium">Recherche</label>
            <Input
              placeholder="Quartier, adresse..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium">Opérateur</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
            >
              <option value="">Tous</option>
              {operators.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Type de pari</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={betTypeFilter}
              onChange={(e) => setBetTypeFilter(e.target.value)}
            >
              <option value="">Tous</option>
              {betTypes.map(bt => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setOperatorFilter("");
                setBetTypeFilter("");
              }}
            >
              Réinitialiser
            </Button>
          </div>
        </div>

        {/* Tableau */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° Quartier</TableHead>
                <TableHead>Quartier</TableHead>
                <TableHead>Opérateur</TableHead>
                <TableHead>Type de pari</TableHead>
                <TableHead>Adresse</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVenues.length > 0 ? (
                filteredVenues.map((venue) => (
                  <TableRow key={venue.id}>
                    <TableCell>{venue.quartier_no || "—"}</TableCell>
                    <TableCell className="font-medium">{venue.quartier}</TableCell>
                    <TableCell>{venue.operator}</TableCell>
                    <TableCell>{venue.bet_type}</TableCell>
                    <TableCell>{venue.address}</TableCell>
                    <TableCell>{venue.contact_phone || "—"}</TableCell>
                    <TableCell>
                      {venue.gps_lat && venue.gps_lng
                        ? `${venue.gps_lat.toFixed(4)}, ${venue.gps_lng.toFixed(4)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(venue)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(venue.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    Aucune salle trouvée
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          Total : {filteredVenues.length} salle(s)
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier" : "Nouvelle"} salle
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">N° Quartier</label>
                <Input
                  value={formData.quartier_no}
                  onChange={(e) => setFormData({ ...formData, quartier_no: e.target.value })}
                  placeholder="Optionnel"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Quartier *</label>
                <Input
                  value={formData.quartier}
                  onChange={(e) => setFormData({ ...formData, quartier: e.target.value })}
                  placeholder="Nom du quartier"
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

            <div>
              <label className="text-xs font-medium">Adresse *</label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Adresse complète"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Téléphone</label>
              <Input
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="Ex: +223..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Latitude</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.gps_lat || ""}
                  onChange={(e) => setFormData({ ...formData, gps_lat: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Ex: 12.6392"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Longitude</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.gps_lng || ""}
                  onChange={(e) => setFormData({ ...formData, gps_lng: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Ex: -8.0029"
                />
              </div>
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
