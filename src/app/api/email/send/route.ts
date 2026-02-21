import { NextRequest, NextResponse } from "next/server";
import { sendEmail, isGmailConfigured, getSendAsEmail } from "@/lib/gmail";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";

// L11: Rate limit email sends to 10 per minute
const limiter = rateLimit({ windowMs: 60_000, max: 10 });

/**
 * POST /api/email/send — Send a draft via Gmail API
 *
 * Body: {
 *   draft_id: string,
 *   sent_by: string,    // user ID who clicked Send
 * }
 *
 * Flow:
 * 1. Load draft from DB (must be 'draft' or 'approved')
 * 2. Send via Gmail API (service account impersonating GMAIL_SEND_AS address)
 * 3. Update draft status to 'sent' with gmail_id
 * 4. Log outbound message to channel (if linked)
 * 5. Log to agent_activity for audit
 */
export async function POST(req: NextRequest) {
  try {
    const limited = limiter.check(req);
    if (limited) return limited;

    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const body = await req.json();
    const { draft_id, sent_by } = body;

    if (!draft_id || !sent_by) {
      return NextResponse.json(
        { error: "Missing required fields: draft_id, sent_by" },
        { status: 400 }
      );
    }

    // 1. Load the draft
    const { data: draft, error: fetchError } = await supabase
      .from("email_drafts")
      .select("*")
      .eq("id", draft_id)
      .single();

    if (fetchError || !draft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      );
    }

    if (draft.status === "sent") {
      return NextResponse.json(
        { error: "Draft has already been sent" },
        { status: 400 }
      );
    }

    if (draft.status === "failed") {
      // Allow re-sending failed drafts
    }

    // 2. Check Gmail is configured
    if (!isGmailConfigured()) {
      // Mark as failed with helpful error
      await supabase
        .from("email_drafts")
        .update({
          status: "failed",
          error_message: "Gmail not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON env var.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft_id);

      return NextResponse.json(
        { error: "Gmail is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON environment variable." },
        { status: 503 }
      );
    }

    // 3. Send via Gmail API
    let gmailResult: { messageId: string; threadId: string };
    try {
      gmailResult = await sendEmail({
        to: draft.to_email,
        toName: draft.to_name || undefined,
        subject: draft.subject,
        bodyText: draft.body_text,
        bodyHtml: draft.body_html || undefined,
        threadId: draft.gmail_thread_id || undefined,
        inReplyTo: draft.gmail_message_id || undefined,
        references: draft.gmail_message_id || undefined,
      });
    } catch (sendError) {
      const errorMsg = sendError instanceof Error ? sendError.message : "Unknown Gmail error";
      console.error("Gmail send error:", sendError);

      // Mark draft as failed
      await supabase
        .from("email_drafts")
        .update({
          status: "failed",
          error_message: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft_id);

      return NextResponse.json(
        { error: `Gmail send failed: ${errorMsg}` },
        { status: 502 }
      );
    }

    // 4. Mark draft as sent
    const now = new Date().toISOString();
    await supabase
      .from("email_drafts")
      .update({
        status: "sent",
        sent_at: now,
        sent_gmail_id: gmailResult.messageId,
        gmail_thread_id: gmailResult.threadId || draft.gmail_thread_id,
        edited_by: sent_by,
        error_message: null,
        updated_at: now,
      })
      .eq("id", draft_id);

    // 5. Log outbound message to channel (if linked)
    if (draft.channel_id) {
      await supabase.from("messages").insert({
        channel_id: draft.channel_id,
        sender_id: sent_by,
        body: `📤 Email sent to ${draft.to_name || draft.to_email}\n\n**Subject:** ${draft.subject}\n\n${draft.body_text}`,
        is_system: false,
        is_ai: false,
        metadata: {
          type: "email_sent",
          draft_id: draft.id,
          gmail_message_id: gmailResult.messageId,
          gmail_thread_id: gmailResult.threadId,
          to_email: draft.to_email,
          to_name: draft.to_name,
          subject: draft.subject,
          sent_as: getSendAsEmail(),
        },
      });
    }

    // 6. Log to agent_activity for audit trail
    await supabase.from("agent_activity").insert({
      agent_name: "email_sender",
      action: "email_sent",
      description: `Email sent to ${draft.to_email}: "${draft.subject}"`,
      source_email: getSendAsEmail(),
      task_id: null,
      project_id: draft.project_id,
      channel_id: draft.channel_id,
      metadata: {
        draft_id: draft.id,
        to_email: draft.to_email,
        to_name: draft.to_name,
        subject: draft.subject,
        gmail_message_id: gmailResult.messageId,
        gmail_thread_id: gmailResult.threadId,
        sent_by,
        sent_as: getSendAsEmail(),
      },
    });

    return NextResponse.json({
      success: true,
      messageId: gmailResult.messageId,
      threadId: gmailResult.threadId,
    });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
