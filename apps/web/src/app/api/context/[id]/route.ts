import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * PATCH /api/context/[id]
 *
 * Update a context doc's content, title, or doc_type.
 * Automatically bumps version number.
 *
 * Body: {
 *   content?: string,
 *   title?: string,
 *   append?: string,   // append text to existing content (alternative to full replace)
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

    // Fetch existing doc
    const { data: existing } = await supabase
      .from("project_context")
      .select("id, content, version")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Context doc not found" },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_by: userId,
      updated_at: new Date().toISOString(),
      version: existing.version + 1,
    };

    if (body.title !== undefined) {
      updates.title = body.title;
    }

    // Support append mode: add text to existing content
    if (body.append !== undefined) {
      updates.content = existing.content
        ? `${existing.content}\n${body.append}`
        : body.append;
    } else if (body.content !== undefined) {
      updates.content = body.content;
    }

    if (Object.keys(updates).length === 3) {
      // Only meta fields, no actual content change
      return NextResponse.json(
        { error: "No valid fields to update (provide content, title, or append)" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("project_context")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Error updating context doc:", error);
      return NextResponse.json(
        { error: "Failed to update context doc" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, doc: data });
  } catch (error) {
    console.error("Context update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/context/[id]
 *
 * Remove a context doc.
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

    const { data: existing } = await supabase
      .from("project_context")
      .select("id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Context doc not found" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("project_context")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting context doc:", error);
      return NextResponse.json(
        { error: "Failed to delete context doc" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Context delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
