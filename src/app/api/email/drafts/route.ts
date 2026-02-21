import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/email/drafts — Create a new email draft
 *
 * Body: {
 *   channel_id?: string,
 *   project_id?: string,
 *   to_email: string,
 *   to_name?: string,
 *   subject: string,
 *   body_text: string,
 *   body_html?: string,
 *   in_reply_to_message_id?: string,
 *   gmail_thread_id?: string,
 *   gmail_message_id?: string,
 *   generated_by?: 'ai' | 'manual',
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      channel_id,
      project_id,
      to_email,
      to_name,
      subject,
      body_text,
      body_html,
      in_reply_to_message_id,
      gmail_thread_id,
      gmail_message_id,
      generated_by = "manual",
    } = body;

    if (!to_email || !subject || !body_text) {
      return NextResponse.json(
        { error: "Missing required fields: to_email, subject, body_text" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("email_drafts")
      .insert({
        channel_id: channel_id || null,
        project_id: project_id || null,
        to_email,
        to_name: to_name || null,
        subject,
        body_text,
        body_html: body_html || null,
        in_reply_to_message_id: in_reply_to_message_id || null,
        gmail_thread_id: gmail_thread_id || null,
        gmail_message_id: gmail_message_id || null,
        generated_by,
        status: "draft",
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Error creating draft:", error);
      return NextResponse.json(
        { error: "Failed to create draft" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, draft: data });
  } catch (error) {
    console.error("Draft creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/email/drafts — List drafts
 *
 * Query params:
 *   channel_id?: string
 *   project_id?: string
 *   status?: 'draft' | 'approved' | 'sent' | 'failed'
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channel_id");
    const projectId = searchParams.get("project_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("email_drafts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (channelId) query = query.eq("channel_id", channelId);
    if (projectId) query = query.eq("project_id", projectId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching drafts:", error);
      return NextResponse.json(
        { error: "Failed to fetch drafts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ drafts: data || [] });
  } catch (error) {
    console.error("Draft fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
