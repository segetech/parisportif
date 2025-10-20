import { useCache, useCacheInvalidation } from "@/hooks/use-cache";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { RequireAuth, RequireRole } from "@/context/AuthContext";
import AppLayout from "@/components/layout/AppLayout";

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
  const [cacheStatus, setCacheStatus] = useState<Record<string, any>>({});
  const [cacheSize, setCacheSize] = useState(0);

  useEffect(() => {
    updateCacheInfo();
  }, []);

  function updateCacheInfo() {
    setCacheStatus(cache.getCacheStatus());
    setCacheSize(cache.getCacheSize());
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  function formatAge(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m ago`;
    return `${minutes}m ago`;
  }

  async function handleClearCache(type: "all" | "data" | "expired") {
    try {
      if (type === "all") {
        cache.clearAll();
        toast.success("All cache cleared");
      } else if (type === "data") {
        cache.invalidateAllData();
        toast.success("Data cache cleared");
      } else if (type === "expired") {
        const count = cache.clearExpiredCache();
        toast.success(`Cleared ${count} expired entries`);
      }
      updateCacheInfo();
    } catch (error) {
      toast.error("Error clearing cache");
    }
  }

  async function handleRefreshData() {
    try {
      cacheInvalidation.onDataRefresh();
      toast.success("Data cache invalidated - will refresh on next access");
      updateCacheInfo();
    } catch (error) {
      toast.error("Error refreshing data");
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Cache Management</h1>
        <p className="text-muted-foreground">
          Monitor and manage application cache and offline data
        </p>
      </div>

      {/* Cache Info */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">Cache Size</div>
          <div className="text-2xl font-semibold">{formatBytes(cacheSize)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">Cached Items</div>
          <div className="text-2xl font-semibold">
            {Object.values(cacheStatus).filter((s) => s.cached).length}
          </div>
        </div>
      </div>

      {/* Cache Status */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Cache Status</h2>
        <div className="space-y-3">
          {Object.entries(cacheStatus).map(([name, status]) => (
            <div
              key={name}
              className="flex items-center justify-between p-3 bg-muted/30 rounded"
            >
              <div>
                <div className="font-medium">{name}</div>
                <div className="text-xs text-muted-foreground">
                  {status.cached
                    ? `Cached ${status.age ? formatAge(status.age) : "recently"}`
                    : "Not cached"}
                </div>
              </div>
              <div
                className={`w-3 h-3 rounded-full ${status.cached ? "bg-green-500" : "bg-gray-300"}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Cache Actions */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Cache Actions</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() => handleRefreshData()}
            className="w-full"
          >
            Refresh Data Cache
          </Button>
          <Button
            variant="outline"
            onClick={() => handleClearCache("expired")}
            className="w-full"
          >
            Clear Expired Cache
          </Button>
          <Button
            variant="outline"
            onClick={() => handleClearCache("data")}
            className="w-full"
          >
            Clear Data Cache
          </Button>
          <Button
            variant="outline"
            onClick={() => handleClearCache("all")}
            className="w-full bg-red-50 text-red-600 hover:bg-red-100"
          >
            Clear All Cache
          </Button>
        </div>
      </div>

      {/* Cache Info */}
      <div className="rounded-lg border p-6 space-y-4 bg-blue-50">
        <h3 className="font-semibold text-blue-900">About Cache</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>React Query Cache:</strong> Stores API responses in memory
            for fast access. Data becomes stale after 5-10 minutes and is
            automatically refreshed on next access.
          </p>
          <p>
            <strong>LocalStorage Cache:</strong> Provides offline support.
            Cached data is available even when the network is unavailable.
          </p>
          <p>
            <strong>Cache Invalidation:</strong> When you create, update, or
            delete data, related caches are automatically invalidated and will
            refresh on next access.
          </p>
          <p>
            <strong>Performance:</strong> Caching significantly reduces network
            requests and improves app responsiveness, especially on slower
            connections.
          </p>
        </div>
      </div>

      {/* Offline Support Info */}
      <div className="rounded-lg border p-6 space-y-4 bg-amber-50">
        <h3 className="font-semibold text-amber-900">Offline Support</h3>
        <div className="text-sm text-amber-800 space-y-2">
          <p>
            When you lose internet connection, the app will automatically use
            cached data from localStorage for viewing. You can:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>View previously cached transactions and bets</li>
            <li>Browse cached venue information</li>
            <li>See your user profile and settings</li>
          </ul>
          <p className="mt-2">
            <strong>Note:</strong> Create, update, and delete operations require
            internet connection.
          </p>
        </div>
      </div>
    </div>
  );
}
