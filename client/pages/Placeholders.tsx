import AppLayout from "@/components/layout/AppLayout";
import Placeholder from "@/components/common/Placeholder";
import { RequireAuth, RequireRole } from "@/context/AuthContext";

export function BetsPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <Placeholder title="Paris" />
      </AppLayout>
    </RequireAuth>
  );
}
export function VenuesPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <Placeholder title="Salles" />
      </AppLayout>
    </RequireAuth>
  );
}
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LookupDialog from "@/components/common/LookupDialog";
import api, { Lookups, LookupKey } from "@/data/api";
import { Pencil, Trash, Plus } from "lucide-react";

export function LookupsPage() {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [filter, setFilter] = useState("");
  const [dlg, setDlg] = useState<{
    key: LookupKey;
    mode: "add" | "edit";
    initial?: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      setLookups(await api.lookups.all());
    })();
  }, []);

  async function refresh() {
    setLookups(await api.lookups.all());
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
    [],
  );

  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <div className="mb-4 flex items-center gap-2">
            <Input
              placeholder="Rechercher dans les valeurs"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {lookups &&
              keys.map(({ key, title }) => (
                <Card key={key}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base font-semibold">
                      {title}
                    </CardTitle>
                    <Button
                      size="sm"
                      onClick={() => setDlg({ key, mode: "add" })}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Ajouter
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {lookups[key]
                        .filter((v) =>
                          v.toLowerCase().includes(filter.toLowerCase()),
                        )
                        .map((v) => (
                          <li
                            key={v}
                            className="flex items-center justify-between border rounded px-2 py-1"
                          >
                            <span>{v}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setDlg({ key, mode: "edit", initial: v })
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  await api.lookups.remove(key, v);
                                  await refresh();
                                }}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
          </div>

          {dlg && (
            <LookupDialog
              open={!!dlg}
              onOpenChange={(o) => !o && setDlg(null)}
              title={dlg.mode === "add" ? `Ajouter` : `Modifier`}
              initialValue={dlg.initial}
              onConfirm={async (name) => {
                if (
                  dlg.mode === "edit" &&
                  dlg.initial &&
                  dlg.initial !== name
                ) {
                  await api.lookups.remove(dlg.key, dlg.initial);
                }
                await api.lookups.add(dlg.key, name);
                await refresh();
              }}
            />
          )}
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
export function MatchingPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <Placeholder title="Matching" />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
export function ExportsPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <Placeholder title="Exports" />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
export function SettingsPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <Placeholder title="Paramètres" />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
