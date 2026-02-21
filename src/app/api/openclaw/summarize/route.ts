import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  verifyWebhookSecret,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * POST /api/openclaw/summarize
 * OpenClaw generates and stores a summary of a channel, project, or task.
 * This avoids needing infinite context — you summarize periodically.
 *
 * Body: {
 *   source_type: 'channel' | 'project' | 'task' | 'email_thread',
 *   source_id: string,
 *   summary: string,
 *   key_points?: string[],
 *   message_range_start?: string,
 *   message_range_end?: string,
 *   message_count?: number,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifyWebhookSecret(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const supabase = createServerSupabase();
    const payload = await req.json();
    const {
      source_type,
      source_id,
      summary,
      key_points,
      message_range_start,
      message_range_end,
      message_count,
    } = payload;

    if (!source_type || !source_id || !summary) {
      return NextResponse.json(
        { error: "Missing source_type, source_id, or summary" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("summaries")
      .insert({
        source_type,
        source_id,
        summary,
        key_points: key_points || [],
        message_range_start: message_range_start || null,
        message_range_end: message_range_end || null,
        message_count: message_count || null,
        generated_by: "openclaw",
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving summary:", error);
      return NextResponse.json(
        { error: "Failed to save summary" },
        { status: 500 }
      );
    }

    // Log activity
    await supabase.from("agent_activity").insert({
      agent_name: "openclaw",
      action: "summary_generated",
      description: `Generated ${source_type} summary for ${source_id}`,
      metadata: { summary_id: data.id, source_type, source_id },
    });

    return NextResponse.json({ success: true, summary: data });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/openclaw/summarize?source_type=channel&source_id=xxx
 * Fetch summaries for a given source.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    const isWebhook = verifyWebhookSecret(req);
    if (!userId && !isWebhook) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const { searchParams } = new URL(req.url);
    const sourceType = searchParams.get("source_type");
    const sourceId = searchParams.get("source_id");

    if (!sourceType || !sourceId) {
      return NextResponse.json(
        { error: "Missing source_type or source_id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Error fetching summaries:", error);
      return NextResponse.json(
        { error: "Failed to fetch summaries" },
        { status: 500 }
      );
    }

    return NextResponse.json({ summaries: data || [] });
  } catch (error) {
    console.error("Summary fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
