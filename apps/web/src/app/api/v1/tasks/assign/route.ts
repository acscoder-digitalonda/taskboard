import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyApiKey, forbiddenResponse } from "@/lib/api-auth";
import { parseTaskWithLLM } from "@/lib/task-parser";

/**
 * POST /api/v1/tasks/assign
 *
 * Accept natural language text, use Claude to parse it into a structured
 * task, then create the task in the database.
 *
 * Auth: X-API-Key header
 *
 * Request body: { text: string }
 *
 * Response: { success: true, task: { ... } }
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifyApiKey(req)) {
      return forbiddenResponse();
    }

    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "\"text\" field is required and must be a string." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // Fetch users and projects for LLM context
    const [usersResult, projectsResult] = await Promise.all([
      supabase.from("users").select("id, name").neq("role", "agent"),
      supabase.from("projects").select("id, name"),
    ]);

    const users = (usersResult.data || []).map((u) => ({
      id: u.id,
      name: u.name,
    }));

    const projects = (projectsResult.data || []).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    // Parse natural language with Claude
    const parsed = await parseTaskWithLLM(text, users, projects);

    // Determine created_by_id — use the first non-agent user as the API creator
    // (In the future this could be a dedicated API system user)
    let createdById = users[0]?.id;
    if (!createdById) {
      // Fallback: try to get any user
      const { data: anyUser } = await supabase
        .from("users")
        .select("id")
        .limit(1)
        .single();
      createdById = anyUser?.id || "system";
    }

    // If no assignee was parsed, default to the first user
    const assigneeId = parsed.assignee_id || users[0]?.id || createdById;

    // Insert the task
    const { data: task, error: insertError } = await supabase
      .from("tasks")
      .insert({
        title: parsed.title,
        assignee_id: assigneeId,
        project_id: parsed.project_id || null,
        status: parsed.status || "doing",
        priority: parsed.priority || 3,
        due_at: parsed.due_at || null,
        created_by_id: createdById,
        created_via: "openclaw",
        drive_links: [],
        notes: [],
        sort_order: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating task:", insertError);
      return NextResponse.json(
        { error: "Failed to create task: " + insertError.message },
        { status: 500 }
      );
    }

    // Notify the assignee
    if (task.assignee_id) {
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
            body: "Created via external API",
            link: `/tasks/${task.id}`,
            reference_id: task.id,
            reference_type: "task",
            priority: task.priority,
          }),
        });
      } catch (notifErr) {
        console.error("Failed to send task assignment notification:", notifErr);
      }
    }

    // Look up names for the response
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        assignee_id: task.assignee_id,
        assignee_name: userMap.get(task.assignee_id) || null,
        project_id: task.project_id,
        project_name: task.project_id
          ? projectMap.get(task.project_id) || null
          : null,
        status: task.status,
        priority: task.priority,
        due_at: task.due_at,
        confidence: parsed.confidence,
        created_via: task.created_via,
        created_at: task.created_at,
      },
    });
  } catch (error) {
    console.error("Task assign API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
