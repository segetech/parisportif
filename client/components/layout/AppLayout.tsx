import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  CreditCard,
  Trophy,
  Building2,
  Book,
  Link2,
  FileDown,
  Settings,
  LogOut,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { computePeriod, getDefaultPeriod, PeriodState } from "@/lib/period";

function cls(active: boolean) {
  return active
    ? "bg-primary/10 text-primary"
    : "text-foreground/80 hover:text-foreground hover:bg-accent";
}

export default function AppLayout({
  children,
  onNew,
  newButtonLabel,
}: {
  children: React.ReactNode;
  onNew?: () => void;
  newButtonLabel?: string;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodState>(getDefaultPeriod());

  const isAdmin = user?.role === "ADMIN";
  const isController = user?.role === "CONTROLEUR";

  const menu = useMemo(
    () => [
      {
        to: "/",
        label: "Tableau de bord",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      {
        to: "/transactions",
        label: "Transactions",
        icon: <CreditCard className="h-4 w-4" />,
      },
      { to: "/bets", label: "Paris", icon: <Trophy className="h-4 w-4" /> },
      {
        to: "/venues",
        label: "Salles",
        icon: <Building2 className="h-4 w-4" />,
      },
      ...(isAdmin
        ? [
            {
              to: "/lookups",
              label: "Référentiels",
              icon: <Book className="h-4 w-4" />,
            },
          ]
        : []),
      {...(isAdmin
        ? [
            {
              to: "/matching",
              label: "Matching",
              icon: <Link2 className="h-4 w-4" />,
            },
          ]
        : [])},
      {...(isAdmin
        ? [
            {
              to: "/exports",
              label: "Exports",
              icon: <FileDown className="h-4 w-4" />,
            },
          ]
        : [])},
      // Journal d'audit: visible pour ADMIN et CONTROLEUR
      ...((isAdmin || isController)
        ? [
            {
              to: "/journal",
              label: "Journal d’audit",
              icon: <Book className="h-4 w-4" />,
            },
          ]
        : []),
      ...((isAdmin || isController)
        ? [
            {
              to: "/utilisateurs",
              label: "Utilisateurs",
              icon: <Settings className="h-4 w-4" />,
            },
          ]
        : []),
      ...(isAdmin
        ? [
            {
              to: "/parametres",
              label: "Paramètres",
              icon: <Settings className="h-4 w-4" />,
            },
          ]
        : []),
    ],
    [isAdmin],
  );

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ ref: search });
    navigate(`/transactions?${params.toString()}`);
  }

  function handlePeriodChange(v: string) {
    const p = computePeriod(v as any);
    setPeriod(p);
    const params = new URLSearchParams({ start: p.start, end: p.end });
    if (location.pathname === "/")
      navigate({ pathname: "/", search: params.toString() });
  }

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr]">
      <aside className="border-r bg-sidebar p-4 flex flex-col gap-4">
        <Link to="/" className="font-extrabold text-lg tracking-tight">
          Pari Sportif — MVP
        </Link>
        <nav className="flex-1 flex flex-col gap-1">
          {menu.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 ${cls(isActive)}`
              }
            >
              {m.icon}
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="text-xs text-muted-foreground">
          Connecté en tant que{" "}
          <span className="font-medium">
            {user?.role === "ADMIN"
              ? "Admin"
              : user?.role === "CONTROLEUR"
              ? "Contrôleur"
              : "Agent"}
          </span>
        </div>
        <Button variant="outline" onClick={logout} className="gap-2">
          <LogOut className="h-4 w-4" /> Déconnexion
        </Button>
      </aside>
      <main className="p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form
            onSubmit={handleSearch}
            className="flex gap-2 items-center w-full md:max-w-md"
          >
            <Input
              placeholder="Rechercher par référence"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Rechercher
            </Button>
          </form>
          <div className="flex items-center gap-2">
            <Select value={period.kind} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Aujourd’hui</SelectItem>
                <SelectItem value="week">Semaine</SelectItem>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="range">Intervalle</SelectItem>
              </SelectContent>
            </Select>
            {onNew && (
              <Button onClick={onNew} className="gap-1">
                <Plus className="h-4 w-4" /> {newButtonLabel ?? "+ Nouveau"}
              </Button>
            )}
          </div>
        </header>
        <section className="mt-6">{children}</section>
        {onNew && (
          <Button
            onClick={onNew}
            className="md:hidden fixed bottom-4 right-4 rounded-full h-12 w-12 p-0 shadow-lg"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </main>
    </div>
  );
}
