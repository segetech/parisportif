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
import LookupDialog from "@/components/common/LookupDialog";

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/g, { message: "Date au format AAAA-MM-JJ" }),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
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
  const isController = user?.role === "CONTROLEUR";
  const [rows, setRows] = useState<Bet[]>([]);
  const [filters, setFilters] = useState<{ operator: string }>({ operator: "" });
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
    if (!(isAdmin || isController)) return;
    if (!confirm("Supprimer ce pari ?")) return;
    await api.bets.delete(id);
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
        const updated = await api.bets.update(editing.id, values as any);
        setRows((prev) => prev.map((b) => (b.id === editing.id ? updated : b)));
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
  // Compte global par opérateur
  const operatorCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.operator] = (m[r.operator] ?? 0) + 1;
    return m;
  }, [rows]);
  // Rows filtrées par opérateur
  const filteredRows = useMemo(
    () => rows.filter((r) => !filters.operator || r.operator === filters.operator),
    [rows, filters.operator],
  );
  // Tri Date+Heure
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const ca = (a.date + a.time);
      const cb = (b.date + b.time);
      const cmp = ca.localeCompare(cb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredRows, sortDir]);
  // Numérotation par opérateur dans l'ordre d'affichage
  const numberedRows = useMemo(() => {
    const counts: Record<string, number> = {};
    return sortedRows.map((r) => ({
      ...r,
      _no: (counts[r.operator] = (counts[r.operator] ?? 0) + 1),
    } as any));
  }, [sortedRows]);
  const [lkOpen, setLkOpen] = useState(false);
  const [lkSpec, setLkSpec] = useState<{
    key: keyof typeof api.store.lookups;
    label: string;
    onAdded?: (value: string) => void;
  } | null>(null);

  function addLookup(
    key: keyof typeof api.store.lookups,
    label: string,
    onAdded?: (value: string) => void,
  ) {
    if (!canManageLookups) {
      toast.error("Accès refusé : création réservée à l’admin.");
      return;
    }
    setLkSpec({ key, label, onAdded });
    setLkOpen(true);
  }

  return (
    <AppLayout onNew={onNew} newButtonLabel="+ Nouveau pari">
      {lkSpec && (
        <LookupDialog
          open={lkOpen}
          onOpenChange={setLkOpen}
          title={`Ajouter ${lkSpec.label}`}
          placeholder={`Nom ${lkSpec.label}`}
          onConfirm={async (name) => {
            await api.lookups.add(lkSpec.key as any, name);
            const l = await api.lookups.all();
            setLookups({
              operators: l.operators,
              supports: l.supports,
              bet_types: l.bet_types,
              statuses: l.statuses,
            });
            lkSpec.onAdded?.(name);
            toast.success(`${lkSpec.label} ajouté(e).`);
          }}
        />
      )}
      {/* Menu d'opérateurs */}
      <div className="flex flex-wrap gap-2 mb-3 items-end">
        <div className="flex gap-2 overflow-x-auto pb-1 pr-2">
          <Button
            variant={(!filters.operator || filters.operator === "") ? "default" : "outline"}
            size="sm"
            type="button"
            onClick={() => setFilters({ operator: "" })}
          >
            Tous
          </Button>
          {lookups.operators.map((op) => (
            <Button
              key={op}
              variant={filters.operator === op ? "default" : "outline"}
              size="sm"
              type="button"
              onClick={() => setFilters({ operator: op })}
            >
              {op} ({operatorCounts[op] ?? 0})
            </Button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setSortDir("asc")}
          >
            Tri: Asc
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setSortDir("desc")}
          >
            Tri: Desc
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Heure</TableHead>
              <TableHead>Opérateur</TableHead>
              <TableHead>Support</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Référence</TableHead>
              <TableHead>Contrôle</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {numberedRows.length ? (
              numberedRows.map((r) => (
                <TableRow key={r.id} className={
                  r.review_status === 'valide' ? 'border-l-4 border-l-emerald-500' :
                  r.review_status === 'rejete' ? 'border-l-4 border-l-red-500' : ''
                }>
                  <TableCell>{(r as any)._no}</TableCell>
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
                    {r.review_status === 'valide' && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700">Validé</span>
                    )}
                    {r.review_status === 'rejete' && (
                      <span title={r.reject_reason} className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">Rejeté</span>
                    )}
                    {r.review_status === 'en_cours' && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700">En cours</span>
                    )}
                  </TableCell>
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
                          {(() => {
                            const canEdit = isAdmin || isController || (user!.id === r.created_by && r.review_status !== 'valide');
                            return canEdit ? (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(r);
                                  setOpen(true);
                                }}
                              >
                                Éditer
                              </DropdownMenuItem>
                            ) : null;
                          })()}
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
                          {(isAdmin || isController) && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => removeRow(r.id)}
                            >
                              Supprimer
                            </DropdownMenuItem>
                          )}
                          {(isAdmin || isController) && r.review_status !== 'valide' && (
                            <DropdownMenuItem
                              onClick={async () => {
                                const updated = await api.bets.validate(r.id, user!);
                                setRows((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
                                toast.success("Enregistrement validé.");
                              }}
                            >
                              Valider
                            </DropdownMenuItem>
                          )}
                          {(isAdmin || isController) && r.review_status !== 'rejete' && (
                            <DropdownMenuItem
                              onClick={async () => {
                                const reason = prompt("Motif du rejet ?");
                                if (!reason) return;
                                const updated = await api.bets.reject(r.id, user!, reason);
                                setRows((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
                                toast.success("Enregistrement rejeté.");
                              }}
                            >
                              Rejeter…
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
                    if (v === "__add__")
                      return addLookup("operators", "opérateur", (name) =>
                        setValue("operator", name),
                      );
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
                    <SelectItem value="__add__">
                      + Ajouter un opérateur…
                    </SelectItem>
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
                    if (v === "__add__")
                      return addLookup("supports", "support", (name) =>
                        setValue("support", name),
                      );
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
                    <SelectItem value="__add__">
                      + Ajouter un support…
                    </SelectItem>
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
                    if (v === "__add__")
                      return addLookup("bet_types", "type de pari", (name) =>
                        setValue("bet_type", name),
                      );
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
