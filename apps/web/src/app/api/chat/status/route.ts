import { NextResponse } from "next/server";

/**
 * GET /api/chat/status
 * Quick check whether the Anthropic API key is configured.
 * No auth required — only reveals a boolean, no secrets.
 */
export async function GET() {
  const hasKey = !!process.env.TASKBOARD_ANTHROPIC_KEY;
  return NextResponse.json({ ai_available: hasKey });
}
