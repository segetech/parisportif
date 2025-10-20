import { useSync, useNetworkStatus } from "@/hooks/use-sync";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, RotateCcw, AlertCircle, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";

export function SyncStatus() {
  const { status, performSync, clearQueue, updateStatus } = useSync({
    autoSync: true,
    syncInterval: 30000,
    enableServiceWorker: false, // Disabled due to body stream issues
  });
  const { isOnline } = useNetworkStatus();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return "Never";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {/* Status Badge */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border shadow-md hover:shadow-lg transition-all"
      >
        {isOnline ? (
          <>
            <Wifi className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-600">Offline</span>
          </>
        )}
        {status.pendingCount > 0 && (
          <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
            {status.pendingCount}
          </span>
        )}
      </button>

      {/* Details Panel */}
      {showDetails && (
        <div className="absolute bottom-12 right-0 w-80 bg-white rounded-lg border shadow-lg p-4 space-y-3">
          {/* Status Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Network</span>
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-green-600">Online</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="font-medium text-amber-600">Offline</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sync Status</span>
              <span className="font-medium">
                {status.isSyncing ? "Syncing..." : "Idle"}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pending Items</span>
              <span className="font-medium">{status.pendingCount}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last Sync</span>
              <span className="text-xs">{formatTime(status.lastSyncTime)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={performSync}
              disabled={status.isSyncing || !isOnline || status.pendingCount === 0}
              className="flex-1"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Sync Now
            </Button>

            {status.pendingCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={clearQueue}
                className="flex-1 text-red-600 hover:text-red-700"
              >
                Clear
              </Button>
            )}
          </div>

          {/* Info */}
          {!isOnline && (
            <div className="p-2 rounded bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-800">
                You're offline. Changes will be synced when you're back online.
              </p>
            </div>
          )}

          {status.pendingCount > 0 && isOnline && (
            <div className="p-2 rounded bg-blue-50 border border-blue-200">
              <p className="text-xs text-blue-800">
                {status.pendingCount} item(s) waiting to sync.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
