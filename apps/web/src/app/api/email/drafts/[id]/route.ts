import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * PATCH /api/email/drafts/[id] — Edit a draft
 *
 * Requires: Authorization: Bearer <access_token>
 *
 * Body: {
 *   body_text?: string,
 *   body_html?: string,
 *   subject?: string,
 *   to_email?: string,
 *   to_name?: string,
 *   status?: 'draft' | 'approved',
 * }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const { id } = await params;
    const body = await req.json();

    // Only allow updating certain fields
    const allowedFields = [
      "body_text",
      "body_html",
      "subject",
      "to_email",
      "to_name",
      "status",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Validate required fields aren't set to empty
    if (
      (updates.body_text !== undefined && !String(updates.body_text).trim()) ||
      (updates.subject !== undefined && !String(updates.subject).trim()) ||
      (updates.to_email !== undefined && !String(updates.to_email).trim())
    ) {
      return NextResponse.json(
        { error: "body_text, subject, and to_email cannot be empty" },
        { status: 400 }
      );
    }

    // H7: Validate email format if to_email is being updated
    if (updates.to_email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(updates.to_email))) {
        return NextResponse.json(
          { error: "Invalid email format for to_email" },
          { status: 400 }
        );
      }
    }

    // Don't allow editing sent drafts
    const { data: existing } = await supabase
      .from("email_drafts")
      .select("status")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (existing.status === "sent") {
      return NextResponse.json(
        { error: "Cannot edit a sent draft" },
        { status: 400 }
      );
    }

    // Always set edited_by server-side (not from client input)
    updates.edited_by = userId;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("email_drafts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Error updating draft:", error);
      return NextResponse.json(
        { error: "Failed to update draft" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, draft: data });
  } catch (error) {
    console.error("Draft update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email/drafts/[id] — Discard a draft
 *
 * Requires: Authorization: Bearer <access_token>
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const supabase = createServerSupabase();
    const { id } = await params;

    // Don't allow deleting sent drafts
    const { data: existing } = await supabase
      .from("email_drafts")
      .select("status")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (existing.status === "sent") {
      return NextResponse.json(
        { error: "Cannot delete a sent draft" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("email_drafts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting draft:", error);
      return NextResponse.json(
        { error: "Failed to delete draft" },
        { status: 500 }
      );
    }

    console.info(`[Audit] Draft ${id} deleted by user ${userId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Draft delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
