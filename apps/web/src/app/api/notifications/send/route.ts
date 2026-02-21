import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  verifyWebhookSecret,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * POST /api/notifications/send
 * Creates an in-app notification and optionally sends WhatsApp.
 *
 * Body: {
 *   user_id: string,
 *   type: NotificationType,
 *   title: string,
 *   body?: string,
 *   link?: string,
 *   reference_id?: string,
 *   reference_type?: string,
 *   send_whatsapp?: boolean,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // Accept either user session auth OR webhook secret (for internal service calls)
    const userId = await getAuthenticatedUserId(req);
    const isWebhook = verifyWebhookSecret(req);
    if (!userId && !isWebhook) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const payload = await req.json();
    const {
      user_id,
      type,
      title,
      body,
      link,
      reference_id,
      reference_type,
      send_whatsapp,
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

    // Optionally send WhatsApp
    if (send_whatsapp) {
      // Fetch user preferences for WhatsApp number
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("whatsapp_number, whatsapp_enabled")
        .eq("user_id", user_id)
        .single();

      if (prefs?.whatsapp_enabled && prefs?.whatsapp_number) {
        // Call our WhatsApp endpoint
        const whatsappMessage = `📋 TaskBoard: ${title}${body ? `\n${body}` : ""}`;
        try {
          await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL ? req.nextUrl.origin : "http://localhost:3000"}/api/notifications/whatsapp`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: prefs.whatsapp_number,
                message: whatsappMessage,
              }),
            }
          );

          // Update notification as delivered
          await supabase
            .from("notifications")
            .update({
              channel: "whatsapp",
              delivered_at: new Date().toISOString(),
            })
            .eq("id", notif.id);
        } catch (whatsappErr) {
          console.error("WhatsApp delivery failed:", whatsappErr);
          // Don't fail the whole request — in-app notif was still created
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
