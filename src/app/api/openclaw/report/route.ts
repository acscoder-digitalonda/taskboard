import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  verifyWebhookSecret,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * POST /api/openclaw/report
 * OpenClaw reports what it's doing — visible on the board.
 *
 * Body: {
 *   action: string,           // 'task_created', 'task_updated', 'email_read', etc.
 *   description: string,      // human-readable description
 *   task_id?: string,
 *   project_id?: string,
 *   channel_id?: string,
 *   metadata?: Record<string, unknown>,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifyWebhookSecret(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const supabase = createServerSupabase();
    const { action, description, task_id, project_id, channel_id, metadata } =
      await req.json();

    if (!action || !description) {
      return NextResponse.json(
        { error: "Missing action or description" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("agent_activity")
      .insert({
        agent_name: "openclaw",
        action,
        description,
        task_id: task_id || null,
        project_id: project_id || null,
        channel_id: channel_id || null,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error("Error logging agent activity:", error);
      return NextResponse.json(
        { error: "Failed to log activity" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, activity: data });
  } catch (error) {
    console.error("OpenClaw report error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/openclaw/report
 * Fetch recent agent activity.
 */
export async function GET(req: NextRequest) {
  try {
    // Allow user auth OR webhook secret for reading reports
    const userId = await getAuthenticatedUserId(req);
    const isWebhook = verifyWebhookSecret(req);
    if (!userId && !isWebhook) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const projectId = searchParams.get("project_id");

    let query = supabase
      .from("agent_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching agent activity:", error);
      return NextResponse.json(
        { error: "Failed to fetch activity" },
        { status: 500 }
      );
    }

    return NextResponse.json({ activities: data || [] });
  } catch (error) {
    console.error("OpenClaw report fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
