import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bell, BellOff, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  requestNotificationPermission,
  areNotificationsEnabled,
  getPushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPush,
  showNotification,
} from "@/lib/notifications";

export function NotificationSettings() {
  const [open, setOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkNotificationStatus();
  }, []);

  async function checkNotificationStatus() {
    setNotificationsEnabled(areNotificationsEnabled());

    const subscription = await getPushSubscription();
    setPushEnabled(!!subscription);
  }

  async function handleEnableNotifications() {
    setIsLoading(true);
    try {
      const permission = await requestNotificationPermission();

      if (permission === "granted") {
        setNotificationsEnabled(true);
        toast.success("Notifications enabled");

        // Show test notification
        await showNotification({
          title: "✅ Notifications Enabled",
          body: "You will now receive update notifications.",
          icon: "/logo.png",
        });
      } else {
        toast.error("Notification permission denied");
      }
    } catch (error) {
      console.error("Error enabling notifications:", error);
      toast.error("Failed to enable notifications");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisableNotifications() {
    setNotificationsEnabled(false);
    await unsubscribeFromPush();
    setPushEnabled(false);
    toast.success("Notifications disabled");
  }

  async function handleEnablePush() {
    setIsLoading(true);
    try {
      // In production, use your actual VAPID public key
      const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || "";

      if (!VAPID_PUBLIC_KEY) {
        toast.error("Push notifications not configured");
        setIsLoading(false);
        return;
      }

      const subscription = await subscribeToPushNotifications(VAPID_PUBLIC_KEY);

      if (subscription) {
        setPushEnabled(true);
        toast.success("Push notifications enabled");

        // Send subscription to server
        // await fetch('/api/notifications/subscribe', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(subscription)
        // });
      } else {
        toast.error("Failed to enable push notifications");
      }
    } catch (error) {
      console.error("Error enabling push:", error);
      toast.error("Failed to enable push notifications");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisablePush() {
    setIsLoading(true);
    try {
      await unsubscribeFromPush();
      setPushEnabled(false);
      toast.success("Push notifications disabled");
    } catch (error) {
      console.error("Error disabling push:", error);
      toast.error("Failed to disable push notifications");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Bell className="w-4 h-4" />
        Notifications
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notification Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Browser Notifications */}
            <div className="p-4 rounded-lg border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Browser Notifications</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get notified when cache updates or syncs complete
                  </p>
                </div>
                <div className="text-right">
                  {notificationsEnabled ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              {notificationsEnabled ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisableNotifications}
                  disabled={isLoading}
                  className="w-full"
                >
                  <BellOff className="w-4 h-4 mr-2" />
                  Disable
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleEnableNotifications}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Enable
                </Button>
              )}
            </div>

            {/* Push Notifications */}
            <div className="p-4 rounded-lg border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Push Notifications</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get notified even when app is closed
                  </p>
                </div>
                <div className="text-right">
                  {pushEnabled ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              {pushEnabled ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisablePush}
                  disabled={isLoading}
                  className="w-full"
                >
                  <BellOff className="w-4 h-4 mr-2" />
                  Disable
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleEnablePush}
                  disabled={isLoading || !notificationsEnabled}
                  className="w-full"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Enable
                </Button>
              )}

              {!notificationsEnabled && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                  Enable browser notifications first
                </p>
              )}
            </div>

            {/* Info */}
            <div className="p-3 rounded bg-blue-50 border border-blue-200">
              <p className="text-xs text-blue-800 space-y-1">
                <strong>Notifications will alert you when:</strong>
                <br />• Cache is updated with new data
                <br />• Offline changes are synced
                <br />• Sync operations complete
                <br />• Errors occur during operations
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
