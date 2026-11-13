import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import {
  LayoutDashboard,
  CreditCard,
  ClipboardCheck,
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
  Trash2,
} from "lucide-react";
import { useTrashCount } from "@/hooks/use-data-queries";
import { Button } from "@/components/ui/button";
import { DatePickerCustom } from "@/components/ui/date-picker-custom";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/lib/settings";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { computePeriod, getDefaultPeriod, PeriodState } from "@/lib/period";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatarMenu } from "./UserAvatarMenu";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  adminOnly?: boolean;
  controllerOrAdmin?: boolean;
  requiresExportPermission?: boolean;
  requiresVenuePermission?: boolean;
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
  const { data: trashCount } = useTrashCount(!!user);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodState>(() => {
    const s = searchParams.get("start") || "";
    const e = searchParams.get("end") || "";
    if (!s && !e) return getDefaultPeriod();
    for (const k of ["today", "week", "month"] as const) {
      const candidate = computePeriod(k);
      if (candidate.start === s && candidate.end === e) return candidate;
    }
    return { kind: "range", start: s, end: e };
  });

  useEffect(() => {
    const s = searchParams.get("start") || "";
    const e = searchParams.get("end") || "";
    if (!s && !e) {
      setPeriod(getDefaultPeriod());
      return;
    }
    for (const k of ["today", "week", "month"] as const) {
      const candidate = computePeriod(k);
      if (candidate.start === s && candidate.end === e) {
        setPeriod(candidate);
        return;
      }
    }
    setPeriod({ kind: "range", start: s, end: e });
  }, [searchParams]);

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
  const { settings } = useSettings();
  const canExport = isAdmin || isController || settings.agentCanExport;
  const canManageVenues = isAdmin || isController || settings.agentCanManageVenues;

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
            label: "Dépôts & Retraits",
            icon: <CreditCard className="h-4 w-4 shrink-0" />,
          },
          {
            to: "/tests",
            label: "Tests",
            icon: <ClipboardCheck className="h-4 w-4 shrink-0" />,
          },
          {
            to: "/venues",
            label: "Sites de test",
            icon: <Building2 className="h-4 w-4 shrink-0" />,
            requiresVenuePermission: true,
          },
          {
            to: "/import-excel",
            label: "Import Excel",
            icon: <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-300" />,
          },
          {
            to: "/rapport",
            label: "Rapport",
            icon: <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-300" />,
            requiresExportPermission: true,
          },
          {
            to: "/corbeille",
            label: "Corbeille",
            icon: <Trash2 className="h-4 w-4 shrink-0 text-rose-400" />,
            badge:
              trashCount && trashCount.total > 0
                ? String(trashCount.total)
                : undefined,
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
            controllerOrAdmin: true,
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
            adminOnly: true,
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
          if (item.requiresExportPermission && !canExport) return false;
          if (item.requiresVenuePermission && !canManageVenues) return false;
          return true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [isAdmin, isController, canExport, canManageVenues]);

  // Titre dynamique de la page courante
  const currentPageTitle = useMemo(() => {
    for (const section of navigationSections) {
      for (const item of section.items) {
        if (location.pathname === item.to) return item.label;
      }
    }
    if (location.pathname === "/profil") return "Mon Profil";
    return "OPEN";
  }, [location.pathname, navigationSections]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    const params = new URLSearchParams({ ref: search.trim() });
    navigate(`/transactions?${params.toString()}`);
  }

  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(() => period.start || computePeriod("month").start);
  const [rangeEnd, setRangeEnd] = useState(() => period.end || computePeriod("today").end);

  const supportsHeaderPeriod = [
    "/",
    "/tests",
    "/transactions",
    "/depot-retrait",
    "/audit",
    "/journal",
  ].includes(location.pathname);

  function applyPeriodToRoute(p: PeriodState) {
    setPeriod(p);
    if (!supportsHeaderPeriod) return;
    const params = new URLSearchParams(searchParams);
    if (p.start) params.set("start", p.start);
    else params.delete("start");
    if (p.end) params.set("end", p.end);
    else params.delete("end");
    setSearchParams(params, { replace: true });
  }

  function handlePeriodChange(v: string) {
    if (v === "range") {
      setRangeStart(period.start || computePeriod("month").start);
      setRangeEnd(period.end || computePeriod("today").end);
      setRangePopoverOpen(true);
      return;
    }
    setRangePopoverOpen(false);
    const p = computePeriod(v as any);
    applyPeriodToRoute(p);
  }

  function handleApplyCustomRange() {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return;
    const p = computePeriod("range", rangeStart, rangeEnd);
    setRangePopoverOpen(false);
    applyPeriodToRoute(p);
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
            title="OPEN - Accueil"
          >
            {/* Boîte Logo officiel */}
            <div className="h-10 w-10 rounded-xl bg-white border border-white/20 p-1 flex items-center justify-center shrink-0 shadow-xs">
              <img
                src="/logo.png"
                alt="Logo OPEN"
                className="h-full w-full object-contain"
              />
            </div>
            {(!sidebarCollapsed || mobileDrawerOpen) && (
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-sm tracking-tight text-white leading-tight truncate">
                  OPEN
                </span>
                <span className="text-[10px] font-bold text-[#FFD000] tracking-wider uppercase truncate">
                  Application de test
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
            {supportsHeaderPeriod && (
              <div className="flex items-center gap-1.5">
                <Select value={period.kind} onValueChange={handlePeriodChange}>
                  <SelectTrigger className="h-9 w-[135px] sm:w-[155px] text-xs bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C] rounded-xl font-medium">
                    <SelectValue placeholder="Période" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#D8E6DB] text-[#17251C]">
                    <SelectItem value="all">Toutes périodes</SelectItem>
                    <SelectItem value="today">Aujourd’hui</SelectItem>
                    <SelectItem value="week">Semaine</SelectItem>
                    <SelectItem value="month">Mois</SelectItem>
                    <SelectItem value="range">Intervalle…</SelectItem>
                  </SelectContent>
                </Select>
                {period.kind === "range" && period.start && period.end && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRangeStart(period.start);
                      setRangeEnd(period.end);
                      setRangePopoverOpen(true);
                    }}
                    className="hidden lg:inline-flex h-9 px-2.5 text-[11px] font-semibold border-[#D8E6DB] bg-[#F5F8F5] text-[#006B2D] rounded-xl"
                  >
                    {period.start} → {period.end}
                  </Button>
                )}

                <Dialog open={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
                  <DialogContent className="sm:max-w-sm bg-white border-[#D8E6DB]">
                    <DialogHeader>
                      <DialogTitle className="text-base font-bold text-[#17251C]">
                        Intervalle personnalisé
                      </DialogTitle>
                      <DialogDescription className="text-xs text-[#556B5C]">
                        Choisissez la date de début et la date de fin pour filtrer la page.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 py-2">
                      <DatePickerCustom
                        label="Du"
                        value={rangeStart}
                        onChange={(val) => setRangeStart(val)}
                        showPresets={false}
                      />
                      <DatePickerCustom
                        label="Au"
                        value={rangeEnd}
                        onChange={(val) => setRangeEnd(val)}
                        showPresets={false}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setRangePopoverOpen(false)}
                        className="h-9 text-xs"
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        onClick={handleApplyCustomRange}
                        disabled={!rangeStart || !rangeEnd || rangeStart > rangeEnd}
                        className="h-9 bg-[#006B2D] hover:bg-[#004D20] text-white text-xs font-bold"
                      >
                        Appliquer la période
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

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
          className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#D8E6DB] md:hidden px-2 py-1.5 flex items-center justify-around safe-area-pb"
        >
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 min-w-0 min-h-[48px] px-1.5 py-1 rounded-xl text-[10px] leading-tight font-bold transition-colors text-center",
                isActive
                  ? "text-[#006B2D]"
                  : "text-[#556B5C] hover:text-[#17251C]"
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex items-center justify-center h-7 w-11 rounded-full mb-0.5 transition-colors",
                    isActive ? "bg-[#EBF7EE] text-[#006B2D]" : "bg-transparent"
                  )}
                >
                  <LayoutDashboard className="h-4.5 w-4.5" />
                </span>
                <span className="truncate w-full">Tableau de bord</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/transactions"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 min-w-0 min-h-[48px] px-1.5 py-1 rounded-xl text-[10px] leading-tight font-bold transition-colors text-center",
                isActive
                  ? "text-[#006B2D]"
                  : "text-[#556B5C] hover:text-[#17251C]"
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex items-center justify-center h-7 w-11 rounded-full mb-0.5 transition-colors",
                    isActive ? "bg-[#EBF7EE] text-[#006B2D]" : "bg-transparent"
                  )}
                >
                  <CreditCard className="h-4.5 w-4.5" />
                </span>
                <span className="truncate w-full">Dépôts &amp; Retraits</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/tests"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 min-w-0 min-h-[48px] px-1.5 py-1 rounded-xl text-[10px] leading-tight font-bold transition-colors text-center",
                isActive
                  ? "text-[#006B2D]"
                  : "text-[#556B5C] hover:text-[#17251C]"
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex items-center justify-center h-7 w-11 rounded-full mb-0.5 transition-colors",
                    isActive ? "bg-[#EBF7EE] text-[#006B2D]" : "bg-transparent"
                  )}
                >
                  <ClipboardCheck className="h-4.5 w-4.5" />
                </span>
                <span className="truncate w-full">Tests</span>
              </>
            )}
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
