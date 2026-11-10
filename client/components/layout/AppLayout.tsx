import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import {
  LayoutDashboard,
  CreditCard,
  Trophy,
  Building2,
  Book,
  Link2,
  FileDown,
  Settings,
  Plus,
  AlertTriangle,
  Users,
  CheckSquare,
  ShieldCheck,
  HardDrive,
  Menu,
  ChevronLeft,
  ChevronRight,
  Search,
  FileSpreadsheet,
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
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { computePeriod, getDefaultPeriod, PeriodState } from "@/lib/period";
import { UserAvatarMenu } from "./UserAvatarMenu";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  adminOnly?: boolean;
  controllerOrAdmin?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodState>(getDefaultPeriod());
  
  // État du sidebar rétractable
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ps.sidebar.collapsed") === "true";
    }
    return false;
  });

  // État du sidebar sur mobile (tiroir)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("ps.sidebar.collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Fermer le tiroir mobile lors d'un changement de route
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  const isAdmin = user?.role === "ADMIN";
  const isController = user?.role === "CONTROLEUR";

  const navigationSections: NavSection[] = useMemo(() => {
    const rawSections: NavSection[] = [
      {
        title: "Opérations",
        items: [
          {
            to: "/",
            label: "Tableau de bord",
            icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
          },
          {
            to: "/transactions",
            label: "Transactions",
            icon: <CreditCard className="h-4 w-4 shrink-0" />,
          },
          {
            to: "/bets",
            label: "Paris",
            icon: <Trophy className="h-4 w-4 shrink-0" />,
          },
          {
            to: "/venues",
            label: "Salles de jeux",
            icon: <Building2 className="h-4 w-4 shrink-0" />,
          },
          {
            to: "/import-excel",
            label: "Import Excel",
            icon: <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-300" />,
          },
        ],
      },
      {
        title: "Contrôle & Risques",
        items: [
          {
            to: "/illegal",
            label: "Activités Illégales",
            icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
            controllerOrAdmin: true,
          },
          {
            to: "/validation",
            label: "Validation",
            icon: <CheckSquare className="h-4 w-4 shrink-0 text-emerald-400" />,
            controllerOrAdmin: true,
          },
          {
            to: "/journal",
            label: "Journal d'audit",
            icon: <ShieldCheck className="h-4 w-4 shrink-0 text-blue-400" />,
            controllerOrAdmin: true,
          },
        ],
      },
      {
        title: "Administration",
        items: [
          {
            to: "/users-management",
            label: "Utilisateurs",
            icon: <Users className="h-4 w-4 shrink-0" />,
            adminOnly: true,
          },
          {
            to: "/lookups",
            label: "Référentiels",
            icon: <Book className="h-4 w-4 shrink-0" />,
            adminOnly: true,
          },
          {
            to: "/matching",
            label: "Rapprochement",
            icon: <Link2 className="h-4 w-4 shrink-0" />,
            adminOnly: true,
          },
          {
            to: "/exports",
            label: "Exports de données",
            icon: <FileDown className="h-4 w-4 shrink-0" />,
            adminOnly: true,
          },
          {
            to: "/cache",
            label: "Gestion du Cache",
            icon: <HardDrive className="h-4 w-4 shrink-0" />,
          },
          {
            to: "/parametres",
            label: "Paramètres",
            icon: <Settings className="h-4 w-4 shrink-0" />,
            adminOnly: true,
          },
        ],
      },
    ];

    return rawSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.adminOnly && !isAdmin) return false;
          if (item.controllerOrAdmin && !isAdmin && !isController) return false;
          return true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [isAdmin, isController]);

  // Titre dynamique de la page courante
  const currentPageTitle = useMemo(() => {
    for (const section of navigationSections) {
      for (const item of section.items) {
        if (location.pathname === item.to) return item.label;
      }
    }
    if (location.pathname === "/profil") return "Mon Profil";
    return "Test";
  }, [location.pathname, navigationSections]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    const params = new URLSearchParams({ ref: search.trim() });
    navigate(`/transactions?${params.toString()}`);
  }

  function handlePeriodChange(v: string) {
    const p = computePeriod(v as any);
    setPeriod(p);
    const params = new URLSearchParams({ start: p.start, end: p.end });
    if (location.pathname === "/") {
      navigate({ pathname: "/", search: params.toString() });
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F5F8F5] text-[#17251C] antialiased">
      {/* Overlay mobile quand le tiroir est ouvert */}
      {mobileDrawerOpen && (
        <div
          onClick={() => setMobileDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs md:hidden"
          aria-hidden="true"
        />
      )}

      {/* ========================================================================= */}
      {/* SIDEBAR NAVIGATION (Fixe et indépendante du défilement de la page)        */}
      {/* ========================================================================= */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#003816] bg-[#004D20] text-white transition-all duration-300 md:sticky md:top-0 md:h-screen shrink-0 overflow-hidden no-scrollbar",
          // Mobile responsive: slide in/out
          mobileDrawerOpen
            ? "translate-x-0 w-64 shadow-2xl"
            : "-translate-x-full md:translate-x-0",
          // Desktop responsive: expanded vs collapsed
          sidebarCollapsed ? "md:w-20" : "md:w-64"
        )}
      >
        {/* En-tête Sidebar : Logo officiel & Titre de l'application */}
        <div className="h-16 flex items-center justify-between px-3.5 border-b border-[#003816] shrink-0 bg-[#003816]/50">
          <Link
            to="/"
            className="flex items-center gap-3 min-w-0 group outline-none"
            title="Test - Accueil"
          >
            {/* Boîte Logo officiel */}
            <div className="h-10 w-10 rounded-xl bg-white border border-white/20 p-1 flex items-center justify-center shrink-0 shadow-xs">
              <img
                src="/logo.png"
                alt="Logo officiel Test"
                className="h-full w-full object-contain"
              />
            </div>
            {(!sidebarCollapsed || mobileDrawerOpen) && (
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-sm tracking-tight text-white leading-tight truncate">
                  Test
                </span>
                <span className="text-[10px] font-bold text-[#FFD000] tracking-wider uppercase truncate">
                  Supervision & Contrôle
                </span>
              </div>
            )}
          </Link>

          {/* Bouton pour plier / déplier la barre latérale sur grand écran */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg text-emerald-100/70 hover:text-white hover:bg-white/10 transition-colors"
            title={sidebarCollapsed ? "Agrandir le menu" : "Réduire le menu"}
            aria-label={sidebarCollapsed ? "Agrandir le menu" : "Réduire le menu"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Liens de navigation groupés - aucun affichage de scrollbar natif */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-2.5 py-3 space-y-4">
          {navigationSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {(!sidebarCollapsed || mobileDrawerOpen) && (
                <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#A3D9B5]">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={sidebarCollapsed && !mobileDrawerOpen ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all group",
                      isActive
                        ? "bg-[#006B2D] text-white shadow-xs font-bold"
                        : "text-emerald-100/85 hover:text-white hover:bg-white/10",
                      sidebarCollapsed && !mobileDrawerOpen && "justify-center px-2"
                    )
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  {(!sidebarCollapsed || mobileDrawerOpen) && (
                    <span className="truncate">{item.label}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Pied du Sidebar : Profil Utilisateur & Avatar Menu */}
        <div className="p-2.5 border-t border-[#003816] bg-[#003816]/60 shrink-0">
          <UserAvatarMenu
            collapsed={sidebarCollapsed && !mobileDrawerOpen}
            side="top"
            align="start"
          />
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA                                                         */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-[#F5F8F5]">
        {/* Top Header */}
        <header className="h-16 border-b border-[#D8E6DB] bg-white sticky top-0 z-30 shrink-0 px-4 md:px-6 flex items-center justify-between gap-4">
          {/* Côté gauche : Bouton menu mobile & Fil d'Ariane / Titre */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="p-2 rounded-lg text-[#556B5C] hover:text-[#17251C] hover:bg-[#F5F8F5] md:hidden"
              aria-label="Ouvrir le menu de navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-[#556B5C] uppercase tracking-wider hidden sm:block">
                Espace de gestion
              </span>
              <h1 className="text-sm md:text-base font-extrabold text-[#17251C] truncate leading-tight">
                {currentPageTitle}
              </h1>
            </div>
          </div>

          {/* Centre / Recherche rapide par référence */}
          <form
            onSubmit={handleSearch}
            className="hidden md:flex items-center relative w-64 lg:w-80"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#556B5C]" />
            <Input
              type="search"
              placeholder="Rechercher une référence..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 pr-3 text-xs bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] placeholder:text-[#556B5C] rounded-xl focus:border-[#006B2D]"
            />
          </form>

          {/* Côté droit : Sélecteur de période, Notifications, Bouton Action, AVATAR MENU PROFIL */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Notifications avec badge */}
            <NotificationBell />

            {/* Sélecteur temporel */}
            <Select value={period.kind} onValueChange={handlePeriodChange}>
              <SelectTrigger className="h-9 w-[120px] sm:w-[140px] text-xs bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] rounded-xl font-medium">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#D8E6DB] text-[#17251C]">
                <SelectItem value="today">Aujourd’hui</SelectItem>
                <SelectItem value="week">Semaine</SelectItem>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="range">Intervalle</SelectItem>
              </SelectContent>
            </Select>

            {/* Action principale CTA si fournie par la page */}
            {onNew && (
              <Button
                onClick={onNew}
                className="h-9 gap-1.5 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold text-xs px-3 rounded-xl shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{newButtonLabel ?? "Nouveau"}</span>
              </Button>
            )}

            {/* AVATAR DU MENU PROFIL : En haut à droite, visible sur TOUS les écrans */}
            <div className="flex items-center pl-1 sm:pl-2.5 border-l border-[#D8E6DB]">
              <UserAvatarMenu collapsed side="bottom" align="end" />
            </div>
          </div>
        </header>

        {/* Contenu principal de la page */}
        <main className="flex-1 w-full min-w-0 p-4 md:p-6 lg:p-8 pb-24 md:pb-8 bg-[#F5F8F5] text-[#17251C] overflow-y-auto">
          <div className="w-full min-w-0">
            {children}
          </div>
        </main>

        {/* ========================================================================= */}
        {/* BARRE DE NAVIGATION INFÉRIEURE MOBILE (Thumb Zone, cibles tactiles >= 44px)*/}
        {/* ========================================================================= */}
        <nav
          aria-label="Navigation mobile principale"
          className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#D8E6DB] md:hidden px-2 py-1.5 flex items-center justify-around safe-area-pb"
        >
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center min-w-[56px] min-h-[44px] rounded-xl text-[10px] font-bold transition-all",
                isActive
                  ? "text-[#006B2D] scale-105"
                  : "text-[#556B5C] hover:text-[#17251C]"
              )
            }
          >
            <LayoutDashboard className="h-5 w-5 mb-0.5" />
            <span>Accueil</span>
          </NavLink>

          <NavLink
            to="/transactions"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center min-w-[56px] min-h-[44px] rounded-xl text-[10px] font-bold transition-all",
                isActive
                  ? "text-[#006B2D] scale-105"
                  : "text-[#556B5C] hover:text-[#17251C]"
              )
            }
          >
            <CreditCard className="h-5 w-5 mb-0.5" />
            <span>Flux</span>
          </NavLink>

          <NavLink
            to="/bets"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center min-w-[56px] min-h-[44px] rounded-xl text-[10px] font-bold transition-all",
                isActive
                  ? "text-[#006B2D] scale-105"
                  : "text-[#556B5C] hover:text-[#17251C]"
              )
            }
          >
            <Trophy className="h-5 w-5 mb-0.5" />
            <span>Paris</span>
          </NavLink>

          <NavLink
            to="/venues"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center min-w-[56px] min-h-[44px] rounded-xl text-[10px] font-bold transition-all",
                isActive
                  ? "text-[#006B2D] scale-105"
                  : "text-[#556B5C] hover:text-[#17251C]"
              )
            }
          >
            <Building2 className="h-5 w-5 mb-0.5" />
            <span>Salles</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="flex flex-col items-center justify-center min-w-[56px] min-h-[44px] rounded-xl text-[10px] font-bold text-[#556B5C] hover:text-[#17251C] transition-all"
            aria-label="Ouvrir le menu complet"
          >
            <Menu className="h-5 w-5 mb-0.5" />
            <span>Menu</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
