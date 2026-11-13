import { testCatalogLabel, testStatusLabel } from "@/lib/test-vocabulary";
import { RecordForm } from "@/components/common/RecordForm";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RequireAuth, RequireRole } from "@/context/AuthContext";
import { Plus, Eye, Trash, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLookups } from "@/hooks/use-data-queries";
import { invalidateRelatedQueries } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

interface LookupData {
  operators: string[];
  payment_operators: string[];
  platforms: string[];
  supports: string[];
  bet_types: string[];
  statuses: string[];
}

type LookupKey = keyof LookupData;

const TABLE_MAPPING: Record<LookupKey, string> = {
  operators: "operators",
  payment_operators: "payment_operators",
  platforms: "platforms",
  supports: "supports",
  bet_types: "bet_types",
  statuses: "bet_statuses",
};

export default function LookupsPage() {
  // Cache TanStack React Query pour fluidité instantanée
  const { data: lookupsData, isLoading, isFetching, refetch } = useLookups();

  const lookups: LookupData = {
    operators: lookupsData?.operatorNames || [],
    payment_operators: lookupsData?.paymentOperatorNames || [],
    platforms: lookupsData?.platformNames || [],
    supports: lookupsData?.supportNames || [],
    bet_types: lookupsData?.betTypeNames || [],
    statuses: lookupsData?.statusNames || [],
  };

  const [filter, setFilter] = useState("");
  const [dlg, setDlg] = useState<{
    key: LookupKey;
    mode: "add" | "edit";
    initial?: string;
    id?: string;
  } | null>(null);
  const [viewAllDialog, setViewAllDialog] = useState<{
    key: LookupKey;
    title: string;
  } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [operatorIsIllegal, setOperatorIsIllegal] = useState(false);
  const [operatorActive, setOperatorActive] = useState(true);
  const MAX_ITEMS_PREVIEW = 5;

  const operatorMetaMap = useMemo(() => {
    const map = new Map<string, { active: boolean; is_illegal: boolean }>();
    for (const op of lookupsData?.operators || []) {
      map.set(op.name, {
        active: op.active !== false,
        is_illegal: op.is_illegal === true,
      });
    }
    return map;
  }, [lookupsData?.operators]);

  async function handleSave() {
    if (!dlg || !inputValue.trim()) {
      toast.error("Veuillez entrer une valeur");
      return;
    }

    const tableName = TABLE_MAPPING[dlg.key];

    try {
      if (dlg.mode === "add") {
        const payload =
          dlg.key === "operators"
            ? {
                name: inputValue.trim(),
                active: operatorActive,
                is_illegal: operatorIsIllegal,
              }
            : { name: inputValue.trim() };

        const { error } = await supabase.from(tableName).insert([payload]);

        if (error) {
          if (error.code === "23505") {
            toast.error("Cette valeur existe déjà");
          } else {
            throw error;
          }
          return;
        }

        toast.success("Ajouté avec succès");
      } else {
        // Mode edit: trouver l'ID puis mettre à jour
        const { data: existing } = await supabase
          .from(tableName)
          .select("id")
          .eq("name", dlg.initial!)
          .single();

        if (!existing) {
          toast.error("Élément introuvable");
          return;
        }

        const updatePayload =
          dlg.key === "operators"
            ? {
                name: inputValue.trim(),
                active: operatorActive,
                is_illegal: operatorIsIllegal,
              }
            : { name: inputValue.trim() };

        const { error } = await supabase
          .from(tableName)
          .update(updatePayload)
          .eq("id", existing.id);

        if (error) {
          if (error.code === "23505") {
            toast.error("Cette valeur existe déjà");
          } else {
            throw error;
          }
          return;
        }

        toast.success("Modifié avec succès");
      }

      setDlg(null);
      setInputValue("");
      await refetch();
      invalidateRelatedQueries("lookups");
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  }

  async function handleDelete(key: LookupKey, value: string) {
    if (!confirm(`Supprimer "${value}" ?`)) return;

    const tableName = TABLE_MAPPING[key];

    try {
      const { data: existing } = await supabase
        .from(tableName)
        .select("id")
        .eq("name", value)
        .single();

      if (!existing) {
        toast.error("Élément introuvable");
        return;
      }

      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", existing.id);

      if (error) throw error;

      toast.success("Supprimé avec succès");
      await refetch();
      invalidateRelatedQueries("lookups");
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la suppression");
    }
  }

  function openDialog(key: LookupKey, mode: "add" | "edit", initial?: string) {
    setDlg({ key, mode, initial });
    setInputValue(initial || "");
    if (key === "operators") {
      if (mode === "edit" && initial) {
        const meta = operatorMetaMap.get(initial);
        setOperatorActive(meta?.active ?? true);
        setOperatorIsIllegal(meta?.is_illegal ?? false);
      } else {
        setOperatorActive(true);
        setOperatorIsIllegal(false);
      }
    }
  }

  const keys: { key: LookupKey; title: string }[] = useMemo(
    () => [
      { key: "operators", title: "Opérateurs" },
      { key: "payment_operators", title: "Opérateurs de paiement" },
      { key: "platforms", title: "Plateformes" },
      { key: "supports", title: "Supports" },
      { key: "bet_types", title: "Types de test" },
      { key: "statuses", title: "Statuts de test" },
    ],
    [],
  );

  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold">Référentiels</h1>
              <p className="text-sm text-muted-foreground">
                Gérer les listes de valeurs du système
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Rechercher dans les valeurs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {keys.map(({ key, title }) => {
                const filteredItems = lookups[key].filter((v) =>
                  v.toLowerCase().includes(filter.toLowerCase()),
                );
                const displayItems = filteredItems.slice(0, MAX_ITEMS_PREVIEW);
                const hasMore = filteredItems.length > MAX_ITEMS_PREVIEW;

                return (
                  <Card key={key}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <CardTitle className="text-base font-semibold">
                        {title}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({filteredItems.length})
                        </span>
                      </CardTitle>
                      <Button size="sm" onClick={() => openDialog(key, "add")}>
                        <Plus className="h-4 w-4 mr-1" /> Ajouter
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {displayItems.map((v) => (
                          <li
                            key={v}
                            className="flex items-center justify-between border rounded px-3 py-2 hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm truncate">{testStatusLabel(testCatalogLabel(v))}</span>
                              {key === "operators" && (() => {
                                const meta = operatorMetaMap.get(v);
                                if (!meta) return null;
                                return (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        meta.is_illegal
                                          ? "bg-[#FEECEB] text-[#E52329]"
                                          : "bg-[#EBF7EE] text-[#006B2D]"
                                      }`}
                                    >
                                      {meta.is_illegal ? "Illégal" : "Légal"}
                                    </span>
                                    {!meta.active && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                                        Inactif
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Consulter ${v}`}
                                onClick={() => openDialog(key, "edit", v)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(key, v)}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                        {filteredItems.length === 0 && (
                          <li className="text-sm text-muted-foreground text-center py-4">
                            Aucune valeur
                          </li>
                        )}
                      </ul>
                      {hasMore && (
                        <Button
                          variant="outline"
                          className="w-full mt-3"
                          onClick={() => setViewAllDialog({ key, title })}
                        >
                          Voir tout ({filteredItems.length})
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Dialog d'ajout/modification */}
          <Dialog open={!!dlg} onOpenChange={() => setDlg(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {dlg?.mode === "add" ? "Ajouter" : "Consulter"} une valeur
                </DialogTitle>
              </DialogHeader>
              <RecordForm
                key={`${!!dlg}-${dlg?.key}-${dlg?.initial}`}
                existing={dlg?.mode === "edit"}
                onSave={handleSave}
                onClose={() => setDlg(null)}
                onRestore={() => setInputValue(dlg?.initial || "")}
                createLabel="Ajouter"
              >
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Valeur</label>
                    <Input
                      value={testStatusLabel(testCatalogLabel(inputValue))}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Entrez une valeur..."
                    />
                  </div>
                  {dlg?.key === "operators" && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                          Classification
                        </label>
                        <select
                          className="w-full border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C]"
                          value={operatorIsIllegal ? "illegal" : "legal"}
                          onChange={(e) =>
                            setOperatorIsIllegal(e.target.value === "illegal")
                          }
                        >
                          <option value="legal">Légal (Agréé)</option>
                          <option value="illegal">Illégal (Non agréé)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block mb-1">
                          Statut
                        </label>
                        <select
                          className="w-full border border-[#D8E6DB] bg-white rounded-lg px-3 py-2 text-sm text-[#17251C]"
                          value={operatorActive ? "active" : "inactive"}
                          onChange={(e) =>
                            setOperatorActive(e.target.value === "active")
                          }
                        >
                          <option value="active">Actif</option>
                          <option value="inactive">Inactif</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </RecordForm>
            </DialogContent>
          </Dialog>

          {/* Dialog "Voir tout" */}
          <Dialog
            open={!!viewAllDialog}
            onOpenChange={() => setViewAllDialog(null)}
          >
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{viewAllDialog?.title}</span>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (viewAllDialog) {
                        openDialog(viewAllDialog.key, "add");
                        setViewAllDialog(null);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Ajouter
                  </Button>
                </DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto max-h-[60vh]">
                <ul className="space-y-2 pr-2">
                  {viewAllDialog &&
                    lookups[viewAllDialog.key]
                      .filter((v) =>
                        v.toLowerCase().includes(filter.toLowerCase()),
                      )
                      .map((v, index) => (
                        <li
                          key={v}
                          className="flex items-center justify-between border rounded px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground font-mono w-8">
                              #{index + 1}
                            </span>
                            <span className="text-sm font-medium">{v}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                openDialog(viewAllDialog.key, "edit", v);
                                setViewAllDialog(null);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                await handleDelete(viewAllDialog.key, v);
                              }}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                </ul>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Total :{" "}
                  {viewAllDialog &&
                    lookups[viewAllDialog.key].filter((v) =>
                      v.toLowerCase().includes(filter.toLowerCase()),
                    ).length}{" "}
                  élément(s)
                </p>
                <Button
                  variant="outline"
                  onClick={() => setViewAllDialog(null)}
                >
                  Fermer
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
