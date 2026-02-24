import webpush from "web-push";
import { createServerSupabase } from "./api-auth";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:jordan@digitalonda.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (err) {
    console.warn("VAPID config invalid, push disabled:", err instanceof Error ? err.message : err);
  }
}

interface PushPayload {
  title: string;
  body?: string;
  link?: string;
  icon?: string;
}

/**
 * Send a Web Push notification to all of a user's registered devices.
 * Silently removes expired/invalid subscriptions (410 Gone).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("VAPID keys not configured — skipping push");
    return 0;
  }

  const supabase = createServerSupabase();

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subs?.length) return 0;

  const jsonPayload = JSON.stringify({
    ...payload,
    icon: payload.icon || "/icons/icon-192.png",
  });

  let sent = 0;
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired or invalid — mark for cleanup
          expired.push(sub.id);
        } else {
          console.error(`Push failed for ${sub.endpoint}:`, err);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expired.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", expired);
  }

  return sent;
}
