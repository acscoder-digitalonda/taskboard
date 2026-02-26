import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Create a Supabase client authenticated with the user's JWT.
 * This satisfies RLS policies that check `auth.uid() = user_id`
 * without requiring the service role key.
 */
function createUserSupabase(req: NextRequest) {
  const token = req.headers.get("authorization")?.slice(7) || "";
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * POST /api/notifications/subscribe
 * Register a Web Push subscription for the authenticated user.
 *
 * Body: { endpoint: string, p256dh: string, auth: string }
 *
 * Uses the user's own JWT to authenticate with Supabase so RLS
 * policy `auth.uid() = user_id` is satisfied.
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

    const supabase = createUserSupabase(req);

    // Upsert by endpoint — same browser re-subscribing updates the record
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { user_id: userId, endpoint, p256dh, auth },
        { onConflict: "endpoint" }
      );

    if (error) {
      console.error("Failed to save push subscription:", error.message, error.code, error.details);
      return NextResponse.json(
        { error: `Failed to save subscription: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`[Push Subscribe] Saved subscription for user ${userId}, endpoint: ${endpoint.substring(0, 60)}...`);
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

    const supabase = createUserSupabase(req);

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
