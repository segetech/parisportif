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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api, { Bet } from "@/data/api";
import { RequireAuth, useAuth } from "@/context/AuthContext";
import dayjs from "dayjs";
import { DATE_FORMAT, TIME_FORMAT } from "@/lib/dayjs";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const schema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/g, { message: "Date au format AAAA-MM-JJ" }),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
        message: "L’heure doit être au format HH:MM (24h).",
      }),
    operator: z.string().min(1, { message: "Opérateur requis" }),
    support: z.string().min(1, { message: "Support requis" }),
    bet_type: z.string().min(1, { message: "Type de pari requis" }),
    amount_fcfa: z.coerce
      .number()
      .int()
      .positive({ message: "Le montant doit être un entier positif." }),
    status: z.enum(["gagné", "perdu", "en attente"]),
    reference: z.string().min(1, { message: "Référence requise" }),
    notes: z.string().optional(),
  });

type FormValues = z.infer<typeof schema>;

export default function BetsPage() {
  return (
    <RequireAuth>
      <Bets />
    </RequireAuth>
  );
}

function Bets() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [rows, setRows] = useState<Bet[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bet | null>(null);
  const [lookups, setLookups] = useState<{
    operators: string[];
    supports: string[];
    bet_types: string[];
    statuses: string[];
  }>({ operators: [], supports: [], bet_types: [], statuses: [] });

  useEffect(() => {
    (async () => {
      const l = await api.lookups.all();
      setLookups({
        operators: l.operators,
        supports: l.supports,
        bet_types: l.bet_types,
        statuses: l.statuses,
      });
    })();
  }, []);
  useEffect(() => {
    load();
  }, [user?.id]);

  async function load() {
    const createdByOnly = user?.role === "AGENT" ? user.id : undefined;
    const data = await api.bets.list({ createdByOnly });
    setRows(data);
  }

  function onNew() {
    setEditing(null);
    setOpen(true);
  }

  async function removeRow(id: string) {
    if (!isAdmin) return;
    if (!confirm("Supprimer ce pari ?")) return;
    setRows((r) => r.filter((x) => x.id !== id));
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
      date: dayjs().format(DATE_FORMAT),
      time: dayjs().format(TIME_FORMAT),
      status: "en attente",
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        setRows((prev) =>
          prev.map((b) =>
            b.id === editing.id ? ({ ...b, ...values } as any) : b,
          ),
        );
      } else {
        const row = await api.bets.create({
          ...(values as Omit<Bet, "id" | "created_at">),
          created_by: user!.id,
        });
        setRows((prev) => [row, ...prev]);
      }
      setOpen(false);
      toast.success("Pari enregistré.");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inconnue");
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
      supports: l.supports,
      bet_types: l.bet_types,
      statuses: l.statuses,
    });
    onAdded?.(name);
    toast.success(`${label} ajouté(e).`);
  }

  return (
    <AppLayout onNew={onNew} newButtonLabel="+ Nouveau pari">
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Heure</TableHead>
              <TableHead>Opérateur</TableHead>
              <TableHead>Support</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Référence</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.time}</TableCell>
                  <TableCell>{r.operator}</TableCell>
                  <TableCell>{r.support}</TableCell>
                  <TableCell>{r.bet_type}</TableCell>
                  <TableCell>
                    {new Intl.NumberFormat("fr-FR").format(r.amount_fcfa)} F CFA
                  </TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>{r.reference}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onClick={() => alert(JSON.stringify(r, null, 2))}
                          >
                            Voir
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(r);
                              setOpen(true);
                            }}
                          >
                            Éditer
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(null);
                              setOpen(true);
                              setTimeout(
                                () =>
                                  reset({
                                    ...r,
                                    reference: r.reference + "-copy",
                                  } as any),
                                0,
                              );
                            }}
                          >
                            Dupliquer
                          </DropdownMenuItem>
                          {isAdmin && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => removeRow(r.id)}
                            >
                              Supprimer
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
            <DialogTitle>{editing ? "Éditer" : "Nouveau"} pari</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Date</label>
                <Input type="date" {...register("date")} />
                {errors.date && (
                  <p className="text-xs text-red-600">{errors.date.message}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium">Heure</label>
                <Input type="time" {...register("time")} />
                {errors.time && (
                  <p className="text-xs text-red-600">{errors.time.message}</p>
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
                <Select
                  value={watch("support")}
                  onValueChange={(v) => {
                    if (v === "__add__") return addLookup("supports", "support", (name) => setValue("support", name));
                    setValue("support", v);
                  }}
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
                    <SelectItem value="__add__">+ Ajouter un support…</SelectItem>
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
                  onValueChange={(v) => {
                    if (v === "__add__") return addLookup("bet_types", "type de pari", (name) => setValue("bet_type", name));
                    setValue("bet_type", v);
                  }}
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
                    <SelectItem value="__add__">+ Ajouter un type…</SelectItem>
                  </SelectContent>
                </Select>
                {errors.bet_type && (
                  <p className="text-xs text-red-600">
                    {errors.bet_type.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium">Montant (F CFA)</label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  {...register("amount_fcfa", { valueAsNumber: true })}
                />
                {errors.amount_fcfa && (
                  <p className="text-xs text-red-600">
                    {errors.amount_fcfa.message}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Statut</label>
              <Select
                value={watch("status")}
                onValueChange={(v) => setValue("status", v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lookups.statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Référence (unique)</label>
              <Input {...register("reference")} />
              {errors.reference && (
                <p className="text-xs text-red-600">
                  {errors.reference.message}
                </p>
              )}
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
