import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyApiKey, forbiddenResponse } from "@/lib/api-auth";

/**
 * GET /api/v1/tasks
 *
 * Query tasks with optional filters for reports.
 *
 * Auth: X-API-Key header
 *
 * Query params (all optional):
 *   status       — backlog | doing | waiting | done
 *   assignee_id  — UUID of assigned user
 *   project_id   — UUID of project
 *   due_before   — ISO date string (tasks due before this date)
 *   due_after    — ISO date string (tasks due after this date)
 *   created_after — ISO date string (tasks created after this date)
 *   limit        — max results (default 50, max 200)
 *   offset       — pagination offset (default 0)
 *
 * Response: { tasks: [...], total, limit, offset }
 */
export async function GET(req: NextRequest) {
  try {
    if (!verifyApiKey(req)) {
      return forbiddenResponse();
    }

    const supabase = createServerSupabase();
    const { searchParams } = new URL(req.url);

    // Parse query params
    const status = searchParams.get("status");
    const assigneeId = searchParams.get("assignee_id");
    const projectId = searchParams.get("project_id");
    const dueBefore = searchParams.get("due_before");
    const dueAfter = searchParams.get("due_after");
    const createdAfter = searchParams.get("created_after");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build query with filters
    let query = supabase
      .from("tasks")
      .select("*", { count: "exact" });

    if (status) query = query.eq("status", status);
    if (assigneeId) query = query.eq("assignee_id", assigneeId);
    if (projectId) query = query.eq("project_id", projectId);
    if (dueBefore) query = query.lte("due_at", dueBefore);
    if (dueAfter) query = query.gte("due_at", dueAfter);
    if (createdAfter) query = query.gte("created_at", createdAfter);

    query = query
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: taskRows, error, count } = await query;

    if (error) {
      console.error("Error fetching tasks:", error);
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 500 }
      );
    }

    // Fetch users and projects for enrichment
    const [usersResult, projectsResult] = await Promise.all([
      supabase.from("users").select("id, name"),
      supabase.from("projects").select("id, name"),
    ]);

    const userMap = new Map(
      (usersResult.data || []).map((u) => [u.id, u.name])
    );
    const projectMap = new Map(
      (projectsResult.data || []).map((p) => [p.id, p.name])
    );

    // Enrich tasks with user/project names
    const tasks = (taskRows || []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee_id: t.assignee_id,
      assignee_name: userMap.get(t.assignee_id) || null,
      project_id: t.project_id,
      project_name: t.project_id ? projectMap.get(t.project_id) || null : null,
      due_at: t.due_at,
      client: t.client || null,
      created_via: t.created_via,
      created_by_id: t.created_by_id,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));

    return NextResponse.json({
      tasks,
      total: count ?? tasks.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Tasks API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
