import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, verifyApiKey, forbiddenResponse } from "@/lib/api-auth";

/**
 * GET /api/v1/members
 *
 * List all team members with full profile info.
 * External tools use this to know who can be assigned tasks.
 *
 * Auth: X-API-Key header
 *
 * Response: { members: [...] }
 */
export async function GET(req: NextRequest) {
  try {
    if (!verifyApiKey(req)) {
      return forbiddenResponse();
    }

    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, description, avatar_url, color, initials")
      .neq("role", "agent") // Exclude bot/agent users
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching members:", error);
      return NextResponse.json(
        { error: "Failed to fetch members" },
        { status: 500 }
      );
    }

    const members = (data || []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email || null,
      role: u.role || "member",
      description: u.description || null,
      avatar_url: u.avatar_url || null,
      color: u.color,
      initials: u.initials,
    }));

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Members API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
