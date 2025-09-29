import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import api, { Transaction } from "@/data/api";
import { useAuth, RequireAuth } from "@/context/AuthContext";
import { DATE_FORMAT, TIME_FORMAT } from "@/lib/dayjs";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import dayjs from "dayjs";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

function formatFcfa(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " F CFA";
}

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/g, { message: "Date au format AAAA-MM-JJ" }),
  time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
      message: "L’heure doit être au format HH:MM (24h).",
    }),
  operator: z.string().min(1, { message: "Opérateur requis" }),
  platform: z.string().min(1, { message: "Plateforme requise" }),
  payment_operator: z
    .string()
    .min(1, { message: "Opérateur de paiement requis" }),
  type: z.enum(["Dépôt", "Retrait"], {
    errorMap: () => ({ message: "Type invalide" }),
  }),
  amount_fcfa: z.coerce
    .number()
    .int()
    .positive({ message: "Le montant doit être un entier positif." }),
  phone: z.string().optional(),
  reference: z.string().min(1, { message: "Référence requise" }),
  proof: z.boolean(),
  notes: z.string().optional(),
  proof_file: z.any().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function Page() {
  return (
    <RequireAuth>
      <Transactions />
    </RequireAuth>
  );
}

function Transactions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [rows, setRows] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState({ operator: "", reference: "" });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [lookups, setLookups] = useState<{
    operators: string[];
    payment_operators: string[];
    platforms: string[];
  }>({ operators: [], payment_operators: [], platforms: [] });

  useEffect(() => {
    (async () => {
      const l = await api.lookups.all();
      setLookups({
        operators: l.operators,
        payment_operators: l.payment_operators,
        platforms: l.platforms,
      });
    })();
  }, []);

  useEffect(() => {
    load();
  }, [user?.id]);
  async function load() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") ?? undefined;
    const data = await api.transactions.list({
      reference: ref,
      createdByOnly: user?.role === "AGENT" ? user.id : undefined,
    });
    setRows(data);
    if (ref) setFilters((f) => ({ ...f, reference: ref }));
  }

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      { accessorKey: "date", header: "Date" },
      { accessorKey: "time", header: "Heure" },
      { accessorKey: "operator", header: "Opérateur" },
      { accessorKey: "platform", header: "Plateforme" },
      { accessorKey: "payment_operator", header: "Op. paiement" },
      { accessorKey: "type", header: "Type" },
      {
        accessorKey: "amount_fcfa",
        header: "Montant",
        cell: ({ getValue }) => formatFcfa(getValue<number>()),
      },
      { accessorKey: "phone", header: "Téléphone" },
      { accessorKey: "reference", header: "Référence" },
      {
        accessorKey: "proof",
        header: "Preuve",
        cell: ({ getValue }) => (getValue<boolean>() ? "Oui" : "Non"),
      },
      { accessorKey: "notes", header: "Notes" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const canEdit = isAdmin || row.original.created_by === user!.id;
          const canDelete =
            isAdmin ||
            (row.original.created_by === user!.id &&
              dayjs().diff(dayjs(row.original.created_at), "minute") <=
                api.store.settings.agentEditWindowMinutes);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => alert(JSON.stringify(row.original, null, 2))}
                >
                  Voir
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(row.original);
                      setOpen(true);
                    }}
                  >
                    Éditer
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => duplicateRow(row.original)}>
                  Dupliquer
                </DropdownMenuItem>
                {canDelete && (
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => removeRow(row.original.id)}
                  >
                    Supprimer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [isAdmin],
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  function onNew() {
    setEditing(null);
    setOpen(true);
  }

  async function duplicateRow(r: Transaction) {
    const copy: FormValues = { ...r, reference: r.reference + "-copy" };
    setEditing(null);
    setOpen(true);
    setTimeout(() => form.reset(copy), 0);
  }

  async function removeRow(id: string) {
    if (!confirm("Supprimer cette ligne ?")) return;
    await api.transactions.delete(id);
    await load();
  }

  function exportCsv() {
    const csv = buildCsv(
      rows.map((r) => ({
        date: r.date,
        heure: r.time,
        operateur: r.operator,
        plateforme: r.platform,
        op_paiement: r.payment_operator,
        type: r.type,
        montant_fcfa: r.amount_fcfa,
        telephone: r.phone ?? "",
        reference: r.reference,
        preuve: r.proof ? "Oui" : "Non",
        notes: r.notes ?? "",
      })),
    );
    downloadCsv(`transactions-${dayjs().format("YYYYMMDD-HHmm")}.csv`, csv);
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset: resetForm,
    setValue,
    watch,
    control,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: dayjs().format(DATE_FORMAT),
      time: dayjs().format(TIME_FORMAT),
      type: "Dépôt",
      proof: false,
      platform: "Web",
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        await api.transactions.update(editing.id, values);
      } else {
        await api.transactions.create({ ...values, created_by: user!.id });
      }
      setOpen(false);
      toast.success("Transaction enregistrée.");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inconnue");
    }
  }

  useEffect(() => {
    if (!open) resetForm();
    else if (editing) resetForm(editing);
  }, [open]);

  return (
    <RequireAuth>
      <AppLayout onNew={onNew} newButtonLabel="+ Nouveau dépôt / retrait">
        <div className="flex flex-wrap gap-2 mb-3 items-end">
          <div>
            <label className="text-xs font-medium">Opérateur</label>
            <Select
              value={filters.operator || "all"}
              onValueChange={(v) => {
                const val = v === "all" ? "" : v;
                setFilters((f) => ({ ...f, operator: val }));
                table.getColumn("operator")?.setFilterValue(val || undefined);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {lookups.operators.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Référence</label>
            <Input
              placeholder="Rechercher…"
              value={filters.reference}
              onChange={(e) => {
                setFilters((f) => ({ ...f, reference: e.target.value }));
                table
                  .getColumn("reference")
                  ?.setFilterValue(e.target.value || undefined);
              }}
              className="w-56"
            />
          </div>
          {isAdmin && (
            <Button onClick={exportCsv} className="ml-auto">
              Exporter CSV
            </Button>
          )}
        </div>

        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className={
                        h.column.getCanSort()
                          ? "cursor-pointer select-none"
                          : ""
                      }
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((r) => (
                  <TableRow key={r.id}>
                    {r.getVisibleCells().map((c) => (
                      <TableCell key={c.id}>
                        {flexRender(
                          c.column.columnDef.cell ?? c.column.columnDef.header,
                          c.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Aucune donnée pour cette période.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between p-2 text-sm">
            <div>Rows: {table.getRowModel().rows.length}</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Suivant
              </Button>
            </div>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Éditer" : "Nouvelle"} transaction
              </DialogTitle>
            </DialogHeader>
            <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Date</label>
                  <Input type="date" {...register("date")} />
                  {errors.date && (
                    <p className="text-xs text-red-600">
                      {errors.date.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium">Heure</label>
                  <Input type="time" {...register("time")} />
                  {errors.time && (
                    <p className="text-xs text-red-600">
                      {errors.time.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">
                    Opérateur de jeux
                  </label>
                  <Select
                    onValueChange={(v) => {
                      if (v === "__add__") return addLookup("operators", "opérateur", (name) => setValue("operator", name));
                      setValue("operator", v);
                    }}
                    value={watch("operator")}
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
                  <label className="text-xs font-medium">Plateforme</label>
                  <Input {...register("platform")} />
                  {errors.platform && (
                    <p className="text-xs text-red-600">
                      {errors.platform.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">
                    Opérateur de paiement
                  </label>
                  <Select
                    onValueChange={(v) => setValue("payment_operator", v)}
                    value={watch("payment_operator")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.payment_operators.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.payment_operator && (
                    <p className="text-xs text-red-600">
                      {errors.payment_operator.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium">Type</label>
                  <Select
                    onValueChange={(v) => setValue("type", v as any)}
                    value={watch("type")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dépôt">Dépôt</SelectItem>
                      <SelectItem value="Retrait">Retrait</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="text-xs font-medium">
                    Téléphone (optionnel)
                  </label>
                  <Input {...register("phone")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">
                    Référence (unique)
                  </label>
                  <Input {...register("reference")} />
                  {errors.reference && (
                    <p className="text-xs text-red-600">
                      {errors.reference.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium">Preuve</label>
                  <Select
                    onValueChange={(v) => setValue("proof", v === "Oui")}
                    value={watch("proof") ? "Oui" : "Non"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Oui">Oui</SelectItem>
                      <SelectItem value="Non">Non</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Preuve (upload)</label>
                  <Input type="file" {...register("proof_file")} />
                </div>
                <div>
                  <label className="text-xs font-medium">Notes</label>
                  <Input {...register("notes")} />
                </div>
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
    </RequireAuth>
  );
}
