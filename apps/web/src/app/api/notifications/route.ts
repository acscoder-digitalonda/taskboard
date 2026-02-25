import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * GET /api/notifications
 * Fetch the authenticated user's notifications.
 * Uses service_role key to bypass RLS — the client-side supabase's custom
 * auth workarounds (buildAuthFetch, no-op lock) don't reliably authenticate
 * Postgrest queries, so we route through the server.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching notifications:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    return NextResponse.json({ notifications: data || [] });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications
 * Mark notification(s) as read.
 *
 * Body:
 *   { notification_id: string }       — mark a single notification as read
 *   { mark_all: true }                — mark ALL unread notifications as read
 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const { notification_id, mark_all } = await req.json();
    const supabase = createServerSupabase();
    const now = new Date().toISOString();

    if (mark_all) {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("user_id", userId)
        .is("read_at", null);

      if (error) {
        console.error("Error marking all as read:", error);
        return NextResponse.json(
          { error: "Failed to mark all as read" },
          { status: 500 }
        );
      }
    } else if (notification_id) {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("id", notification_id)
        .eq("user_id", userId);

      if (error) {
        console.error("Error marking notification as read:", error);
        return NextResponse.json(
          { error: "Failed to mark as read" },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Provide notification_id or mark_all: true" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
