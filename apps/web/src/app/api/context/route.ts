import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * GET /api/context?project_id=X
 *
 * Fetch all context docs for a project.
 * Optionally filter by doc_type.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    const docType = searchParams.get("doc_type");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required parameter: project_id" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("project_context")
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });

    if (docType) {
      query = query.eq("doc_type", docType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching context docs:", error);
      return NextResponse.json(
        { error: "Failed to fetch context docs" },
        { status: 500 }
      );
    }

    return NextResponse.json({ docs: data || [] });
  } catch (error) {
    console.error("Context fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/context
 *
 * Create a new context doc.
 *
 * Body: {
 *   project_id: string,
 *   doc_type: string,
 *   title: string,
 *   content?: string,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const body = await req.json();
    const { project_id, doc_type, title, content } = body;

    if (!project_id || !doc_type || !title) {
      return NextResponse.json(
        { error: "Missing required fields: project_id, doc_type, title" },
        { status: 400 }
      );
    }

    const validTypes = [
      "strategy_brief",
      "brand_guidelines",
      "decision_log",
      "client_preferences",
      "meeting_notes",
      "agent_config",
    ];

    if (!validTypes.includes(doc_type)) {
      return NextResponse.json(
        { error: `Invalid doc_type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("project_context")
      .insert({
        project_id,
        doc_type,
        title,
        content: content || "",
        updated_by: userId,
        version: 1,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Error creating context doc:", error);
      return NextResponse.json(
        { error: "Failed to create context doc" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, doc: data });
  } catch (error) {
    console.error("Context creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
