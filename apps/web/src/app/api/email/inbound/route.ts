import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyWebhookSecret } from "@/lib/api-auth";
import { triageEmail, TriageResult } from "@/app/api/email/triage/route";
import { appendToDecisionLog } from "@/lib/context";
import {
  uploadFileFromUrl,
  linkFilesToTask,
  formatFileSize,
} from "@/lib/files-server";

// L3: Team name from env for auto-reply signatures
const TEAM_NAME = process.env.NEXT_PUBLIC_TEAM_NAME || "Our Team";

interface EmailAttachment {
  filename: string;
  content_type: string;
  size: number;
  url: string;
}

/**
 * POST /api/email/inbound
 *
 * Webhook for inbound emails (recipient configured via GMAIL_SEND_AS).
 * Compatible with SendGrid Inbound Parse, Mailgun, or Postmark.
 *
 * Flow:
 * 1. Parse email fields
 * 2. Match to project (client_emails → task client → domain)
 * 3. Find or create email channel
 * 4. Store email as channel message
 * 5. Process attachments → upload to Storage + link to channel/project
 * 6. AI Triage → classify, route, create task, write context-aware draft
 * 7. Update project decision_log with triage result
 * 8. Notify PM (Katie) + assignee
 *
 * Falls back to generic draft if triage fails.
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
    let attachments: EmailAttachment[] = [];

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
      attachments = body.attachments || [];
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      from = (formData.get("from") as string) || "";
      to = (formData.get("to") as string) || "";
      subject = (formData.get("subject") as string) || "(no subject)";
      textBody = (formData.get("text") as string) || "";
      htmlBody = (formData.get("html") as string) || null;
      // SendGrid sends attachments as attachment-info JSON
      const attachInfo = formData.get("attachment-info") as string;
      if (attachInfo) {
        try {
          const parsed = JSON.parse(attachInfo);
          attachments = Object.values(parsed) as EmailAttachment[];
        } catch {
          // Ignore parse errors for attachment info
        }
      }
    } else {
      const body = await req.json().catch(() => ({}));
      from = body.from || "";
      to = body.to || "";
      subject = body.subject || "(no subject)";
      textBody = body.text || "";
      attachments = body.attachments || [];
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

    // Get project name for triage
    let projectName: string | null = null;
    if (projectId) {
      const { data: proj } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();
      projectName = proj?.name || null;
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
        const channelName = projectName
          ? `${projectName} – Email`
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
    const attachmentSummary = attachments.length
      ? `\n\n${attachments.map((a) => `📎 ${a.filename} (${formatFileSize(a.size)})`).join("\n")}`
      : "";

    const emailContent = [
      `📧 **Email from ${senderName}**`,
      `**Subject:** ${subject}`,
      "",
      textBody.slice(0, 2000),
      attachmentSummary,
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
            attachment_count: attachments.length,
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

    // ── Process email attachments ──────────────────────────
    const uploadedFileIds: string[] = [];
    const attachmentNames: string[] = [];

    for (const attachment of attachments) {
      if (!attachment.url) continue;

      attachmentNames.push(attachment.filename);

      const uploaded = await uploadFileFromUrl(attachment.url, {
        fileName: attachment.filename,
        mimeType: attachment.content_type,
        sizeBytes: attachment.size,
        projectId: projectId || undefined,
        channelId: channelId || undefined,
        messageId: messageId || undefined,
      });

      if (uploaded) {
        uploadedFileIds.push(uploaded.id);
      }
    }

    // ── AI Triage (if we have a project and the API key is configured) ──
    let triageResult: TriageResult | null = null;
    let taskId: string | null = null;
    let draftId: string | null = null;

    const triageEnabled = !!process.env.TASKBOARD_ANTHROPIC_KEY;

    if (triageEnabled && channelId) {
      try {
        triageResult = await triageEmail({
          fromEmail: senderEmail,
          fromName: senderName,
          subject,
          body: textBody,
          projectId,
          projectName,
          attachmentNames: attachmentNames.length ? attachmentNames : undefined,
        });
      } catch (triageError) {
        console.error("Triage failed, falling back to generic draft:", triageError);
        // triageResult stays null → falls through to generic draft below
      }
    }

    if (triageResult && channelId) {
      // ── Create context-aware draft reply ─────────────────
      const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

      const { data: draftData } = await supabase
        .from("email_drafts")
        .insert({
          channel_id: channelId,
          project_id: projectId,
          to_email: senderEmail,
          to_name: senderName !== senderEmail ? senderName : null,
          subject: replySubject,
          body_text: triageResult.draft_reply,
          in_reply_to_message_id: messageId,
          gmail_thread_id: gmailThreadId,
          gmail_message_id: gmailMessageId,
          status: "draft",
          generated_by: "ai",
          triage_category: triageResult.category,
          triage_reasoning: triageResult.reasoning,
          triage_confidence: triageResult.confidence,
        })
        .select("id")
        .single();

      draftId = draftData?.id || null;

      // ── Create task assigned to correct team member ──────
      // Find a user with the matching role
      const { data: assignee } = await supabase
        .from("users")
        .select("id, name")
        .eq("role", triageResult.assignee_role)
        .limit(1)
        .single();

      // Fall back to PM if no user with that role
      const { data: pmUser } = !assignee
        ? await supabase
            .from("users")
            .select("id, name")
            .eq("role", "pm")
            .limit(1)
            .single()
        : { data: null };

      const taskAssignee = assignee || pmUser;

      if (taskAssignee) {
        const { data: taskData } = await supabase
          .from("tasks")
          .insert({
            title: triageResult.task_title,
            client: senderEmail,
            assignee_id: taskAssignee.id,
            project_id: projectId,
            status: "backlog",
            priority: triageResult.task_priority || 3,
            created_by_id: taskAssignee.id,
            created_via: "email",
            drive_links: [],
            notes: [],
            sort_order: 0,
            email_draft_id: draftId,
            source_email_id: gmailMessageId || messageId,
          })
          .select("id")
          .single();

        taskId = taskData?.id || null;

        // Insert task sections from triage
        if (taskId && triageResult.task_sections?.length) {
          const sectionInserts = triageResult.task_sections.map((s, i) => ({
            task_id: taskId!,
            heading: s.heading,
            content: s.content,
            sort_order: i,
          }));
          await supabase.from("task_sections").insert(sectionInserts);
        }

        // Link draft ↔ task
        if (taskId && draftId) {
          await supabase
            .from("email_drafts")
            .update({ linked_task_id: taskId })
            .eq("id", draftId);
        }

        // Link email attachments to the new task
        if (taskId && uploadedFileIds.length) {
          await linkFilesToTask(uploadedFileIds, taskId);
        }
      }

      // ── Update project decision log ──────────────────────
      if (projectId) {
        const attachmentNote = attachmentNames.length
          ? ` — ${attachmentNames.length} attachment(s): ${attachmentNames.join(", ")}`
          : "";
        const assigneeName = taskAssignee?.name || triageResult.assignee_role;

        await appendToDecisionLog(
          supabase,
          projectId,
          `Email from ${senderName} re: "${subject}"${attachmentNote} — classified as ${triageResult.category}, assigned to ${assigneeName} (confidence: ${triageResult.confidence})`
        );
      }
    } else if (channelId) {
      // ── Fallback: generic draft reply (no triage) ────────
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
    }

    // ── Log to agent_activity ─────────────────────────────
    await supabase.from("agent_activity").insert({
      agent_name: "email-inbound",
      action: triageResult ? "email_triaged" : "email_ingested",
      description: triageResult
        ? `Email from ${senderName}: "${subject}" → ${triageResult.category} (${triageResult.confidence})`
        : `Email from ${senderName}: "${subject}"`,
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
        task_id: taskId,
        triage_category: triageResult?.category || null,
        triage_confidence: triageResult?.confidence || null,
        attachment_count: attachments.length,
        uploaded_file_ids: uploadedFileIds,
      },
    });

    // ── Notify PM (email_triage) + assignee (task_assigned) ──
    if (triageResult && taskId) {
      // Notify PM(s) about the triage
      const { data: pmUsers } = await supabase
        .from("users")
        .select("id")
        .eq("role", "pm");

      // Send notifications via /api/notifications/send for push + WhatsApp delivery
      const sendNotification = async (payload: Record<string, unknown>) => {
        try {
          await fetch(`${req.nextUrl.origin}/api/notifications/send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Secret": process.env.WEBHOOK_SECRET || "",
            },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          console.error("Notification send failed:", err);
        }
      };

      if (pmUsers?.length) {
        await Promise.allSettled(
          pmUsers.map((u) =>
            sendNotification({
              user_id: u.id,
              type: "email_triage",
              title: `New email triaged: ${triageResult!.category}`,
              body: `${senderName}: "${subject}" — review draft reply`,
              link: channelId ? `/messages/${channelId}` : null,
              reference_id: draftId,
              reference_type: "email_draft",
            })
          )
        );
      }

      // Notify the assignee about the task
      const { data: assignee } = await supabase
        .from("users")
        .select("id")
        .eq("role", triageResult.assignee_role)
        .limit(1)
        .single();

      if (assignee) {
        await sendNotification({
          user_id: assignee.id,
          type: "task_assigned",
          title: `New task: ${triageResult.task_title}`,
          body: `From email: ${senderName} — ${subject}`,
          link: `/tasks/${taskId}`,
          reference_id: taskId,
          reference_type: "task",
        });
      }
    } else {
      // Fallback: notify all team members (old behavior)
      const { data: teamUsers } = await supabase
        .from("users")
        .select("id")
        .limit(20);

      if (teamUsers) {
        const sendNotification = async (payload: Record<string, unknown>) => {
          try {
            await fetch(`${req.nextUrl.origin}/api/notifications/send`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Webhook-Secret": process.env.WEBHOOK_SECRET || "",
              },
              body: JSON.stringify(payload),
            });
          } catch (err) {
            console.error("Notification send failed:", err);
          }
        };

        await Promise.allSettled(
          teamUsers.map((u) =>
            sendNotification({
              user_id: u.id,
              type: "email_ingested",
              title: `Email from ${senderName}`,
              body: subject,
              link: channelId ? `/messages/${channelId}` : null,
              reference_id: channelId,
              reference_type: channelId ? "channel" : null,
            })
          )
        );
      }
    }

    return NextResponse.json({
      success: true,
      channel_id: channelId,
      project_id: projectId,
      message_id: messageId,
      draft_id: draftId,
      task_id: taskId,
      triage: triageResult
        ? {
            category: triageResult.category,
            assignee_role: triageResult.assignee_role,
            confidence: triageResult.confidence,
          }
        : null,
      attachments_uploaded: uploadedFileIds.length,
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
