import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyApiKey, forbiddenResponse } from "@/lib/api-auth";

/**
 * GET /api/v1/projects
 *
 * List all projects with id, name, and color.
 * External tools use this to know which project IDs are valid
 * when creating tasks via POST /api/v1/tasks.
 *
 * Auth: X-API-Key header
 *
 * Response: { projects: [{ id, name, color }] }
 */
export async function GET(req: NextRequest) {
  try {
    if (!verifyApiKey(req)) {
      return forbiddenResponse();
    }

    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("projects")
      .select("id, name, color")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching projects:", error);
      return NextResponse.json(
        { error: "Failed to fetch projects" },
        { status: 500 }
      );
    }

    const projects = (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
    }));

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Projects API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
