import { useCache, useCacheInvalidation } from "@/hooks/use-cache";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth, RequireRole } from "@/context/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { CACHE_TIERS, purgeAllAppCaches } from "@/lib/queryClient";
import {
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  Wifi,
  WifiOff,
  LayoutDashboard,
  CreditCard,
  Trophy,
  Building2,
  Users,
  FileText,
  CheckSquare,
  Layers,
  Sparkles,
  Info,
  Server,
  Activity,
  ShieldAlert,
} from "lucide-react";

interface CacheEntityDefinition {
  id: string;
  queryKey: string;
  domain: "bets" | "transactions" | "venues" | "validation" | "lookups" | "users" | "illegal";
  label: string;
  description: string;
  tier: "OPERATIONAL" | "REFERENCE" | "DASHBOARD" | "ADMIN";
  icon: React.ComponentType<{ className?: string }>;
  staleTimeLabel: string;
}

const CACHE_ENTITIES: CacheEntityDefinition[] = [
  {
    id: "transactions",
    queryKey: "transactions",
    domain: "transactions",
    label: "Transactions Financières",
    description: "Dépôts, retraits et flux monétaires des parieurs",
    tier: "OPERATIONAL",
    icon: CreditCard,
    staleTimeLabel: "1 min",
  },
  {
    id: "bets",
    queryKey: "bets",
    domain: "bets",
    label: "Paris Sportifs",
    description: "Tickets enregistrés, cotes et résultats des événements",
    tier: "OPERATIONAL",
    icon: Trophy,
    staleTimeLabel: "1 min",
  },
  {
    id: "validation",
    queryKey: "validation",
    domain: "validation",
    label: "Contrôle & Validation",
    description: "Files d'attente d'approbation et levées de réserves",
    tier: "OPERATIONAL",
    icon: CheckSquare,
    staleTimeLabel: "1 min",
  },
  {
    id: "dashboard",
    queryKey: "dashboard",
    domain: "transactions", // invalidation liée
    label: "Tableau de Bord & KPIs",
    description: "Agrégats financiers, métriques de rentabilité et courbes 7j",
    tier: "DASHBOARD",
    icon: LayoutDashboard,
    staleTimeLabel: "1 min",
  },
  {
    id: "venues",
    queryKey: "venues",
    domain: "venues",
    label: "Salles & Points de Vente",
    description: "Établissements physiques, localisations et capacités",
    tier: "REFERENCE",
    icon: Building2,
    staleTimeLabel: "10 min",
  },
  {
    id: "lookups",
    queryKey: "lookups",
    domain: "lookups",
    label: "Référentiels Métier",
    description: "Opérateurs, plateformes, moyens de paiement et statuts",
    tier: "REFERENCE",
    icon: Layers,
    staleTimeLabel: "10 min",
  },
  {
    id: "users",
    queryKey: "users",
    domain: "users",
    label: "Comptes Utilisateurs",
    description: "Habilitations, rôles et états des comptes de la plateforme",
    tier: "ADMIN",
    icon: Users,
    staleTimeLabel: "2 min",
  },
  {
    id: "audit",
    queryKey: "audit",
    domain: "users",
    label: "Journal d'Audit Système",
    description: "Traçabilité des opérations sensibles et modifications",
    tier: "ADMIN",
    icon: FileText,
    staleTimeLabel: "2 min",
  },
  {
    id: "illegal",
    queryKey: "illegal_bets",
    domain: "illegal",
    label: "Activités Suspectes",
    description: "Alertes sur montants anormaux et comportements déviants",
    tier: "ADMIN",
    icon: ShieldAlert,
    staleTimeLabel: "2 min",
  },
];

export default function CacheSettingsPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <CacheManagement />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}

function CacheManagement() {
  const cache = useCache();
  const cacheInvalidation = useCacheInvalidation();
  const queryClient = useQueryClient();

  const [cacheStatus, setCacheStatus] = useState<Record<string, any>>({});
  const [cacheSize, setCacheSize] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [selectedTier, setSelectedTier] = useState<string>("ALL");

  // Écoute de l'état réseau en ligne / hors ligne
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      toast.success("Connexion rétablie. Le cache se resynchronise automatiquement.");
    }
    function handleOffline() {
      setIsOnline(false);
      toast.warning("Connexion perdue. L'application bascule sur les données hors-ligne.");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const updateCacheInfo = () => {
    setCacheStatus(cache.getCacheStatus());
    setCacheSize(cache.getCacheSize());
  };

  useEffect(() => {
    updateCacheInfo();
  }, []);

  // Inspection dynamique des requêtes TanStack React Query en mémoire vive
  const queryCacheStats = useMemo(() => {
    const allQueries = queryClient.getQueryCache().getAll();
    const activeQueries = allQueries.filter((q) => q.state.status === "success");
    const staleCount = allQueries.filter((q) => q.isStale()).length;
    const freshCount = activeQueries.length - staleCount;

    return {
      total: allQueries.length,
      active: activeQueries.length,
      stale: staleCount,
      fresh: Math.max(0, freshCount),
    };
  }, [queryClient, cacheStatus, isRefreshing]);

  // Formatage propre en français
  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Ko";
    const k = 1024;
    const sizes = ["Octets", "Ko", "Mo", "Go"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function formatRelativeAge(ms?: number): string {
    if (ms === undefined || ms === Infinity) return "Non synchronisé";
    if (ms < 5000) return "À l'instant";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `Il y a ${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Il y a ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Il y a ${days} j`;
  }

  // Actualisation douce de tout le cache applicatif
  async function handleRefreshAll() {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
      cacheInvalidation.onDataRefresh();
      updateCacheInfo();
      toast.success("Actualisation générale déclenchée : les données se synchronisent en tâche de fond.");
    } catch (error) {
      toast.error("Erreur lors de l'actualisation du cache.");
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  }

  // Invalidation d'une entité spécifique
  async function handleRefreshSingleEntity(entity: CacheEntityDefinition) {
    try {
      await queryClient.invalidateQueries({ queryKey: [entity.queryKey] });
      cache.invalidateDomain(entity.domain);
      updateCacheInfo();
      toast.success(`${entity.label} : cache invalidé, rechargement déclenché.`);
    } catch (error) {
      toast.error(`Erreur d'invalidation pour ${entity.label}`);
    }
  }

  // Nettoyage des clés expirées
  function handleClearExpired() {
    try {
      const count = cache.clearExpiredCache();
      updateCacheInfo();
      if (count > 0) {
        toast.success(`${count} entrée(s) expirée(s) supprimée(s) du cache local.`);
      } else {
        toast.info("Aucune entrée expirée trouvée. Le cache est parfaitement optimisé.");
      }
    } catch (error) {
      toast.error("Erreur lors du nettoyage du cache expiré.");
    }
  }

  // Vider uniquement les données opérationnelles
  function handleClearOperational() {
    try {
      cache.invalidateDomain("transactions");
      cache.invalidateDomain("bets");
      cache.invalidateDomain("validation");
      updateCacheInfo();
      toast.success("Données opérationnelles invalidées (Paris, Transactions, Validations).");
    } catch (error) {
      toast.error("Erreur lors du nettoyage opérationnel.");
    }
  }

  // Purge intégrale sécurisée
  async function handleExecutePurgeAll() {
    setIsPurging(true);
    try {
      purgeAllAppCaches();
      cache.clearAll();
      queryClient.clear();
      updateCacheInfo();
      setPurgeDialogOpen(false);
      toast.success("Purge intégrale réussie : l'ensemble des mémoires et données locales a été réinitialisé.");
    } catch (error) {
      toast.error("Erreur lors de la purge intégrale.");
    } finally {
      setIsPurging(false);
    }
  }

  // Filtrage par palier
  const filteredEntities = useMemo(() => {
    if (selectedTier === "ALL") return CACHE_ENTITIES;
    return CACHE_ENTITIES.filter((e) => e.tier === selectedTier);
  }, [selectedTier]);

  return (
    <div className="space-y-6">
      {/* En-tête officiel de la page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D8E6DB]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#17251C]">
              Gestion du Cache & Données Hors-Ligne
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F3EC] text-[#006B2D] border border-[#C2DEC9]">
              {queryCacheStats.total} requête(s) en mémoire
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#556B5C] mt-1">
            Supervision de la fraîcheur des données, optimisation des performances et résilience réseau
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="min-h-[44px] h-10 px-4 bg-white border-[#D8E6DB] hover:bg-[#F5F8F5] text-[#17251C] font-semibold"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin text-[#006B2D]" : "text-[#556B5C]"}`}
            />
            {isRefreshing ? "Actualisation..." : "Actualiser tout"}
          </Button>

          <Button
            size="sm"
            onClick={() => setPurgeDialogOpen(true)}
            className="min-h-[44px] h-10 px-4 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-semibold shadow-xs"
          >
            <Trash2 className="h-4 w-4 mr-2 text-rose-600" />
            Purger tout le cache
          </Button>
        </div>
      </div>

      {/* Alerte Statut Réseau / Résilience */}
      {!isOnline && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-3">
          <WifiOff className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-900">
              Mode Hors-Ligne Actif — Consultation autonome
            </p>
            <p className="text-amber-800">
              L'application continue de fonctionner en lecture grâce aux instantanés stockés dans votre cache local. Dès rétablissement du réseau, les synchronisations s'effectueront en arrière-plan sans intervention de votre part.
            </p>
          </div>
        </div>
      )}

      {/* Grille Bento des Indicateurs Clés (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : Volume Mémoire Utilisé */}
        <div className="p-5 rounded-xl border border-[#D8E6DB] bg-white shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[#556B5C]">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Stockage Local (Offline)
            </span>
            <div className="p-2 rounded-lg bg-[#E8F3EC] text-[#006B2D]">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#17251C]">
            {formatBytes(cacheSize)}
          </div>
          <div className="text-xs text-[#556B5C] flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#006B2D]" />
            <span>Persistance navigateurs & tables hors-ligne</span>
          </div>
        </div>

        {/* KPI 2 : Requêtes Gérées en Mémoire */}
        <div className="p-5 rounded-xl border border-[#D8E6DB] bg-white shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[#556B5C]">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Requêtes en Mémoire Vive
            </span>
            <div className="p-2 rounded-lg bg-[#E8F3EC] text-[#006B2D]">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#17251C]">
            {queryCacheStats.total}
          </div>
          <div className="text-xs text-[#556B5C] flex items-center gap-1.5">
            <span className="text-emerald-700 font-medium">
              {queryCacheStats.fresh} active(s)
            </span>
            <span>•</span>
            <span className="text-amber-700">
              {queryCacheStats.stale} à renouveler
            </span>
          </div>
        </div>

        {/* KPI 3 : Taux de Fraîcheur Global */}
        <div className="p-5 rounded-xl border border-[#D8E6DB] bg-white shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[#556B5C]">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Qualité de Fraîcheur
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-[#006B2D]">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#17251C]">
            {queryCacheStats.total > 0
              ? `${Math.round((queryCacheStats.fresh / queryCacheStats.total) * 100)} %`
              : "100 %"}
          </div>
          <div className="text-xs text-[#556B5C] flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#006B2D]" />
            <span>Paliers staleTime respectés</span>
          </div>
        </div>

        {/* KPI 4 : État de Connectivité */}
        <div className="p-5 rounded-xl border border-[#D8E6DB] bg-white shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[#556B5C]">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Connectivité Système
            </span>
            <div
              className={`p-2 rounded-lg ${
                isOnline
                  ? "bg-[#E8F3EC] text-[#006B2D]"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {isOnline ? (
                <Wifi className="h-4 w-4" />
              ) : (
                <WifiOff className="h-4 w-4" />
              )}
            </div>
          </div>
          <div className="text-2xl font-bold text-[#17251C]">
            {isOnline ? "En Ligne" : "Hors-Ligne"}
          </div>
          <div className="text-xs text-[#556B5C] flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isOnline ? "bg-[#006B2D]" : "bg-amber-500 animate-pulse"
              }`}
            />
            <span>
              {isOnline
                ? "Synchronisation bidirectionnelle active"
                : "Mode dégradé local actif"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions Rapides de Maintenance */}
      <div className="p-5 rounded-xl border border-[#D8E6DB] bg-white shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#17251C] flex items-center gap-2">
              <Server className="h-4 w-4 text-[#006B2D]" />
              Maintenance & Optimisation du Cache
            </h2>
            <p className="text-xs text-[#556B5C] mt-0.5">
              Commandes d'administration pour libérer l'espace ou forcer le rechargement ciblé
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Action 1 : Invalider opérationnel */}
          <div className="p-4 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] flex flex-col justify-between gap-3">
            <div>
              <div className="font-semibold text-xs text-[#17251C] flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-[#006B2D]" />
                Invalider l'Opérationnel
              </div>
              <p className="text-[11px] text-[#556B5C] mt-1">
                Force la réactualisation des paris, transactions et files de validation sans impacter les référentiels stables.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearOperational}
              className="w-full min-h-[44px] h-10 bg-white border-[#D8E6DB] hover:bg-emerald-50 text-[#006B2D] font-semibold"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Invalider Paris & Transactions
            </Button>
          </div>

          {/* Action 2 : Nettoyer expiré */}
          <div className="p-4 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] flex flex-col justify-between gap-3">
            <div>
              <div className="font-semibold text-xs text-[#17251C] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#006B2D]" />
                Nettoyer le Cache Expiré
              </div>
              <p className="text-[11px] text-[#556B5C] mt-1">
                Supprime les instantanés obsolètes conservés dans le stockage local pour optimiser la mémoire du navigateur.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearExpired}
              className="w-full min-h-[44px] h-10 bg-white border-[#D8E6DB] hover:bg-emerald-50 text-[#006B2D] font-semibold"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Nettoyer Clés Périmées
            </Button>
          </div>

          {/* Action 3 : Référentiels & Lookups */}
          <div className="p-4 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] flex flex-col justify-between gap-3">
            <div>
              <div className="font-semibold text-xs text-[#17251C] flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#006B2D]" />
                Recharger les Référentiels
              </div>
              <p className="text-[11px] text-[#556B5C] mt-1">
                Recharge les listes de salles, opérateurs, moyens de paiement et configurations système.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["lookups"] });
                queryClient.invalidateQueries({ queryKey: ["venues"] });
                updateCacheInfo();
                toast.success("Référentiels métier réactualisés.");
              }}
              className="w-full min-h-[44px] h-10 bg-white border-[#D8E6DB] hover:bg-emerald-50 text-[#006B2D] font-semibold"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Actualiser Référentiels
            </Button>
          </div>
        </div>
      </div>

      {/* Cartes Détaillées par Entité Métier */}
      <div className="p-5 rounded-xl border border-[#D8E6DB] bg-white shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#17251C] flex items-center gap-2">
              <Database className="h-4 w-4 text-[#006B2D]" />
              État Détaillé des Entités Métier
            </h2>
            <p className="text-xs text-[#556B5C] mt-0.5">
              Supervision en temps réel des clés de cache TanStack Query et persistance hors-ligne
            </p>
          </div>

          {/* Filtres de paliers */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "ALL", label: "Tous" },
              { id: "OPERATIONAL", label: "Opérationnel (1 min)" },
              { id: "REFERENCE", label: "Référentiels (10 min)" },
              { id: "DASHBOARD", label: "Supervision (1 min)" },
              { id: "ADMIN", label: "Administration (2 min)" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTier(tab.id)}
                className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  selectedTier === tab.id
                    ? "bg-[#006B2D] text-white shadow-xs"
                    : "bg-[#F5F8F5] text-[#556B5C] hover:bg-[#E8F3EC] hover:text-[#006B2D]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Liste des entités */}
        <div className="space-y-2.5 pt-2">
          {filteredEntities.map((entity) => {
            const Icon = entity.icon;
            const statusKey = entity.id.toUpperCase();
            const localStatus = cacheStatus[statusKey] || { cached: false };

            // Vérifier si une requête est en mémoire TanStack Query
            const queryState = queryClient.getQueryState([entity.queryKey]);
            const isInMemory = queryState && queryState.status === "success";
            const isFetchingNow = queryState?.fetchStatus === "fetching";
            const lastUpdated = queryState?.dataUpdatedAt;

            return (
              <div
                key={entity.id}
                className="p-4 rounded-xl border border-[#D8E6DB] bg-white hover:border-[#C2DEC9] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-[#E8F3EC] text-[#006B2D] shrink-0 mt-0.5">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-[#17251C]">
                        {entity.label}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                        Palier : {entity.tier} ({entity.staleTimeLabel})
                      </span>
                    </div>
                    <p className="text-xs text-[#556B5C] mt-0.5 truncate">
                      {entity.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#D8E6DB]">
                  {/* Badge d'état de fraîcheur */}
                  <div className="text-left sm:text-right">
                    <div className="flex items-center gap-1.5 sm:justify-end">
                      {isInMemory ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-[#006B2D] border border-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          En mémoire vive
                        </span>
                      ) : localStatus.cached ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <HardDrive className="h-3 w-3" />
                          Stockage local
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                          Non chargé
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#556B5C] mt-0.5 flex items-center gap-1 sm:justify-end">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span>
                        {isInMemory && lastUpdated
                          ? formatRelativeAge(Date.now() - lastUpdated)
                          : localStatus.cached && localStatus.age
                          ? formatRelativeAge(localStatus.age)
                          : "En attente d'accès"}
                      </span>
                    </div>
                  </div>

                  {/* Bouton individuel de rafraîchissement */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefreshSingleEntity(entity)}
                    disabled={isFetchingNow}
                    className="min-h-[44px] h-9 px-3 bg-white border-[#D8E6DB] hover:bg-[#F5F8F5] text-[#17251C]"
                    title={`Actualiser ${entity.label}`}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        isFetchingNow ? "animate-spin text-[#006B2D]" : "text-[#556B5C]"
                      }`}
                    />
                    <span className="sr-only sm:not-sr-only sm:ml-1.5 text-xs">
                      Actualiser
                    </span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guide & Architecture de Caching (Solid colors, no gradient) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Carte 1 : Fonctionnement du Cache Hybride */}
        <div className="p-5 rounded-xl border border-[#C2DEC9] bg-[#E8F3EC]/50 space-y-3">
          <div className="flex items-center gap-2 text-[#004D20]">
            <Sparkles className="h-4 w-4 text-[#006B2D]" />
            <h3 className="font-bold text-sm">
              Architecture Hybride à Deux Niveaux
            </h3>
          </div>
          <p className="text-xs text-[#17251C] leading-relaxed">
            L'application combine <strong>TanStack React Query</strong> pour la mise en cache en mémoire vive (accès instantané, zéro latence) et un <strong>miroir LocalStorage sécurisé</strong> garantissant la disponibilité des données critiques même en cas de rupture de réseau.
          </p>
          <div className="text-xs text-[#556B5C] space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#006B2D] shrink-0" />
              <span><strong>Opérationnel :</strong> actualisation automatique dès 1 minute d'inactivité.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#006B2D] shrink-0" />
              <span><strong>Référentiels :</strong> mise en cache longue durée de 10 minutes à 1 heure.</span>
            </div>
          </div>
        </div>

        {/* Carte 2 : Résilience & Invalidation Automatique */}
        <div className="p-5 rounded-xl border border-[#D8E6DB] bg-white space-y-3">
          <div className="flex items-center gap-2 text-[#17251C]">
            <Info className="h-4 w-4 text-[#006B2D]" />
            <h3 className="font-bold text-sm">
              Invalidation Automatique & Intégrité
            </h3>
          </div>
          <p className="text-xs text-[#556B5C] leading-relaxed">
            Chaque opération d'écriture (création d'un pari, validation d'une transaction, modification de point de vente) déclenche une invalidation ciblée des caches dépendants. Vos listes et tableaux de bord restent perpétuellement synchronisés sans nécessiter de rechargement complet de page.
          </p>
          <div className="text-xs text-[#556B5C] space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>Zéro requête superflue lors des simples allers-retours entre pages.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>Préservation systématique de vos filtres et de vos sélections de période.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmation pour la Purge Intégrale */}
      <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <DialogContent className="max-w-md bg-white border border-[#D8E6DB]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-[#17251C]">
                  Confirmer la purge intégrale du cache ?
                </DialogTitle>
                <DialogDescription className="text-xs text-[#556B5C] mt-0.5">
                  Action de maintenance avancée
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="text-xs text-[#556B5C] space-y-2 py-2">
            <p>
              Cette opération va vider l'ensemble des mémoires tampons de l'application :
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-[#17251C]">
              <li>Toutes les requêtes mémorisées dans React Query</li>
              <li>Les instantanés hors-ligne stockés dans le navigateur</li>
              <li>Les états temporaires de tri et de filtrage non persistés</li>
            </ul>
            <p className="text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2 font-medium">
              Votre session administrateur sera conservée. Les données seront automatiquement rechargées depuis le serveur lors de vos prochaines visites.
            </p>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPurgeDialogOpen(false)}
              disabled={isPurging}
              className="min-h-[44px] h-10 border-[#D8E6DB] text-[#17251C]"
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleExecutePurgeAll}
              disabled={isPurging}
              className="min-h-[44px] h-10 bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {isPurging ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Purge en cours...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Confirmer la purge
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
