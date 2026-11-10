import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import {
  User as UserIcon,
  Settings,
  HardDrive,
  History,
  LogOut,
  LogIn,
  Loader2,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UserAvatarMenuProps {
  collapsed?: boolean;
  align?: "start" | "end" | "center";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function UserAvatarMenu({
  collapsed = false,
  align = "end",
  side = "top",
  className,
}: UserAvatarMenuProps) {
  const { user, logout, isLoggingOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (isLoggingOut) return;
    try {
      await logout();
    } catch (err) {
      console.warn("Erreur lors de la déconnexion:", err);
    }
  };

  const fullName = useMemo(() => {
    if (!user) return "Invité";
    const parts = [user.nom, user.prenom].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : user.email;
  }, [user]);

  const initials = useMemo(() => {
    if (!user) return "PS";
    const first = user.nom?.trim()?.[0] || "";
    const second = user.prenom?.trim()?.[0] || "";
    const res = (first + second).toUpperCase();
    return res || (user.email?.[0]?.toUpperCase() ?? "U");
  }, [user]);

  const roleBadge = useMemo(() => {
    const role = user?.role || "AGENT";
    switch (role) {
      case "ADMIN":
        return {
          label: "Administrateur",
          className: "bg-[#006B2D] text-white hover:bg-[#004D20]",
        };
      case "CONTROLEUR":
        return {
          label: "Contrôleur",
          className: "bg-blue-600 text-white hover:bg-blue-700",
        };
      default:
        return {
          label: "Agent de saisie",
          className: "bg-slate-700 text-slate-100 hover:bg-slate-800",
        };
    }
  }, [user?.role]);

  const isAdmin = user?.role === "ADMIN";
  const isController = user?.role === "CONTROLEUR";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu utilisateur"
          className={cn(
            "flex items-center gap-3 w-full p-2 rounded-xl text-left transition-colors outline-none",
            "hover:bg-[#003816] focus-visible:ring-2 focus-visible:ring-[#FFD000]",
            collapsed ? "justify-center px-1" : "justify-between",
            className
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <Avatar className="h-9 w-9 rounded-xl border border-white/20 bg-[#003816] text-white shadow-xs">
                <AvatarFallback className="font-bold text-xs tracking-wider bg-[#003816] text-[#FFD000]">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Point de présence en ligne actif */}
              {user && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#10b981] border-2 border-[#004D20]"
                  title="En ligne"
                />
              )}
            </div>

            {!collapsed && (
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="font-bold text-xs text-white truncate">
                  {fullName}
                </span>
                <span className="text-[11px] text-white/70 truncate">
                  {user?.email || "Mode aperçu"}
                </span>
              </div>
            )}
          </div>

          {!collapsed && (
            <ChevronDown className="h-4 w-4 text-white/60 shrink-0 opacity-70" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-64 rounded-xl border border-[#D8E6DB] bg-white text-[#17251C] p-2 shadow-xl z-50"
      >
        {/* En-tête profil */}
        <DropdownMenuLabel className="font-normal p-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 rounded-xl border border-[#D8E6DB] bg-[#004D20] text-white">
              <AvatarFallback className="font-bold text-sm bg-[#004D20] text-[#FFD000]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-[#17251C] truncate max-w-[130px]">
                  {fullName}
                </span>
                <Badge
                  className={cn(
                    "text-[10px] px-1.5 py-0 rounded font-medium border-0 shrink-0",
                    roleBadge.className
                  )}
                >
                  {roleBadge.label}
                </Badge>
              </div>
              <span className="text-[11px] text-[#556B5C] truncate mt-0.5">
                {user?.email || "Mode aperçu (non connecté)"}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] mt-1 font-semibold">
                {user ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-[#006B2D]" />
                    <span className="text-[#006B2D]">Compte actif</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-amber-700">Non connecté</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-[#E2ECE4] my-1.5" />

        <DropdownMenuGroup className="space-y-0.5">
          <DropdownMenuItem
            onClick={() => navigate("/profil")}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#17251C] cursor-pointer hover:bg-[#F5F8F5] hover:text-[#006B2D] focus:bg-[#F5F8F5] focus:text-[#006B2D]"
          >
            <UserIcon className="h-4 w-4 text-[#006B2D] shrink-0" />
            <span>Mon Profil</span>
          </DropdownMenuItem>

          {(isAdmin || isController) && (
            <DropdownMenuItem
              onClick={() => navigate("/journal")}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#17251C] cursor-pointer hover:bg-[#F5F8F5] hover:text-[#006B2D] focus:bg-[#F5F8F5] focus:text-[#006B2D]"
            >
              <History className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Journal d'audit</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => navigate("/cache")}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#17251C] cursor-pointer hover:bg-[#F5F8F5] hover:text-[#006B2D] focus:bg-[#F5F8F5] focus:text-[#006B2D]"
          >
            <HardDrive className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Gestion du Cache</span>
          </DropdownMenuItem>

          {isAdmin && (
            <DropdownMenuItem
              onClick={() => navigate("/parametres")}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#17251C] cursor-pointer hover:bg-[#F5F8F5] hover:text-[#006B2D] focus:bg-[#F5F8F5] focus:text-[#006B2D]"
            >
              <Settings className="h-4 w-4 text-[#556B5C] shrink-0" />
              <span>Paramètres Système</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="bg-[#E2ECE4] my-1.5" />

        {user ? (
          <DropdownMenuItem
            disabled={isLoggingOut}
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#E52329] cursor-pointer hover:bg-[#FEECEB] hover:text-[#E52329] focus:bg-[#FEECEB] focus:text-[#E52329] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#E52329]" />
                <span>Déconnexion en cours…</span>
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Déconnexion</span>
              </>
            )}
          </DropdownMenuItem>
        ) : (
          <div className="space-y-1">
            <DropdownMenuItem
              onClick={() => navigate("/login")}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#006B2D] cursor-pointer hover:bg-[#F5F8F5] hover:text-[#004D20] focus:bg-[#F5F8F5] focus:text-[#004D20]"
            >
              <LogIn className="h-4 w-4 shrink-0" />
              <span>Se connecter à un compte</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoggingOut}
              onClick={handleLogout}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#E52329] cursor-pointer hover:bg-[#FEECEB] hover:text-[#E52329] focus:bg-[#FEECEB] focus:text-[#E52329] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#E52329]" />
                  <span>Déconnexion en cours…</span>
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Déconnexion / Quitter l'aperçu</span>
                </>
              )}
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
