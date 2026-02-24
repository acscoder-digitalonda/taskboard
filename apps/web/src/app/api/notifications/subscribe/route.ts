import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * POST /api/notifications/subscribe
 * Register a Web Push subscription for the authenticated user.
 *
 * Body: { endpoint: string, p256dh: string, auth: string }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const { endpoint, p256dh, auth } = await req.json();
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Missing required fields: endpoint, p256dh, auth" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // Upsert by endpoint — same browser re-subscribing updates the record
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { user_id: userId, endpoint, p256dh, auth },
        { onConflict: "endpoint" }
      );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return NextResponse.json(
        { error: "Failed to save subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Subscribe error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/subscribe
 * Remove a push subscription for the authenticated user.
 *
 * Body: { endpoint: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json(
        { error: "Missing required field: endpoint" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
