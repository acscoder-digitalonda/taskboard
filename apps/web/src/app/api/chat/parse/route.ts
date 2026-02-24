import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { parseTasksWithLLM } from "@/lib/task-parser";

export async function POST(req: NextRequest) {
  // Auth check (same pattern as email/drafts/route.ts)
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return unauthorizedResponse();

  const { message, users, projects } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const batch = await parseTasksWithLLM(
      message,
      users || [],
      projects || []
    );

    return NextResponse.json({
      success: true,
      parsed: batch.tasks,
      confidence: batch.confidence,
    });
  } catch (error) {
    console.error("Claude API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "AI parsing failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
