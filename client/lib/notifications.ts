// Push Notification Management
// Handles permission requests, subscription, and notifications

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: NotificationAction[];
  data?: any;
}

interface NotificationAction {
  action: string;
  title: string;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('[Notifications] Notifications not supported');
    return 'denied';
  }

  if (Notification.permission !== 'default') {
    return Notification.permission;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[Notifications] Permission requested:', permission);
    return permission;
  } catch (error) {
    console.error('[Notifications] Permission request failed:', error);
    return 'denied';
  }
}

/**
 * Check if notifications are enabled
 */
export function areNotificationsEnabled(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Show a local notification
 */
export async function showNotification(options: NotificationOptions): Promise<Notification | null> {
  if (!areNotificationsEnabled()) {
    console.log('[Notifications] Notifications not enabled');
    return null;
  }

  try {
    // Try to use service worker if available
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      return registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/logo.png',
        tag: options.tag || 'default',
        requireInteraction: options.requireInteraction || false,
        data: options.data,
      });
    } else {
      // Fallback to basic Notification API
      return new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/logo.png',
        tag: options.tag || 'default',
        requireInteraction: options.requireInteraction || false,
      });
    }
  } catch (error) {
    console.error('[Notifications] Failed to show notification:', error);
    return null;
  }
}

/**
 * Show cache update notification
 */
export async function notifyCacheUpdate(type: string, count: number): Promise<void> {
  const typeLabel = {
    transactions: 'Transactions',
    bets: 'Bets',
    venues: 'Venues',
    users: 'Users',
  }[type] || type;

  await showNotification({
    title: '✅ Cache Updated',
    body: `${typeLabel} have been updated. Tap to refresh.`,
    icon: '/logo.png',
    tag: `cache-update-${type}`,
    data: { type, count },
  });
}

/**
 * Show sync complete notification
 */
export async function notifySyncComplete(synced: number, failed: number): Promise<void> {
  let message = `${synced} item(s) synced`;
  if (failed > 0) {
    message += `, ${failed} failed`;
  }

  await showNotification({
    title: '✅ Sync Complete',
    body: message,
    icon: '/logo.png',
    tag: 'sync-complete',
  });
}

/**
 * Show offline notification
 */
export async function notifyOffline(): Promise<void> {
  await showNotification({
    title: '⚠️ You are Offline',
    body: 'Your changes will be synced when online.',
    icon: '/logo.png',
    tag: 'offline-status',
  });
}

/**
 * Show online notification
 */
export async function notifyOnline(): Promise<void> {
  await showNotification({
    title: '✅ You are Online',
    body: 'Syncing changes...',
    icon: '/logo.png',
    tag: 'online-status',
  });
}

/**
 * Show error notification
 */
export async function notifyError(title: string, message: string): Promise<void> {
  await showNotification({
    title,
    body: message,
    icon: '/logo.png',
    tag: 'error',
    requireInteraction: true,
  });
}

/**
 * Close notification
 */
export async function closeNotification(tag: string): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag });
    notifications.forEach((notification) => notification.close());
  }
}

/**
 * Get all active notifications
 */
export async function getActiveNotifications(): Promise<Notification[]> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    return registration.getNotifications();
  }
  return [];
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator && 'PushManager' in window)) {
    console.log('[Notifications] Push notifications not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    console.log('[Notifications] Push subscription successful');
    return subscription;
  } catch (error) {
    console.error('[Notifications] Push subscription failed:', error);
    return null;
  }
}

/**
 * Check if already subscribed to push
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator && 'PushManager' in window)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  } catch (error) {
    console.error('[Notifications] Failed to get subscription:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const subscription = await getPushSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('[Notifications] Unsubscribed from push');
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Notifications] Unsubscribe failed:', error);
    return false;
  }
}

/**
 * Utility: Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
