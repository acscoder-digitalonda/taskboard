import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyApiKey, forbiddenResponse } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";

const postLimiter = rateLimit({ windowMs: 60_000, max: 20 });

const VALID_STATUSES = ["backlog", "doing", "waiting", "done"] as const;
const MAX_TASKS_PER_REQUEST = 20;

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

/**
 * POST /api/v1/tasks
 *
 * Create tasks from structured JSON (no LLM parsing).
 *
 * Auth: X-API-Key header
 *
 * Request body:
 *   {
 *     "tasks": [
 *       {
 *         "title": "Design landing page",        // required
 *         "assignee_id": "uuid",                  // optional, must exist in users
 *         "project_id": "uuid",                   // optional, must exist in projects
 *         "status": "doing",                      // optional, default "doing"
 *         "priority": 2,                          // optional, 1-4, default 3
 *         "due_at": "2026-03-15",                 // optional, ISO date
 *         "notes": ["note text"],                 // optional
 *         "drive_links": ["https://..."],         // optional
 *         "client": "Client Name"                 // optional
 *       }
 *     ]
 *   }
 *
 * Response: { success: true, created: [...], count: N }
 */
export async function POST(req: NextRequest) {
  const limited = postLimiter.check(req);
  if (limited) return limited;

  try {
    if (!verifyApiKey(req)) {
      return forbiddenResponse();
    }

    const body = await req.json();
    const { tasks: taskInputs } = body as { tasks?: unknown[] };

    // ── Validate top-level structure ────────────────────────────
    if (!Array.isArray(taskInputs) || taskInputs.length === 0) {
      return NextResponse.json(
        { error: "\"tasks\" must be a non-empty array." },
        { status: 400 }
      );
    }
    if (taskInputs.length > MAX_TASKS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_TASKS_PER_REQUEST} tasks per request.` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // Fetch valid users and projects for validation & enrichment
    const [usersResult, projectsResult] = await Promise.all([
      supabase.from("users").select("id, name"),
      supabase.from("projects").select("id, name"),
    ]);

    const userMap = new Map(
      (usersResult.data || []).map((u: { id: string; name: string }) => [u.id, u.name])
    );
    const projectMap = new Map(
      (projectsResult.data || []).map((p: { id: string; name: string }) => [p.id, p.name])
    );

    // Default created_by_id: first user in the system
    const defaultUserId = usersResult.data?.[0]?.id;
    if (!defaultUserId) {
      return NextResponse.json(
        { error: "No users found in the system." },
        { status: 500 }
      );
    }

    // ── Validate each task ──────────────────────────────────────
    const errors: string[] = [];
    const validated: Array<{
      title: string;
      assignee_id: string;
      project_id: string | null;
      status: string;
      priority: number;
      due_at: string | null;
      notes: string[];
      drive_links: string[];
      client: string | null;
    }> = [];

    for (let i = 0; i < taskInputs.length; i++) {
      const t = taskInputs[i] as Record<string, unknown>;
      const prefix = `tasks[${i}]`;

      // title — required
      if (!t.title || typeof t.title !== "string" || t.title.trim().length === 0) {
        errors.push(`${prefix}.title is required and must be a non-empty string.`);
        continue;
      }

      // assignee_id — optional, must exist
      let assigneeId = defaultUserId;
      if (t.assignee_id) {
        if (typeof t.assignee_id !== "string" || !userMap.has(t.assignee_id)) {
          errors.push(`${prefix}.assignee_id "${t.assignee_id}" does not match any user.`);
          continue;
        }
        assigneeId = t.assignee_id;
      }

      // project_id — optional, must exist
      let projectId: string | null = null;
      if (t.project_id) {
        if (typeof t.project_id !== "string" || !projectMap.has(t.project_id)) {
          errors.push(`${prefix}.project_id "${t.project_id}" does not match any project.`);
          continue;
        }
        projectId = t.project_id;
      }

      // status — optional, default "doing"
      const status = (typeof t.status === "string" && VALID_STATUSES.includes(t.status as typeof VALID_STATUSES[number]))
        ? t.status
        : "doing";

      // priority — optional, default 3, clamped 1-4
      let priority = 3;
      if (typeof t.priority === "number") {
        priority = Math.max(1, Math.min(4, Math.round(t.priority)));
      }

      // due_at — optional, must be valid ISO date
      let dueAt: string | null = null;
      if (t.due_at) {
        if (typeof t.due_at !== "string" || isNaN(Date.parse(t.due_at))) {
          errors.push(`${prefix}.due_at must be a valid ISO date string.`);
          continue;
        }
        dueAt = t.due_at;
      }

      // notes — optional string array
      const notes: string[] = Array.isArray(t.notes)
        ? t.notes.filter((n): n is string => typeof n === "string")
        : [];

      // drive_links — optional string array
      const driveLinks: string[] = Array.isArray(t.drive_links)
        ? t.drive_links.filter((l): l is string => typeof l === "string")
        : [];

      // client — optional string
      const client = typeof t.client === "string" ? t.client : null;

      validated.push({
        title: t.title.trim(),
        assignee_id: assigneeId,
        project_id: projectId,
        status,
        priority,
        due_at: dueAt,
        notes,
        drive_links: driveLinks,
        client,
      });
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed.", details: errors },
        { status: 400 }
      );
    }

    // ── Create task group if batch ──────────────────────────────
    let groupId: string | null = null;
    if (validated.length > 1) {
      const titles = validated.map((t) => t.title).join(", ");
      const { data: groupData, error: groupError } = await supabase
        .from("task_groups")
        .insert({
          original_input: `API batch: ${titles}`.slice(0, 500),
          created_by_id: defaultUserId,
          created_via: "api",
          task_count: validated.length,
        })
        .select()
        .single();

      if (groupError) {
        console.error("Error creating task group:", groupError);
        // Non-fatal: continue without group
      } else {
        groupId = groupData.id;
      }
    }

    // ── Insert tasks ────────────────────────────────────────────
    const inserts = validated.map((t) => ({
      title: t.title,
      assignee_id: t.assignee_id,
      project_id: t.project_id,
      status: t.status,
      priority: t.priority,
      due_at: t.due_at,
      created_by_id: defaultUserId,
      created_via: "api" as const,
      drive_links: t.drive_links,
      notes: t.notes,
      client: t.client,
      sort_order: 0,
      group_id: groupId,
    }));

    const { data: createdRows, error: insertError } = await supabase
      .from("tasks")
      .insert(inserts)
      .select();

    if (insertError) {
      console.error("Error inserting tasks:", insertError);
      return NextResponse.json(
        { error: "Failed to insert tasks: " + insertError.message },
        { status: 500 }
      );
    }

    // ── Send notifications ──────────────────────────────────────
    for (const task of createdRows || []) {
      if (!task.assignee_id) continue;
      try {
        await fetch(`${req.nextUrl.origin}/api/notifications/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": process.env.WEBHOOK_SECRET || "",
          },
          body: JSON.stringify({
            user_id: task.assignee_id,
            type: "task_assigned",
            title: `New task: ${task.title}`,
            body: "Created via API",
            link: `/tasks/${task.id}`,
            reference_id: task.id,
            reference_type: "task",
            priority: task.priority,
          }),
        });
      } catch (notifErr) {
        console.error("Failed to send notification for task:", task.id, notifErr);
      }
    }

    // ── Build response ──────────────────────────────────────────
    const created = (createdRows || []).map((t) => ({
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
      group_id: t.group_id || null,
      created_at: t.created_at,
    }));

    return NextResponse.json({
      success: true,
      created,
      count: created.length,
    });
  } catch (error) {
    console.error("Tasks POST API error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
