/**
 * Client-side Web Push helpers.
 * Handles browser permission, subscription, and server sync.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

/** Convert a base64url string to a Uint8Array for applicationServerKey */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Check if the browser supports push notifications */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Get the current notification permission state */
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Subscribe the browser to push notifications and register with our server.
 * Returns true on success, false if permission denied or error.
 */
export async function subscribeToPush(authToken: string): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys) return false;

    // Register with server
    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }),
    });

    return res.ok;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return false;
  }
}

/**
 * Unsubscribe from push notifications and remove from server.
 */
export async function unsubscribeFromPush(authToken: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // Remove from server
      await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ endpoint }),
      });
    }

    return true;
  } catch (err) {
    console.error("Push unsubscribe failed:", err);
    return false;
  }
}

/**
 * Check if the user currently has an active push subscription in this browser.
 */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
