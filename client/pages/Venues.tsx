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
import { useEffect, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const schema = z.object({
  quartier_no: z.string().optional(),
  quartier: z.string().min(1, { message: "Quartier requis" }),
  operator: z.string().min(1, { message: "Opérateur requis" }),
  support: z.string().min(1, { message: "Support requis" }),
  bet_type: z.string().min(1, { message: "Type de pari requis" }),
  address: z.string().min(1, { message: "Adresse requise" }),
  contact_phone: z.string().optional(),
  gps_lat: z.coerce.number().optional(),
  gps_lng: z.coerce.number().optional(),
  notes: z.string().optional(),
});

export default function VenuesPage() {
  return (
    <RequireAuth>
      <Venues />
    </RequireAuth>
  );
}

type FormValues = z.infer<typeof schema>;

function Venues() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [rows, setRows] = useState<Venue[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [lookups, setLookups] = useState<{
    operators: string[];
    supports: string[];
    bet_types: string[];
  }>({ operators: [], supports: [], bet_types: [] });

  useEffect(() => {
    (async () => {
      const l = await api.lookups.all();
      setLookups({
        operators: l.operators,
        supports: l.supports,
        bet_types: l.bet_types,
      });
    })();
  }, []);
  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await api.venues.list();
    setRows(data);
  }

  function onNew() {
    setEditing(null);
    setOpen(true);
  }

  async function removeRow(id: string) {
    if (!isAdmin) return;
    if (!confirm("Supprimer cette salle ?")) return;
    await api.venues.delete(id);
    await load();
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        await api.venues.update(editing.id, values as any);
      } else {
        await api.venues.create(values as any);
      }
      setOpen(false);
      toast.success("Salle enregistrée.");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inconnue");
    }
  }

  useEffect(() => {
    if (!open) reset();
    else if (editing) reset(editing as any);
  }, [open]);

  return (
    <AppLayout onNew={onNew} newButtonLabel="+ Nouvelle salle">
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N° quartier</TableHead>
              <TableHead>Quartier</TableHead>
              <TableHead>Opérateur</TableHead>
              <TableHead>Support</TableHead>
              <TableHead>Type de pari</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.quartier_no ?? "-"}</TableCell>
                  <TableCell>{r.quartier}</TableCell>
                  <TableCell>{r.operator}</TableCell>
                  <TableCell>{r.support}</TableCell>
                  <TableCell>{r.bet_type}</TableCell>
                  <TableCell>{r.address}</TableCell>
                  <TableCell>{r.contact_phone ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
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
                  colSpan={8}
                  className="text-center text-sm text-muted-foreground"
                >
                  Aucune donnée pour cette période.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
                  onValueChange={(v) => setValue("operator", v)}
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
                <Select
                  value={watch("support")}
                  onValueChange={(v) => setValue("support", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.supports.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.support && (
                  <p className="text-xs text-red-600">
                    {errors.support.message}
                  </p>
                )}
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
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
