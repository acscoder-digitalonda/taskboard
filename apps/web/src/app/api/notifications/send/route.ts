import { NextRequest, NextResponse } from "next/server";
import {
  createUserSupabase,
  createServerSupabase,
  getAuthenticatedUserId,
  verifyWebhookSecret,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { sendPushToUser } from "@/lib/web-push";
import { SupabaseClient } from "@supabase/supabase-js";
import { NotificationType } from "@/types";

/**
 * Map notification types to the user_preferences column that controls them.
 */
function shouldNotify(
  type: NotificationType,
  prefs: Record<string, unknown>
): boolean {
  switch (type) {
    case "task_assigned":
    case "task_updated":
    case "task_completed":
      return prefs.notify_task_assigned !== false;
    case "mention":
      return prefs.notify_mentions !== false;
    case "dm":
    case "channel_message":
      return prefs.notify_dm !== false;
    case "agent_report":
    case "checkin_due":
      return prefs.notify_agent_reports !== false;
    case "email_ingested":
    case "email_triage":
      return true; // always deliver email notifications
    default:
      return true;
  }
}

/**
 * Check if the current time (in the user's timezone) falls within quiet hours.
 */
function isInQuietHours(
  quietStart: string | null,
  quietEnd: string | null,
  timezone: string
): boolean {
  if (!quietStart || !quietEnd) return false;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
    const nowMinutes = hour * 60 + minute;

    const [startH, startM] = quietStart.split(":").map(Number);
    const [endH, endM] = quietEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same-day range (e.g., 22:00 - 23:00)
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00 - 07:00)
      return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }
  } catch {
    return false;
  }
}

/**
 * POST /api/notifications/send
 * Creates an in-app notification and auto-delivers via push + WhatsApp
 * based on user preferences, quiet hours, and notification type.
 *
 * Body: {
 *   user_id: string,
 *   type: NotificationType,
 *   title: string,
 *   body?: string,
 *   link?: string,
 *   reference_id?: string,
 *   reference_type?: string,
 *   priority?: number,  // 1=urgent → triggers WhatsApp; 2-4 or omitted → push only
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // Accept either user session auth OR webhook secret (for internal service calls)
    const userId = await getAuthenticatedUserId(req);
    const isWebhook = verifyWebhookSecret(req);
    if (!userId && !isWebhook) return unauthorizedResponse();

    // Use user JWT when available (satisfies RLS without service role key).
    // Fall back to server client for webhook/machine-to-machine calls.
    let supabase: SupabaseClient;
    if (userId) {
      supabase = createUserSupabase(req);
    } else {
      supabase = createServerSupabase();
    }
    const payload = await req.json();
    const {
      user_id,
      type,
      title,
      body,
      link,
      reference_id,
      reference_type,
      priority,
    } = payload;

    if (!user_id || !type || !title) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, type, title" },
        { status: 400 }
      );
    }

    // Create in-app notification
    const { data: notif, error: notifErr } = await supabase
      .from("notifications")
      .insert({
        user_id,
        type,
        title,
        body: body || null,
        link: link || null,
        channel: "in_app",
        reference_id: reference_id || null,
        reference_type: reference_type || null,
      })
      .select()
      .single();

    if (notifErr) {
      console.error("Error creating notification:", notifErr);
      return NextResponse.json(
        { error: "Failed to create notification" },
        { status: 500 }
      );
    }

    // ── Auto-deliver via push + WhatsApp based on preferences ──
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    // Check if user wants this notification type
    const wantsNotification = prefs ? shouldNotify(type, prefs) : true;

    // Check quiet hours
    const quiet = prefs
      ? isInQuietHours(
          prefs.quiet_hours_start,
          prefs.quiet_hours_end,
          prefs.timezone || "UTC"
        )
      : false;

    if (wantsNotification && !quiet) {
      // Send Web Push (to all user's devices)
      try {
        const pushSent = await sendPushToUser(user_id, {
          title,
          body: body || undefined,
          link: link || undefined,
          id: notif.id,
        }, supabase);
        if (pushSent > 0) {
          await supabase
            .from("notifications")
            .update({
              channel: "push",
              delivered_at: new Date().toISOString(),
            })
            .eq("id", notif.id);
        }
      } catch (pushErr) {
        console.error("Push delivery failed:", pushErr);
      }

      // Send WhatsApp for urgent (P1) tasks — check user profile phone or preferences phone
      if (priority === 1) {
        // Look up phone from user profile first, fall back to preferences
        const { data: assigneeUser } = await supabase
          .from("users")
          .select("phone")
          .eq("id", user_id)
          .maybeSingle();
        const phone = assigneeUser?.phone || prefs?.whatsapp_number;

        if (phone) {
          const whatsappMessage = `📋 TaskBoard: ${title}${body ? `\n${body}` : ""}`;
          try {
            const waRes = await fetch(
              `${req.nextUrl.origin}/api/notifications/whatsapp`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Webhook-Secret": process.env.WEBHOOK_SECRET || "",
                },
                body: JSON.stringify({
                  to: phone,
                  message: whatsappMessage,
                }),
              }
            );

            if (waRes.ok) {
              // Only mark as whatsapp-delivered if Twilio accepted it
              if (notif.channel === "in_app") {
                await supabase
                  .from("notifications")
                  .update({
                    channel: "whatsapp",
                    delivered_at: new Date().toISOString(),
                  })
                  .eq("id", notif.id);
              }
            } else {
              const waError = await waRes.json().catch(() => ({}));
              console.error("WhatsApp API error:", waRes.status, waError);
            }
          } catch (whatsappErr) {
            console.error("WhatsApp delivery failed:", whatsappErr);
          }
        }
      }
    }

    return NextResponse.json({ success: true, notification: notif });
  } catch (error) {
    console.error("Notification send error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
