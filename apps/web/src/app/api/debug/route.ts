import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * GET /api/debug
 * Returns diagnostic information about users and their roles.
 * Useful for verifying that smart task assignment has the data it needs.
 *
 * Usage: Open taskboard.digitalonda.com/api/debug in the browser while logged in.
 * Or: curl -H "Authorization: Bearer <token>" https://taskboard.digitalonda.com/api/debug
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const supabase = createServerSupabase();

    // Fetch all users with role and description
    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, role, description")
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build the same team roster that gets sent to the AI parser
    const teamRoster = (users || []).map((u) => {
      let entry = `- ${u.name} (id: ${u.id}, role: ${u.role || "member"})`;
      if (u.description) entry += ` — ${u.description}`;
      return entry;
    });

    const issues: string[] = [];
    const usersWithMemberRole = (users || []).filter(
      (u) => !u.role || u.role === "member"
    );
    const usersWithoutDescription = (users || []).filter(
      (u) => !u.description
    );

    if (usersWithMemberRole.length > 0) {
      issues.push(
        `⚠️ ${usersWithMemberRole.length} user(s) have role="member" (default). ` +
          `Smart assignment can't distinguish them. Set roles like: development, design, strategy, pm, content_writer. ` +
          `Users: ${usersWithMemberRole.map((u) => u.name).join(", ")}`
      );
    }

    if (usersWithoutDescription.length > 0) {
      issues.push(
        `⚠️ ${usersWithoutDescription.length} user(s) have no description. ` +
          `Descriptions help the AI match tasks more accurately. ` +
          `Users: ${usersWithoutDescription.map((u) => u.name).join(", ")}`
      );
    }

    if (issues.length === 0) {
      issues.push("✅ All users have roles and descriptions — smart assignment should work!");
    }

    return NextResponse.json({
      diagnostic: "Smart Task Assignment - User Roles",
      current_user_id: userId,
      total_users: users?.length || 0,
      users: users || [],
      team_roster_sent_to_ai: teamRoster,
      issues,
      fix_instructions:
        "To fix, update user roles in Supabase Dashboard → Table Editor → users. " +
        "Set 'role' to one of: development, design, strategy, pm, content_writer. " +
        "Set 'description' to a brief summary of what they do.",
    });
  } catch (error) {
    console.error("GET /api/debug error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
