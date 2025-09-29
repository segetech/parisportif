import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api, { Venue } from "@/data/api";
import { RequireAuth, useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { venueFormSchema, VenueFormValues } from "@/schemas/venue";
import {
  listVenues,
  createVenue,
  updateVenue,
  deleteVenue,
  type VenueFilters,
} from "@/api/venues";

const schema = venueFormSchema;

export default function VenuesPage() {
  return (
    <RequireAuth>
      <Venues />
    </RequireAuth>
  );
}

type FormValues = VenueFormValues;

function Venues() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [rows, setRows] = useState<Venue[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const canAgentManageVenues = api.store.settings.agentCanManageVenues;
  const [lookups, setLookups] = useState<{
    operators: string[];
    bet_types: string[];
  }>({ operators: [], bet_types: [] });

  // Filters
  const [filters, setFilters] = useState<VenueFilters>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [sortKey, setSortKey] = useState<
    | "quartier_no"
    | "quartier"
    | "operator"
    | "support"
    | "bet_type"
    | "address"
    | "contact_phone"
    | "gps_lat"
    | "gps_lng"
  >("quartier");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    (async () => {
      const l = await api.lookups.all();
      setLookups({
        operators: l.operators,
        bet_types: l.bet_types,
      });
    })();
  }, []);
  useEffect(() => {
    load();
  }, [filters, search]);

  async function load() {
    const data = await listVenues({ ...filters, q: search });
    setRows(data);
    setPage(1);
  }

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = (a as any)[sortKey] ?? "";
      const vb = (b as any)[sortKey] ?? "";
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const displayedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page]);

  function toggleSort(key: typeof sortKey) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function onNew() {
    setEditing(null);
    setOpen(true);
  }

  async function removeRow(id: string) {
    if (!isAdmin) return;
    if (!confirm("Supprimer cette salle ? Cette action est définitive.")) return;
    await deleteVenue(id);
    await load();
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      support: "Salle de jeux",
    } as any,
  });

  const [submitting, setSubmitting] = useState(false);
  async function onSubmit(values: FormValues) {
    try {
      setSubmitting(true);
      if (editing) {
        await updateVenue(editing.id, values as any);
      } else {
        await createVenue({ ...(values as any), created_by: user!.id });
      }
      setOpen(false);
      toast.success("Salle enregistrée.");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!open) reset();
    else if (editing) reset(editing as any);
  }, [open]);

  const canManageLookups = isAdmin || api.store.settings.agentsCanAddLookups;
  async function addLookup(
    key: keyof typeof api.store.lookups,
    label: string,
    onAdded?: (value: string) => void,
  ) {
    if (!canManageLookups) {
      toast.error("Accès refusé : création réservée à l’admin.");
      return;
    }
    const name = window.prompt(`Ajouter ${label} :`);
    if (!name) return;
    await api.lookups.add(key as any, name);
    const l = await api.lookups.all();
    setLookups({
      operators: l.operators,
      bet_types: l.bet_types,
    });
    onAdded?.(name);
    toast.success(`${label} ajouté(e).`);
  }

  return (
    <AppLayout
      onNew={!isAdmin && !canAgentManageVenues ? undefined : onNew}
      newButtonLabel="+ Nouvelle salle"
    >
      {/* Filtres */}
      <div className="mb-3 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium">Quartier</label>
          <Input
            placeholder="Filtrer par quartier"
            value={filters.quartier ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, quartier: e.target.value || undefined }))}
          />
        </div>
        <div>
          <label className="text-xs font-medium">Opérateur</label>
          <Select
            value={filters.operator ?? ""}
            onValueChange={(v) => setFilters((f) => ({ ...f, operator: v || undefined }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              {lookups.operators.map((op) => (
                <SelectItem key={op} value={op}>
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Type de pari</label>
          <Select
            value={filters.bet_type ?? ""}
            onValueChange={(v) => setFilters((f) => ({ ...f, bet_type: v || undefined }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              {lookups.bet_types.map((op) => (
                <SelectItem key={op} value={op}>
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Recherche</label>
          <Input
            placeholder="Texte libre"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-span-1 md:col-span-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFilters({});
              setSearch("");
            }}
          >
            Réinitialiser les filtres
          </Button>
          {isAdmin && (
            <Button type="button" onClick={() => exportCsv(displayedRows)}>
              Exporter CSV
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("quartier_no")}>
                  N° quartier {sortKey === "quartier_no" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("quartier")}>
                  Quartier {sortKey === "quartier" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("operator")}>
                  Opérateur {sortKey === "operator" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("support")}>
                  Support {sortKey === "support" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("bet_type")}>
                  Type de pari {sortKey === "bet_type" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("address")}>
                  Adresse {sortKey === "address" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("contact_phone")}>
                  Téléphone {sortKey === "contact_phone" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("gps_lat")}>
                  Latitude {sortKey === "gps_lat" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>
                <button className="underline-offset-2 hover:underline" onClick={() => toggleSort("gps_lng")}>
                  Longitude {sortKey === "gps_lng" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              displayedRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.quartier_no ?? "-"}</TableCell>
                  <TableCell>{r.quartier}</TableCell>
                  <TableCell>{r.operator}</TableCell>
                  <TableCell>{r.support}</TableCell>
                  <TableCell>{r.bet_type}</TableCell>
                  <TableCell>{r.address}</TableCell>
                  <TableCell>{r.contact_phone ?? "-"}</TableCell>
                  <TableCell>{r.gps_lat ?? "-"}</TableCell>
                  <TableCell>{r.gps_lng ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => alert(JSON.stringify(r, null, 2))}
                      >
                        Voir
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isAdmin && !canAgentManageVenues}
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        Éditer
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isAdmin && !canAgentManageVenues}
                        onClick={() => {
                          setEditing(null);
                          setOpen(true);
                          setTimeout(
                            () =>
                              reset({
                                ...r,
                                quartier_no: r.quartier_no,
                                notes: r.notes,
                              } as any),
                            0,
                          );
                          toast.info("Copie de la salle prête, vérifiez et enregistrez.");
                        }}
                      >
                        Dupliquer
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeRow(r.id)}
                        >
                          Supprimer
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-sm text-muted-foreground"
                >
                  Aucune salle trouvée pour ces filtres.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="flex items-center justify-end gap-2 py-2">
          <span className="text-sm text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Précédent
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Suivant
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Éditer" : "Nouvelle"} salle</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">N° quartier</label>
                <Input {...register("quartier_no")} />
              </div>
              <div>
                <label className="text-xs font-medium">Quartier</label>
                <Input {...register("quartier")} />
                {errors.quartier && (
                  <p className="text-xs text-red-600">
                    {errors.quartier.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Opérateur de jeux</label>
                <Select
                  value={watch("operator")}
                  onValueChange={(v) => {
                    if (v === "__add__") return addLookup("operators", "opérateur", (name) => setValue("operator", name));
                    setValue("operator", v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.operators.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                    <SelectItem value="__add__">+ Ajouter un opérateur…</SelectItem>
                  </SelectContent>
                </Select>
                {errors.operator && (
                  <p className="text-xs text-red-600">
                    {errors.operator.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium">Support</label>
                {/* Hidden registration for RHF */}
                <input type="hidden" value="Salle de jeux" {...register("support")} />
                <Input value="Salle de jeux" readOnly />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Type de pari</label>
                <Select
                  value={watch("bet_type")}
                  onValueChange={(v) => setValue("bet_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.bet_types.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.bet_type && (
                  <p className="text-xs text-red-600">
                    {errors.bet_type.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium">
                  Adresse / Localisation
                </label>
                <Input {...register("address")} />
                {errors.address && (
                  <p className="text-xs text-red-600">
                    {errors.address.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Téléphone contact</label>
                <Input {...register("contact_phone")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Latitude</label>
                  <Input
                    type="number"
                    step="any"
                    {...register("gps_lat", { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Longitude</label>
                  <Input
                    type="number"
                    step="any"
                    {...register("gps_lng", { valueAsNumber: true })}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <Input {...register("notes")} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>Enregistrer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Carte placeholder */}
      <div className="mt-4 border rounded-md p-3">
        <div className="font-medium mb-2">Carte (à venir)</div>
        {rows.some((r) => r.gps_lat && r.gps_lng) ? (
          <ul className="text-sm list-disc pl-5">
            {rows
              .filter((r) => r.gps_lat && r.gps_lng)
              .map((r) => (
                <li key={r.id}>
                  {r.quartier}: ({r.gps_lat}, {r.gps_lng})
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune coordonnée disponible dans la sélection actuelle.
          </p>
        )}
      </div>
    </AppLayout>
  );
}

function exportCsv(rows: Venue[]) {
  const headers = [
    "quartier_no",
    "quartier",
    "operator",
    "support",
    "bet_type",
    "address",
    "contact_phone",
    "gps_lat",
    "gps_lng",
    "notes",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.quartier_no ?? "",
        r.quartier,
        r.operator,
        r.support,
        r.bet_type,
        r.address,
        r.contact_phone ?? "",
        r.gps_lat ?? "",
        r.gps_lng ?? "",
        (r.notes ?? "").replace(/\n|\r|,/g, " "),
      ]
        .map((v) => `${v}`.replace(/"/g, '""'))
        .map((v) => (v.includes(",") ? `"${v}"` : v))
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "salles.csv";
  a.click();
  URL.revokeObjectURL(url);
}
