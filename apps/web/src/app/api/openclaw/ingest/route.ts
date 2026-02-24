import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyWebhookSecret } from "@/lib/api-auth";

/**
 * POST /api/openclaw/ingest
 * OpenClaw calls this endpoint after processing a client email.
 * It creates tasks, sends notifications, and logs agent activity.
 *
 * Body: {
 *   source_email: string,            // who the email was from
 *   email_subject: string,
 *   email_body: string,
 *   tasks: Array<{
 *     title: string,
 *     assignee_id: string,
 *     project_id?: string,
 *     priority?: number,
 *     due_at?: string,
 *     sections?: Array<{ heading: string, content: string }>,
 *     notes?: string[],
 *   }>,
 *   summary?: string,                // AI summary of the email
 *   channel_id?: string,             // post summary to this channel
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
      source_email,
      email_subject,
      email_body,
      tasks: taskInputs,
      summary,
      channel_id,
    } = payload;

    if (!source_email || !taskInputs?.length) {
      return NextResponse.json(
        { error: "Missing source_email or tasks array" },
        { status: 400 }
      );
    }

    const createdTasks: string[] = [];
    const notifiedUsers = new Set<string>();

    // L12: Hoist user query outside the loop (was querying per task)
    const { data: firstUser } = await supabase
      .from("users")
      .select("id")
      .limit(1)
      .single();

    const createdById = firstUser?.id;
    if (!createdById) {
      return NextResponse.json(
        { error: "No users found in the system" },
        { status: 500 }
      );
    }

    // Create each task
    for (const taskInput of taskInputs) {

      const { data: task, error: taskErr } = await supabase
        .from("tasks")
        .insert({
          title: taskInput.title,
          assignee_id: taskInput.assignee_id,
          project_id: taskInput.project_id || null,
          priority: taskInput.priority || 3,
          due_at: taskInput.due_at || null,
          status: "backlog",
          created_by_id: createdById,
          created_via: "openclaw",
          notes: taskInput.notes || [],
          client: source_email,
        })
        .select()
        .single();

      if (taskErr || !task) {
        console.error("Error creating task:", taskErr);
        continue;
      }

      createdTasks.push(task.id);

      // Create sections if provided
      if (taskInput.sections?.length) {
        const sectionInserts = taskInput.sections.map(
          (s: { heading: string; content: string }, i: number) => ({
            task_id: task.id,
            heading: s.heading,
            content: s.content,
            sort_order: i,
          })
        );
        await supabase.from("task_sections").insert(sectionInserts);
      }

      // Notify the assignee
      if (taskInput.assignee_id && !notifiedUsers.has(taskInput.assignee_id)) {
        await fetch(`${req.nextUrl.origin}/api/notifications/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": process.env.WEBHOOK_SECRET || "",
          },
          body: JSON.stringify({
            user_id: taskInput.assignee_id,
            type: "task_assigned",
            title: `New task from ${source_email}`,
            body: taskInput.title,
            link: `/tasks/${task.id}`,
            reference_id: task.id,
            reference_type: "task",
            priority: taskInput.priority || undefined,
          }),
        });
        notifiedUsers.add(taskInput.assignee_id);
      }
    }

    // Post summary to channel if specified
    if (summary && channel_id) {
      await supabase.from("messages").insert({
        channel_id,
        sender_id: null,
        body: `📧 **Email from ${source_email}**\n\n${summary}\n\n_${createdTasks.length} task(s) created._`,
        is_system: false,
        is_ai: true,
      });
    }

    // Log agent activity
    await supabase.from("agent_activity").insert({
      agent_name: "openclaw",
      action: "email_ingested",
      description: `Processed email from ${source_email}: "${email_subject}". Created ${createdTasks.length} task(s).`,
      source_email,
      metadata: {
        email_subject,
        task_ids: createdTasks,
        summary: summary || null,
      },
    });

    return NextResponse.json({
      success: true,
      tasks_created: createdTasks.length,
      task_ids: createdTasks,
    });
  } catch (error) {
    console.error("OpenClaw ingest error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
