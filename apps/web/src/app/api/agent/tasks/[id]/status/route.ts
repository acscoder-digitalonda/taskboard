import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyWebhookSecret } from "@/lib/api-auth";
import { appendToDecisionLog } from "@/lib/context";

/**
 * PATCH /api/agent/tasks/[id]/status
 *
 * Agent reports task progress or completion.
 *
 * - Updates task status
 * - Adds a task_update entry (visible in task timeline)
 * - Auto-appends outcome to project's decision_log
 * - Triggers PM notification via Postgres trigger on status change
 *
 * Auth: webhook secret
 *
 * Body: {
 *   status: "doing" | "waiting" | "done",
 *   update_body: string,     // Progress update text
 *   deliverables?: string[], // Links to deliverables (for "done" status)
 * }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyWebhookSecret(req)) {
      return NextResponse.json(
        { error: "Invalid webhook secret" },
        { status: 403 }
      );
    }

    const supabase = createServerSupabase();
    const { id } = await params;
    const body = await req.json();
    const { status, update_body, deliverables } = body;

    if (!status || !update_body) {
      return NextResponse.json(
        { error: "Missing required fields: status, update_body" },
        { status: 400 }
      );
    }

    const validStatuses = ["doing", "waiting", "done", "backlog"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch the task
    const { data: task } = await supabase
      .from("tasks")
      .select("id, title, status, project_id, assignee_id")
      .eq("id", id)
      .single();

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Update task status
    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating task status:", updateError);
      return NextResponse.json(
        { error: "Failed to update task status" },
        { status: 500 }
      );
    }

    // Add deliverables as drive links if provided
    if (deliverables?.length) {
      const { data: currentTask } = await supabase
        .from("tasks")
        .select("drive_links")
        .eq("id", id)
        .single();

      const existingLinks = currentTask?.drive_links || [];
      const newLinks = [...existingLinks, ...deliverables];

      await supabase
        .from("tasks")
        .update({ drive_links: newLinks })
        .eq("id", id);
    }

    // Add task update entry
    const { error: insertError } = await supabase
      .from("task_updates")
      .insert({
        task_id: id,
        author_id: task.assignee_id,
        source: "bot",
        body: update_body,
        status_signal: status === "done" ? "done" : status === "waiting" ? "blocked" : "on_track",
      });

    if (insertError) {
      console.error("Error inserting task update:", insertError);
    }

    // Log to agent_activity
    await supabase.from("agent_activity").insert({
      agent_name: "onda-robot",
      action: `task_${status}`,
      description: `${task.title} → ${status}: ${update_body.slice(0, 200)}`,
      task_id: id,
      project_id: task.project_id,
      metadata: {
        task_title: task.title,
        old_status: task.status,
        new_status: status,
        deliverables: deliverables || [],
      },
    });

    // Update project decision log
    if (task.project_id) {
      const statusLabel = status === "done" ? "completed" : `moved to ${status}`;
      const deliverableNote = deliverables?.length
        ? ` — deliverables: ${deliverables.join(", ")}`
        : "";

      await appendToDecisionLog(
        supabase,
        task.project_id,
        `Task "${task.title}" ${statusLabel} by ONDA-Robot: ${update_body.slice(0, 200)}${deliverableNote}`
      );
    }

    return NextResponse.json({
      success: true,
      task_id: id,
      new_status: status,
    });
  } catch (error) {
    console.error("Agent task status update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
