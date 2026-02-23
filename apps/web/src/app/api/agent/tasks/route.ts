import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyWebhookSecret } from "@/lib/api-auth";
import { getProjectContext, getOrCreateContextDoc } from "@/lib/context";

/**
 * GET /api/agent/tasks
 *
 * ONDA-Robot polls for tasks assigned to the "agent" role user
 * with status = 'doing' (ready to work on).
 *
 * Returns tasks with their project context (agent_config doc)
 * so the agent knows how to work on each project.
 *
 * Auth: webhook secret
 *
 * Query params:
 *   status?: string — filter by status (default: "doing")
 *   limit?: number — max tasks to return (default: 10)
 */
export async function GET(req: NextRequest) {
  try {
    if (!verifyWebhookSecret(req)) {
      return NextResponse.json(
        { error: "Invalid webhook secret" },
        { status: 403 }
      );
    }

    const supabase = createServerSupabase();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "doing";
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Find the agent user
    const { data: agentUser } = await supabase
      .from("users")
      .select("id")
      .eq("role", "agent")
      .limit(1)
      .single();

    if (!agentUser) {
      return NextResponse.json({ tasks: [], message: "No agent user found" });
    }

    // Fetch tasks assigned to the agent
    const { data: taskRows, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("assignee_id", agentUser.id)
      .eq("status", status)
      .order("priority", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("Error fetching agent tasks:", error);
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 500 }
      );
    }

    // Enrich each task with project context + agent config
    const enrichedTasks = await Promise.all(
      (taskRows || []).map(async (task) => {
        let agentConfig = "";
        let projectContext = "";

        if (task.project_id) {
          // Get agent_config doc for this project
          const configDoc = await getOrCreateContextDoc(
            supabase,
            task.project_id,
            "agent_config",
            "Agent Configuration"
          );
          agentConfig = configDoc.content;

          // Get full project context
          projectContext = await getProjectContext(supabase, task.project_id);
        }

        // Get task sections
        const { data: sections } = await supabase
          .from("task_sections")
          .select("heading, content")
          .eq("task_id", task.id)
          .order("sort_order", { ascending: true });

        return {
          id: task.id,
          title: task.title,
          client: task.client,
          status: task.status,
          priority: task.priority,
          project_id: task.project_id,
          email_draft_id: task.email_draft_id,
          source_email_id: task.source_email_id,
          sections: sections || [],
          agent_config: agentConfig,
          project_context: projectContext,
          created_at: task.created_at,
        };
      })
    );

    return NextResponse.json({ tasks: enrichedTasks });
  } catch (error) {
    console.error("Agent tasks fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
