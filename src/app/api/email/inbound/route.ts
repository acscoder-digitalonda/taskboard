import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/email/inbound
 *
 * Webhook for inbound emails to team@digitalonda.com.
 * Compatible with SendGrid Inbound Parse, Mailgun, or Postmark.
 *
 * Stores the email as a message in the appropriate project channel
 * and logs it for the Comms Hub. No AI processing — just capture and store.
 *
 * Body (JSON):
 *   from: string          — sender email
 *   to: string            — recipient (team@digitalonda.com)
 *   subject: string       — email subject
 *   text: string          — plain text body
 *   html?: string         — HTML body (optional)
 *   project_id?: string   — link to project (auto-detect from subject/sender)
 *   attachments?: Array<{ filename: string, content_type: string, size: number, url: string }>
 *
 * Also supports multipart/form-data from SendGrid Inbound Parse:
 *   Fields: from, to, subject, text, html, envelope, attachments
 */
export async function POST(req: NextRequest) {
  try {
    let from: string;
    let to: string;
    let subject: string;
    let textBody: string;
    let htmlBody: string | null = null;
    let projectId: string | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      from = body.from || "";
      to = body.to || "";
      subject = body.subject || "(no subject)";
      textBody = body.text || body.plain || "";
      htmlBody = body.html || null;
      projectId = body.project_id || null;
    } else if (contentType.includes("multipart/form-data")) {
      // SendGrid Inbound Parse format
      const formData = await req.formData();
      from = (formData.get("from") as string) || "";
      to = (formData.get("to") as string) || "";
      subject = (formData.get("subject") as string) || "(no subject)";
      textBody = (formData.get("text") as string) || "";
      htmlBody = (formData.get("html") as string) || null;
    } else {
      // Try JSON fallback
      const body = await req.json().catch(() => ({}));
      from = body.from || "";
      to = body.to || "";
      subject = body.subject || "(no subject)";
      textBody = body.text || "";
    }

    if (!from) {
      return NextResponse.json({ error: "Missing from field" }, { status: 400 });
    }

    // Extract email address from "Name <email>" format
    const emailMatch = from.match(/<(.+?)>/) || [null, from];
    const senderEmail = emailMatch[1] || from;
    const senderName = from.replace(/<.*>/, "").trim() || senderEmail;

    // Auto-detect project from existing tasks/contacts
    if (!projectId) {
      const { data: matchingTasks } = await supabase
        .from("tasks")
        .select("project_id")
        .eq("client", senderEmail)
        .not("project_id", "is", null)
        .limit(1)
        .single();

      if (matchingTasks?.project_id) {
        projectId = matchingTasks.project_id;
      }
    }

    // Find or create an email channel for this project/sender
    let channelId: string | null = null;

    if (projectId) {
      // Look for existing email channel for this project
      const { data: existingChannel } = await supabase
        .from("channels")
        .select("id")
        .eq("project_id", projectId)
        .eq("type", "public")
        .ilike("name", `%email%`)
        .limit(1)
        .single();

      if (existingChannel) {
        channelId = existingChannel.id;
      }
    }

    // Store email as a message
    const emailContent = [
      `📧 **Email from ${senderName}**`,
      `**Subject:** ${subject}`,
      "",
      textBody.slice(0, 2000), // Limit body length
    ].join("\n");

    if (channelId) {
      await supabase.from("messages").insert({
        channel_id: channelId,
        sender_id: null,
        body: emailContent,
        is_system: false,
        is_ai: false,
        metadata: {
          type: "email",
          from: senderEmail,
          from_name: senderName,
          subject,
          to,
        },
      });

      // Update channel timestamp
      await supabase
        .from("channels")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", channelId);
    }

    // Log to agent_activity for Comms Hub display
    await supabase.from("agent_activity").insert({
      agent_name: "email-inbound",
      action: "email_ingested",
      description: `Email from ${senderName}: "${subject}"`,
      source_email: senderEmail,
      project_id: projectId,
      channel_id: channelId,
      metadata: {
        email_subject: subject,
        source_email: senderEmail,
        from_name: senderName,
        to,
        body_preview: textBody.slice(0, 200),
      },
    });

    // Notify all team members about the incoming email
    const { data: teamUsers } = await supabase
      .from("users")
      .select("id")
      .limit(20);

    if (teamUsers) {
      const notifications = teamUsers.map((u) => ({
        user_id: u.id,
        type: "email_ingested" as const,
        title: `Email from ${senderName}`,
        body: subject,
        link: channelId ? `/messages/${channelId}` : null,
        channel: "in_app" as const,
        reference_id: channelId,
        reference_type: channelId ? "channel" : null,
      }));

      await supabase.from("notifications").insert(notifications);
    }

    return NextResponse.json({
      success: true,
      channel_id: channelId,
      project_id: projectId,
    });
  } catch (error) {
    console.error("Email inbound error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET handler for webhook verification
export async function GET() {
  return NextResponse.json({ status: "ok", service: "taskboard-email-inbound" });
}
