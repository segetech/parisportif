import { testCatalogLabel } from "@/lib/test-vocabulary";
import { RecordForm } from "@/components/common/RecordForm";
import { useFormDraft } from "@/hooks/use-form-draft";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useOptionalSettings } from "@/lib/settings";
import { canAgentEditRecord } from "@/lib/rbac";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { CreatableSelect } from "@/components/ui/creatable-select";
import {
  Plus,
  Eye,
  Trash2,
  RefreshCw,
  Building,
  MapPin,
  Phone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  useVenues,
  useLookups,
  useCreateVenue,
  useUpdateVenue,
  useDeleteVenue,
} from "@/hooks/use-data-queries";
import { invalidateRelatedQueries } from "@/lib/queryClient";

interface Venue {
  id: string;
  quartier_no?: string;
  quartier: string;
  operator: string;
  support: string;
  bet_type: string;
  games?: string[];
  address: string;
  contact_phone?: string;
  gps_lat?: number;
  gps_lng?: number;
  notes?: string;
  validation_status?: string;
  created_at?: string;
  updated_at?: string;
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
  const settings = useOptionalSettings();
  const canManageVenues = user?.role !== "AGENT" || settings.agentCanManageVenues;

  // États
  // Centralisation TanStack React Query pour navigation instantanée
  const { data: venues = [], isLoading, isFetching, refetch } = useVenues();
  const { data: lookupsData } = useLookups();
  const createVenueMutation = useCreateVenue();
  const updateVenueMutation = useUpdateVenue();
  const deleteVenueMutation = useDeleteVenue();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);

  // Listes déroulantes synchronisées depuis le cache
  const operators =
    lookupsData?.activeOperatorNames && lookupsData.activeOperatorNames.length > 0
      ? lookupsData.activeOperatorNames
      : lookupsData?.operatorNames || [];
  const supports = lookupsData?.supportNames || [];
  const betTypes = lookupsData?.betTypeNames || [];

  // Filtres
  const [search, setSearch] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [betTypeFilter, setBetTypeFilter] = useState("");

  // Formulaire
  const [formData, setFormData] = useState({
    quartier_no: "",
    quartier: "",
    operator: "",
    support: "Site de test",
    bet_type: "",
    address: "",
    contact_phone: "",
    gps_lat: undefined as number | undefined,
    gps_lng: undefined as number | undefined,
    notes: "",
  });

  const {
    hasDraft,
    savedAtFormatted,
    hasConflict,
    saveStatus,
    restoreDraft,
    discardDraft,
    clearDraftOnSuccess,
    notifyChange,
  } = useFormDraft(formData, setFormData, {
    entityType: "venues",
    recordId: editing?.id || "new",
    serverUpdatedAt: editing?.updated_at || editing?.created_at,
  });

  const [selectedGames, setSelectedGames] = useState<string[]>([]);

  // Fonctions pour créer de nouveaux éléments
  async function createOperator(name: string) {
    const { error } = await supabase.from("operators").insert([{ name }]);

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
    const { error } = await supabase.from("supports").insert([{ name }]);

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

  async function createBetType(name: string) {
    const { error } = await supabase.from("bet_types").insert([{ name }]);

    if (error) {
      if (error.code === "23505") {
        toast.error("Ce type de test existe déjà");
      } else {
        toast.error("Erreur lors de la création");
      }
      throw error;
    }

    invalidateRelatedQueries("lookups");
    toast.success(`Type de test "${name}" créé avec succès`);
  }

  const filteredVenues = useMemo(() => {
    return venues.filter((v) => {
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
      const existingGames =
        venue.games && venue.games.length > 0
          ? venue.games
          : venue.bet_type
            ? [venue.bet_type]
            : [];
      setSelectedGames(existingGames);
      setFormData({
        quartier_no: venue.quartier_no || "",
        quartier: venue.quartier,
        operator: venue.operator,
        support: venue.support || "Salle de jeux",
        bet_type: venue.bet_type || existingGames[0] || "",
        address: venue.address,
        contact_phone: venue.contact_phone || "",
        gps_lat: venue.gps_lat,
        gps_lng: venue.gps_lng,
        notes: venue.notes || "",
      });
    } else {
      setEditing(null);
      setSelectedGames([]);
      setFormData({
        quartier_no: "",
        quartier: "",
        operator: operators[0] || "",
        support: "Site de test",
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

  function toggleGame(gameName: string) {
    setSelectedGames((prev) =>
      prev.includes(gameName)
        ? prev.filter((g) => g !== gameName)
        : [...prev, gameName],
    );
  }

  async function handleSubmit() {
    const primaryGame = selectedGames[0] || formData.bet_type;
    if (
      !formData.quartier ||
      !formData.operator ||
      !primaryGame ||
      !formData.address
    ) {
      toast.error(
        "Veuillez remplir le quartier, l'opérateur, l'adresse et au moins un type de jeu.",
      );
      return;
    }

    try {
      const isAgent = user?.role === "AGENT";
      const venueData = {
        ...formData,
        bet_type: primaryGame,
        games: selectedGames.length > 0 ? selectedGames : [primaryGame],
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
          .eq("id", editing.id)
          .select("id")
          .single();

        if (error) throw error;
        toast.success("Site mise à jour avec succès");
      } else {
        const { data: newV, error } = await supabase
          .from("venues")
          .insert([venueData])
          .select("id")
          .single();

        if (error) throw error;

        // Insertion dans venue_games
        if (newV && selectedGames.length > 0) {
          const gameRecords = selectedGames.map((g) => ({
            venue_id: newV.id,
            game_name: g,
            active: true,
          }));
          await supabase.from("venue_games").insert(gameRecords);
        }

        toast.success(
          isAgent
            ? "Site créée avec succès. En attente de validation par le contrôleur."
            : "Site créée avec succès",
        );
      }

      clearDraftOnSuccess();
      setDialogOpen(false);
      await refetch();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce site ?")) {
      return;
    }

    try {
      const { error } = await supabase.from("venues").delete().eq("id", id);

      if (error) throw error;
      toast.success("Site supprimée avec succès");
      await refetch();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la suppression");
    }
  }

  if (isLoading && venues.length === 0) {
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
            <h1 className="text-2xl font-bold">Sites de test</h1>
            <p className="text-sm text-muted-foreground">

              Gérer les sites de test
            </p>
          </div>
          {canManageVenues && (
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />

              Nouveau site
            </Button>
          )}
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
              {operators.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Type de test</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={betTypeFilter}
              onChange={(e) => setBetTypeFilter(e.target.value)}
            >
              <option value="">Tous</option>
              {betTypes.map((bt) => (
                <option key={testCatalogLabel(bt)} value={bt}>
                  {bt}
                </option>
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

        {/* VUE TABLEAU DESKTOP (>= 768px) */}
        <div className="hidden md:block rounded-xl border border-[#D8E6DB] bg-white overflow-hidden shadow-xs">
          <Table>
            <TableHeader className="bg-[#F5F8F5]">
              <TableRow>
                <TableHead className="text-xs font-bold text-[#556B5C]">
                  N° Quartier
                </TableHead>
                <TableHead className="text-xs font-bold text-[#556B5C]">
                  Quartier
                </TableHead>
                <TableHead className="text-xs font-bold text-[#556B5C]">
                  Opérateur
                </TableHead>
                <TableHead className="text-xs font-bold text-[#556B5C]">

                  Types de test proposés
                </TableHead>
                <TableHead className="text-xs font-bold text-[#556B5C]">
                  Adresse
                </TableHead>
                <TableHead className="text-xs font-bold text-[#556B5C]">
                  Téléphone
                </TableHead>
                <TableHead className="text-xs font-bold text-[#556B5C]">
                  GPS
                </TableHead>
                <TableHead className="text-right text-xs font-bold text-[#556B5C]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVenues.length > 0 ? (
                filteredVenues.map((venue) => {
                  const venueGames =
                    venue.games && venue.games.length > 0
                      ? venue.games
                      : [venue.bet_type];
                  return (
                    <TableRow
                      key={venue.id}
                      className="hover:bg-[#F5F8F5]/60 transition-colors"
                    >
                      <TableCell className="text-xs text-[#556B5C] font-mono">
                        {venue.quartier_no || "—"}
                      </TableCell>
                      <TableCell className="font-bold text-xs text-[#17251C]">
                        {venue.quartier}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-[#17251C]">
                        {venue.operator}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {venueGames.map((g, gi) => (
                            <Badge
                              key={gi}
                              variant="outline"
                              className="text-[10px] bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C]"
                            >
                              {g}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-[#556B5C] max-w-xs truncate">
                        {venue.address}
                      </TableCell>
                      <TableCell className="text-xs text-[#556B5C]">
                        {venue.contact_phone || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-[#556B5C]">
                        {venue.gps_lat && venue.gps_lng
                          ? `${venue.gps_lat.toFixed(4)}, ${venue.gps_lng.toFixed(4)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Consulter le site"
                            onClick={() => openDialog(venue)}
                            className="h-8 w-8 p-0 text-[#556B5C] hover:text-[#006B2D] hover:bg-[#F5F8F5]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(venue.id)}
                              className="h-8 w-8 p-0 text-[#E52329] hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-[#556B5C] py-12"
                  >

                    Aucun site trouvée
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* VUE CARTES MOBILE (< 768px) ERGONOMIQUE ET ACCESSIBLE AU TOUCHER */}
        <div className="block md:hidden space-y-3">
          {filteredVenues.length > 0 ? (
            filteredVenues.map((venue) => {
              const venueGames =
                venue.games && venue.games.length > 0
                  ? venue.games
                  : [venue.bet_type];
              return (
                <div
                  key={venue.id}
                  className="p-4 bg-white rounded-2xl border border-[#D8E6DB] space-y-2.5 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black px-2 py-0.5 rounded bg-[#006B2D]/10 text-[#006B2D] border border-[#006B2D]/20">
                        {venue.quartier_no
                          ? `N° ${venue.quartier_no}`
                          : "Salle"}
                      </span>
                      <span className="font-extrabold text-sm text-[#17251C]">
                        {venue.quartier}
                      </span>
                    </div>
                    <Badge className="bg-[#17251C] text-white font-bold text-xs">
                      {venue.operator}
                    </Badge>
                  </div>

                  <div className="text-xs text-[#556B5C] flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#006B2D] mt-0.5" />
                    <span>{venue.address}</span>
                  </div>

                  {venue.contact_phone && (
                    <div className="text-xs text-[#556B5C] flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-[#006B2D]" />
                      <span>{venue.contact_phone}</span>
                    </div>
                  )}

                  <div className="pt-1 border-t border-[#D8E6DB]/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#556B5C] block mb-1">
                      Jeux rattachés ({venueGames.length}) :
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {venueGames.map((g, gi) => (
                        <Badge
                          key={gi}
                          variant="outline"
                          className="text-[11px] bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C]"
                        >
                          {g}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D8E6DB]/60">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog(venue)}
                      className="min-h-[44px] px-4 text-xs font-semibold border-[#D8E6DB] text-[#17251C]"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" /> Consulter
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(venue.id)}
                        className="min-h-[44px] px-3 text-xs text-[#E52329] hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-sm text-[#556B5C] bg-white rounded-2xl border border-[#D8E6DB]">

              Aucun site trouvée
            </div>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          Total : {filteredVenues.length}  site(s)
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-[#17251C]">
              {editing ? "Consulter le site" : "Nouveau site de test"}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#5C7363]">
              {editing
                ? "Détails et paramètres du site physique de test."
                : "Enregistrement d'un nouveau site physique de test."}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const venueEdit = !canManageVenues
              ? {
                  allowed: false,
                  reason:
                    "La gestion des sites est désactivée pour les agents dans les paramètres.",
                }
              : editing
                ? canAgentEditRecord(
                    user?.role,
                    editing.validation_status,
                    undefined,
                    settings.agentEditWindowMinutes,
                  )
                : { allowed: true };
            return (
          <RecordForm
            key={`${dialogOpen}-${editing?.id || "new"}`}
            existing={!!editing}
            onSave={handleSubmit}
            onClose={() => setDialogOpen(false)}
            onRestore={() => openDialog(editing!)}
            createLabel="Créer le site"
            hasDraft={hasDraft}
            draftTime={savedAtFormatted}
            hasConflict={hasConflict}
            onRestoreDraft={restoreDraft}
            onDiscardDraft={discardDraft}
            draftSaveStatus={saveStatus}
            canEdit={venueEdit.allowed}
            editBlockedReason={venueEdit.reason}
          >
            <div className="grid gap-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] block mb-1">
                    N° Quartier
                  </label>
                  <Input
                    value={formData.quartier_no}
                    onChange={(e) =>
                      setFormData({ ...formData, quartier_no: e.target.value })
                    }
                    placeholder="Ex: 1, 2..."
                    className="bg-white border-[#D8E6DB]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] block mb-1">
                    Quartier *
                  </label>
                  <Input
                    value={formData.quartier}
                    onChange={(e) =>
                      setFormData({ ...formData, quartier: e.target.value })
                    }
                    placeholder="Ex: Niamana, Faladié..."
                    className="bg-white border-[#D8E6DB]"
                  />
                </div>
              </div>

              <CreatableSelect
                label="Opérateur"
                required
                value={formData.operator}
                onChange={(value) =>
                  setFormData({ ...formData, operator: value })
                }
                options={operators}
                placeholder="Ex: Bet223, PremierBet, 1xBet, MALIBET..."
                onCreateNew={createOperator}
              />

              <CreatableSelect
                label="Support"
                required
                value={formData.support}
                onChange={(value) =>
                  setFormData({ ...formData, support: value })
                }
                options={supports}
                placeholder="Site de test, Guichet..."
                onCreateNew={createSupport}
              />

              {/* SÉLECTEUR MULTI-JEUX POUR UN SEUL ÉTABLISSEMENT */}
              <div className="space-y-2 p-3 bg-[#F5F8F5] rounded-xl border border-[#D8E6DB]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#17251C] block">
                    Jeux disponibles dans cet établissement *
                  </label>
                  <span className="text-[10px] text-[#006B2D] font-bold">
                    {selectedGames.length} jeu(x) sélectionné(s)
                  </span>
                </div>
                <p className="text-[11px] text-[#556B5C]">

                  Cochez tous les types de test proposés par ce site (un seul
                  établissement, plusieurs types de test).
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 max-h-48 overflow-y-auto no-scrollbar">
                  {betTypes.map((bt) => {
                    const isChecked = selectedGames.includes(bt);
                    return (
                      <label
                        key={bt}
                        onClick={() => toggleGame(bt)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? "bg-[#006B2D]/10 border-[#006B2D] text-[#006B2D] font-bold"
                            : "bg-white border-[#D8E6DB] text-[#17251C] hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by label onClick
                          className="h-3.5 w-3.5 text-[#006B2D] rounded border-[#D8E6DB]"
                        />
                        <span className="truncate">{bt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] block mb-1">
                  Adresse / Localisation *
                </label>
                <Input
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  placeholder="Ex: Ancienne poste du 11e arrondissement..."
                  className="bg-white border-[#D8E6DB]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] block mb-1">
                  Téléphone de contact
                </label>
                <Input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, contact_phone: e.target.value })
                  }
                  placeholder="Ex: 0701020304"
                  className="bg-white border-[#D8E6DB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] block mb-1">
                    Latitude GPS
                  </label>
                  <Input
                    type="number"
                    step="any"
                    value={formData.gps_lat || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gps_lat: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: 12.6392"
                    className="bg-white border-[#D8E6DB]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] block mb-1">
                    Longitude GPS
                  </label>
                  <Input
                    type="number"
                    step="any"
                    value={formData.gps_lng || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gps_lng: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: -8.0029"
                    className="bg-white border-[#D8E6DB]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] block mb-1">
                  Notes & Observations
                </label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Informations additionnelles..."
                  rows={2}
                  className="bg-white border-[#D8E6DB]"
                />
              </div>
            </div>
          </RecordForm>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
