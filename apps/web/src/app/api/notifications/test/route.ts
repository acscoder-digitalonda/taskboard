import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import {
  createUserSupabase,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:jordan@digitalonda.com";

/**
 * POST /api/notifications/test
 * Send a test push notification with full diagnostics.
 *
 * Body (optional):
 *   { target_email?: string }   — send to a specific user by email
 *
 * If target_email is provided, looks up the user by email and sends to them.
 * Otherwise sends to the authenticated (caller) user.
 *
 * Returns detailed diagnostics to help debug push issues:
 *   - target_user_id, target_email
 *   - subscriptions_found (how many push registrations exist)
 *   - devices_reached (how many succeeded)
 *   - endpoints (partial URLs for identifying browsers/devices)
 *   - errors (any failure messages)
 *   - vapid_configured (whether VAPID keys are set)
 */
export async function POST(req: NextRequest) {
  try {
    const callerId = await getAuthenticatedUserId(req);
    if (!callerId) return unauthorizedResponse();

    const supabase = createUserSupabase(req);

    // Parse optional body
    let targetEmail: string | undefined;
    try {
      const body = await req.json();
      targetEmail = body?.target_email;
    } catch {
      // No body or invalid JSON — that's fine, send to self
    }

    // Determine target user
    let targetUserId = callerId;
    let resolvedEmail = "";

    if (targetEmail) {
      // Look up user by email in the users table
      const { data: targetUser, error: userErr } = await supabase
        .from("users")
        .select("id, email, name")
        .eq("email", targetEmail)
        .maybeSingle();

      if (userErr || !targetUser) {
        return NextResponse.json({
          success: false,
          error: `No user found with email: ${targetEmail}`,
          hint: "Make sure this email exists in the users table",
        });
      }

      targetUserId = targetUser.id;
      resolvedEmail = targetUser.email;
      console.log(`[Test Push] Targeting user: ${targetUser.name} (${targetUser.email}) → ${targetUser.id}`);
    }

    // Check VAPID configuration
    const vapidConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
    if (!vapidConfigured) {
      return NextResponse.json({
        success: false,
        error: "VAPID keys not configured",
        vapid_configured: false,
        hint: "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars",
      });
    }

    // Configure web-push
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Query push subscriptions for the target user
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, created_at")
      .eq("user_id", targetUserId);

    if (subErr) {
      console.error("[Test Push] DB error querying subscriptions:", subErr);
      return NextResponse.json({
        success: false,
        error: "Failed to query push subscriptions",
        db_error: subErr.message,
      });
    }

    const subscriptionsFound = subs?.length || 0;
    const endpoints = (subs || []).map((s) => ({
      id: s.id,
      endpoint_preview: s.endpoint.substring(0, 80) + "...",
      created_at: s.created_at,
    }));

    console.log(`[Test Push] Found ${subscriptionsFound} subscription(s) for user ${targetUserId}`);
    endpoints.forEach((ep, i) => {
      console.log(`  [${i}] ${ep.endpoint_preview} (created ${ep.created_at})`);
    });

    if (subscriptionsFound === 0) {
      return NextResponse.json({
        success: false,
        target_user_id: targetUserId,
        target_email: resolvedEmail || targetEmail || "(self)",
        subscriptions_found: 0,
        devices_reached: 0,
        endpoints: [],
        error: "No push subscriptions found for this user",
        hint: "Open the app on your phone → Settings → Enable push notifications first",
        vapid_configured: true,
      });
    }

    // Send test push to each subscription with detailed error tracking
    const jsonPayload = JSON.stringify({
      title: "TaskBoard Test",
      body: "Push notifications are working! 🎉",
      link: "/",
      icon: "/icons/icon-192.png",
      id: `test-${Date.now()}`,
    });

    let devicesReached = 0;
    const errors: string[] = [];
    const expired: string[] = [];

    await Promise.allSettled(
      (subs || []).map(async (sub) => {
        try {
          console.log(`[Test Push] Sending to ${sub.endpoint.substring(0, 60)}...`);
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            jsonPayload
          );
          devicesReached++;
          console.log(`[Test Push] ✅ Success for ${sub.endpoint.substring(0, 60)}`);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[Test Push] ❌ Failed for ${sub.endpoint.substring(0, 60)}: ${statusCode} ${errMsg}`);

          if (statusCode === 410 || statusCode === 404) {
            expired.push(sub.id);
            errors.push(`Subscription expired (${statusCode}) — will be removed`);
          } else {
            errors.push(`Push failed (${statusCode || "network"}): ${errMsg}`);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (expired.length > 0) {
      console.log(`[Test Push] Removing ${expired.length} expired subscription(s)`);
      await supabase.from("push_subscriptions").delete().in("id", expired);
    }

    return NextResponse.json({
      success: devicesReached > 0,
      target_user_id: targetUserId,
      target_email: resolvedEmail || targetEmail || "(self)",
      subscriptions_found: subscriptionsFound,
      devices_reached: devicesReached,
      expired_removed: expired.length,
      endpoints,
      errors: errors.length > 0 ? errors : undefined,
      vapid_configured: true,
    });
  } catch (error) {
    console.error("[Test Push] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to send test push", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
