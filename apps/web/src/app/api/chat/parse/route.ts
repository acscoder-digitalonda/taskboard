import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { parseTasksWithLLM, parseTasksBasic } from "@/lib/task-parser";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  const limited = limiter.check(req);
  if (limited) return limited;

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
      parser: "ai",
    });
  } catch (error) {
    // LLM failed — fall back to basic regex parsing instead of returning 500
    console.error("LLM parse failed, using basic parser:", error);

    const batch = parseTasksBasic(
      message,
      users || [],
      projects || []
    );

    return NextResponse.json({
      success: true,
      parsed: batch.tasks,
      confidence: batch.confidence,
      parser: "basic",
    });
  }
}
