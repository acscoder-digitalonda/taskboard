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

/** Result of subscribeToPush — includes error message for debugging */
export interface PushSubscribeResult {
  ok: boolean;
  error?: string;
}

/**
 * Subscribe the browser to push notifications and register with our server.
 * Returns { ok: true } on success, { ok: false, error: "..." } with detailed reason on failure.
 */
export async function subscribeToPush(authToken: string): Promise<PushSubscribeResult> {
  console.log("[Push] Starting subscription...");

  if (!isPushSupported()) {
    const msg = "Push not supported in this browser (missing serviceWorker, PushManager, or Notification)";
    console.error("[Push]", msg);
    return { ok: false, error: msg };
  }

  if (!VAPID_PUBLIC_KEY) {
    const msg = "VAPID public key not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY env var is empty)";
    console.error("[Push]", msg);
    return { ok: false, error: msg };
  }

  console.log("[Push] VAPID key present:", VAPID_PUBLIC_KEY.substring(0, 12) + "...");

  try {
    // Step 1: Request notification permission
    console.log("[Push] Requesting notification permission...");
    const permission = await Notification.requestPermission();
    console.log("[Push] Permission result:", permission);
    if (permission !== "granted") {
      return { ok: false, error: `Notification permission ${permission}. Go to browser settings to allow notifications for this site.` };
    }

    // Step 2: Get service worker registration
    console.log("[Push] Waiting for service worker...");
    const registration = await navigator.serviceWorker.ready;
    console.log("[Push] Service worker ready, scope:", registration.scope);

    // Step 3: Subscribe to push via browser
    console.log("[Push] Subscribing to pushManager...");
    const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const applicationServerKey = keyBytes.buffer.slice(
      keyBytes.byteOffset,
      keyBytes.byteOffset + keyBytes.byteLength
    ) as ArrayBuffer;

    let subscription: PushSubscription;
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (subErr) {
      const msg = `pushManager.subscribe() failed: ${subErr instanceof Error ? subErr.message : String(subErr)}`;
      console.error("[Push]", msg);
      return { ok: false, error: msg };
    }

    console.log("[Push] Browser subscription created:", subscription.endpoint.substring(0, 60) + "...");

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys) {
      const msg = "Subscription missing endpoint or keys";
      console.error("[Push]", msg);
      return { ok: false, error: msg };
    }

    // Step 4: Register with our server
    console.log("[Push] Saving subscription to server...");
    let res: Response;
    try {
      res = await fetch("/api/notifications/subscribe", {
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
    } catch (fetchErr) {
      const msg = `Network error saving subscription: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
      console.error("[Push]", msg);
      return { ok: false, error: msg };
    }

    if (!res.ok) {
      let serverError = "";
      try {
        const body = await res.json();
        serverError = body.error || JSON.stringify(body);
      } catch {
        serverError = `HTTP ${res.status}`;
      }
      const msg = `Server rejected subscription: ${serverError}`;
      console.error("[Push]", msg);
      return { ok: false, error: msg };
    }

    console.log("[Push] Subscription saved successfully!");
    return { ok: true };
  } catch (err) {
    const msg = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[Push]", msg);
    return { ok: false, error: msg };
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
