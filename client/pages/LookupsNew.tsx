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
import { Plus, Pencil, Trash } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  const [lookups, setLookups] = useState<LookupData>({
    operators: [],
    payment_operators: [],
    platforms: [],
    supports: [],
    bet_types: [],
    statuses: [],
  });
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
  
  const MAX_ITEMS_PREVIEW = 5;

  useEffect(() => {
    loadAllLookups();
  }, []);

  async function loadAllLookups() {
    try {
      const [operators, paymentOps, platforms, supports, betTypes, statuses] =
        await Promise.all([
          supabase.from("operators").select("id, name").order("name"),
          supabase.from("payment_operators").select("id, name").order("name"),
          supabase.from("platforms").select("id, name").order("name"),
          supabase.from("supports").select("id, name").order("name"),
          supabase.from("bet_types").select("id, name").order("name"),
          supabase.from("bet_statuses").select("id, name").order("name"),
        ]);

      setLookups({
        operators: operators.data?.map((o) => o.name) || [],
        payment_operators: paymentOps.data?.map((o) => o.name) || [],
        platforms: platforms.data?.map((p) => p.name) || [],
        supports: supports.data?.map((s) => s.name) || [],
        bet_types: betTypes.data?.map((b) => b.name) || [],
        statuses: statuses.data?.map((s) => s.name) || [],
      });
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement");
    }
  }

  async function handleSave() {
    if (!dlg || !inputValue.trim()) {
      toast.error("Veuillez entrer une valeur");
      return;
    }

    const tableName = TABLE_MAPPING[dlg.key];

    try {
      if (dlg.mode === "add") {
        const { error } = await supabase
          .from(tableName)
          .insert([{ name: inputValue.trim() }]);

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

        const { error } = await supabase
          .from(tableName)
          .update({ name: inputValue.trim() })
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
      await loadAllLookups();
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
      await loadAllLookups();
    } catch (error: any) {
      console.error("Erreur:", error);
      toast.error("Erreur lors de la suppression");
    }
  }

  function openDialog(
    key: LookupKey,
    mode: "add" | "edit",
    initial?: string
  ) {
    setDlg({ key, mode, initial });
    setInputValue(initial || "");
  }

  const keys: { key: LookupKey; title: string }[] = useMemo(
    () => [
      { key: "operators", title: "Opérateurs de jeux" },
      { key: "payment_operators", title: "Opérateurs de paiement" },
      { key: "platforms", title: "Plateformes" },
      { key: "supports", title: "Supports" },
      { key: "bet_types", title: "Types de pari" },
      { key: "statuses", title: "Statuts de pari" },
    ],
    []
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
                  v.toLowerCase().includes(filter.toLowerCase())
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
                            <span className="text-sm">{v}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDialog(key, "edit", v)}
                              >
                                <Pencil className="h-4 w-4" />
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
                  {dlg?.mode === "add" ? "Ajouter" : "Modifier"} une valeur
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Valeur</label>
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Entrez une valeur..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDlg(null)}>
                    Annuler
                  </Button>
                  <Button onClick={handleSave}>
                    {dlg?.mode === "add" ? "Ajouter" : "Modifier"}
                  </Button>
                </div>
              </div>
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
                        v.toLowerCase().includes(filter.toLowerCase())
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
                              <Pencil className="h-4 w-4" />
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
                      v.toLowerCase().includes(filter.toLowerCase())
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
