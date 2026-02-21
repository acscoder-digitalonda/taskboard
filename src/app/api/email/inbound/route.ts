import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyWebhookSecret } from "@/lib/api-auth";

// L3: Team name from env for auto-reply signatures
const TEAM_NAME = process.env.NEXT_PUBLIC_TEAM_NAME || "Our Team";

/**
 * POST /api/email/inbound
 *
 * Webhook for inbound emails (recipient configured via GMAIL_SEND_AS).
 * Compatible with SendGrid Inbound Parse, Mailgun, or Postmark.
 *
 * Stores the email as a message in the appropriate project channel,
 * logs it for the Comms Hub, and auto-creates a draft reply.
 *
 * Body (JSON):
 *   from: string          — sender email
 *   to: string            — recipient (configured via GMAIL_SEND_AS)
 *   subject: string       — email subject
 *   text: string          — plain text body
 *   html?: string         — HTML body (optional)
 *   project_id?: string   — link to project (auto-detect from subject/sender)
 *   gmail_thread_id?: string — Gmail thread ID for threading
 *   gmail_message_id?: string — Gmail message ID for In-Reply-To
 *   attachments?: Array<{ filename: string, content_type: string, size: number, url: string }>
 *
 * Also supports multipart/form-data from SendGrid Inbound Parse.
 */
export async function POST(req: NextRequest) {
  try {
    // C2: Verify webhook secret for inbound email
    if (!verifyWebhookSecret(req)) {
      return NextResponse.json(
        { error: "Invalid webhook secret" },
        { status: 403 }
      );
    }

    const supabase = createServerSupabase();
    let from: string;
    let to: string;
    let subject: string;
    let textBody: string;
    let htmlBody: string | null = null;
    let projectId: string | null = null;
    let gmailThreadId: string | null = null;
    let gmailMessageId: string | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      from = body.from || "";
      to = body.to || "";
      subject = body.subject || "(no subject)";
      textBody = body.text || body.plain || "";
      htmlBody = body.html || null;
      projectId = body.project_id || null;
      gmailThreadId = body.gmail_thread_id || null;
      gmailMessageId = body.gmail_message_id || null;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      from = (formData.get("from") as string) || "";
      to = (formData.get("to") as string) || "";
      subject = (formData.get("subject") as string) || "(no subject)";
      textBody = (formData.get("text") as string) || "";
      htmlBody = (formData.get("html") as string) || null;
    } else {
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

    // ── Project matching ───────────────────────────────────
    // 1. Check projects.client_emails array (most reliable)
    if (!projectId) {
      const { data: projectMatch } = await supabase
        .from("projects")
        .select("id")
        .contains("client_emails", [senderEmail])
        .limit(1)
        .single();

      if (projectMatch) {
        projectId = projectMatch.id;
      }
    }

    // 2. Fall back to task client field
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

    // 3. Try matching by domain (e.g. client@acme.com → project with acme.com emails)
    if (!projectId) {
      const domain = senderEmail.split("@")[1];
      if (domain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"].includes(domain)) {
        const { data: domainProjects } = await supabase
          .from("projects")
          .select("id, client_emails");

        if (domainProjects) {
          for (const p of domainProjects) {
            const emails = (p.client_emails as string[]) || [];
            if (emails.some((e: string) => e.endsWith(`@${domain}`))) {
              projectId = p.id;
              break;
            }
          }
        }
      }
    }

    // ── Find or create email channel ────────────────────────
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
      } else {
        // Auto-create an email channel for the project
        const { data: projectData } = await supabase
          .from("projects")
          .select("name")
          .eq("id", projectId)
          .single();

        const channelName = projectData
          ? `${projectData.name} – Email`
          : "Email Thread";

        const { data: newChannel } = await supabase
          .from("channels")
          .insert({
            name: channelName,
            type: "public",
            project_id: projectId,
            description: `Inbound/outbound emails for this project`,
          })
          .select()
          .single();

        if (newChannel) {
          channelId = newChannel.id;

          // Add all team members to the channel
          const { data: teamUsers } = await supabase
            .from("users")
            .select("id")
            .limit(20);

          if (teamUsers?.length) {
            await supabase.from("channel_members").insert(
              teamUsers.map((u) => ({
                channel_id: newChannel.id,
                user_id: u.id,
                role: "member",
              }))
            );
          }
        }
      }
    }

    // ── Store email as channel message ─────────────────────
    const emailContent = [
      `📧 **Email from ${senderName}**`,
      `**Subject:** ${subject}`,
      "",
      textBody.slice(0, 2000),
    ].join("\n");

    let messageId: string | null = null;

    if (channelId) {
      const { data: msgData } = await supabase
        .from("messages")
        .insert({
          channel_id: channelId,
          sender_id: null,
          body: emailContent,
          is_system: false,
          is_ai: false,
          metadata: {
            type: "email_received",
            source_email: senderEmail,
            from_name: senderName,
            email_subject: subject,
            to,
            gmail_thread_id: gmailThreadId,
            gmail_message_id: gmailMessageId,
          },
        })
        .select("id")
        .single();

      messageId = msgData?.id || null;

      await supabase
        .from("channels")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", channelId);
    }

    // ── Auto-create draft reply ───────────────────────────
    // Creates a placeholder draft that Katie can review and edit
    let draftId: string | null = null;

    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const replyBody = [
      `Hi ${senderName.split(" ")[0]},`,
      "",
      "Thank you for your email. I'll review this and get back to you shortly.",
      "",
      "Best regards,",
      TEAM_NAME,
    ].join("\n");

    const { data: draftData } = await supabase
      .from("email_drafts")
      .insert({
        channel_id: channelId,
        project_id: projectId,
        to_email: senderEmail,
        to_name: senderName !== senderEmail ? senderName : null,
        subject: replySubject,
        body_text: replyBody,
        in_reply_to_message_id: messageId,
        gmail_thread_id: gmailThreadId,
        gmail_message_id: gmailMessageId,
        status: "draft",
        generated_by: "ai",
      })
      .select("id")
      .single();

    draftId = draftData?.id || null;

    // ── Log to agent_activity ─────────────────────────────
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
        gmail_thread_id: gmailThreadId,
        gmail_message_id: gmailMessageId,
        draft_id: draftId,
        auto_draft_created: !!draftId,
      },
    });

    // ── Notify team ───────────────────────────────────────
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
      message_id: messageId,
      draft_id: draftId,
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
