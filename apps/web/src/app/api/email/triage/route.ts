import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  createServerSupabase,
  getAuthenticatedUserId,
  verifyWebhookSecret,
} from "@/lib/api-auth";
import { getProjectContext } from "@/lib/context";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ windowMs: 60_000, max: 5 });

const anthropic = new Anthropic({
  apiKey: process.env.TASKBOARD_ANTHROPIC_KEY,
});

export interface TriageResult {
  category: string;
  assignee_role: string;
  task_title: string;
  task_priority: number;
  task_sections: Array<{ heading: string; content: string }>;
  draft_reply: string;
  reasoning: string;
  confidence: number;
}

/**
 * Shared triage function — used by the route handler and by the inbound webhook.
 */
export async function triageEmail(options: {
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  projectId: string | null;
  projectName: string | null;
  attachmentNames?: string[];
}): Promise<TriageResult> {
  const supabase = createServerSupabase();
  const today = new Date().toISOString().split("T")[0];
  const teamName = process.env.NEXT_PUBLIC_TEAM_NAME || "Our Team";

  // Fetch team roster with roles
  const { data: teamUsers } = await supabase
    .from("users")
    .select("id, name, role")
    .order("name");

  const teamRoster = (teamUsers || [])
    .map((u) => `- ${u.name} (${u.role || "member"})`)
    .join("\n");

  // Fetch project context if we have a project
  let contextBlock = "";
  if (options.projectId) {
    contextBlock = await getProjectContext(supabase, options.projectId);
  }

  const attachmentInfo = options.attachmentNames?.length
    ? `\nAttachments: ${options.attachmentNames.join(", ")}`
    : "";

  const systemPrompt = `You are an intelligent email triage agent for ${teamName}, a creative agency.
Your job is to classify incoming client emails, route them to the right team member,
create a structured task, and draft a context-aware reply.

Today is ${today}.

## Team Roster
${teamRoster}

## Role Routing Rules
- "design" → visual/brand/UI/UX/graphics/illustration/layout work
- "strategy" → planning/positioning/messaging/research/competitive analysis/content strategy
- "development" → code/engineering/bugs/features/deployment/API/database
- "pm" → scheduling/budgets/timelines/coordination/general inquiries
- "agent" → automated/repetitive tasks, data processing, report generation

${contextBlock ? `## Project Context\n${contextBlock}\n` : ""}

## Email Being Triaged
From: ${options.fromName} <${options.fromEmail}>
Subject: ${options.subject}
${attachmentInfo}

Body:
${options.body.slice(0, 3000)}

## Instructions
Classify this email and return ONLY valid JSON (no markdown, no backticks):
{
  "category": "design" | "strategy" | "development" | "pm" | "general",
  "assignee_role": "design" | "strategy" | "development" | "pm" | "agent",
  "task_title": "concise actionable task title",
  "task_priority": 1-4 (1=urgent, 2=high, 3=normal, 4=low),
  "task_sections": [
    { "heading": "Goal", "content": "what needs to be accomplished" },
    { "heading": "Deliverables", "content": "expected outputs" },
    { "heading": "Context", "content": "relevant background from client history" }
  ],
  "draft_reply": "professional reply to the client acknowledging their request, mentioning specific details from their email and from your knowledge of the project. Sign off as ${teamName}.",
  "reasoning": "brief explanation of why you classified and routed this way",
  "confidence": 0.0-1.0
}

Rules:
- Use project context to write informed, specific replies — not generic templates
- Reference past decisions, preferences, or brand guidelines when relevant
- The draft reply should feel personal and knowledgeable, not boilerplate
- task_sections should have 2-4 sections, always including "Goal"
- Priority 1 only for true emergencies; most client requests are 2-3
- If the email is unclear, set confidence < 0.7 and route to "pm" for manual review`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Triage this email from ${options.fromName} about: "${options.subject}"`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse triage AI response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as TriageResult;

  // Validate required fields
  if (!parsed.category || !parsed.task_title || !parsed.draft_reply) {
    throw new Error("Triage result missing required fields");
  }

  return parsed;
}

/**
 * POST /api/email/triage
 *
 * AI-powered email classification and routing.
 * Accepts Bearer token OR webhook secret (for internal calls from inbound webhook).
 *
 * Body: {
 *   from_email: string,
 *   from_name: string,
 *   subject: string,
 *   body: string,
 *   project_id?: string,
 *   project_name?: string,
 *   attachment_names?: string[],
 * }
 */
export async function POST(req: NextRequest) {
  const limited = limiter.check(req);
  if (limited) return limited;

  try {
    // Accept either Bearer token or webhook secret
    const userId = await getAuthenticatedUserId(req);
    const webhookValid = verifyWebhookSecret(req);

    if (!userId && !webhookValid) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      from_email,
      from_name,
      subject,
      body: emailBody,
      project_id,
      project_name,
      attachment_names,
    } = body;

    if (!from_email || !subject) {
      return NextResponse.json(
        { error: "Missing required fields: from_email, subject" },
        { status: 400 }
      );
    }

    const result = await triageEmail({
      fromEmail: from_email,
      fromName: from_name || from_email,
      subject,
      body: emailBody || "",
      projectId: project_id || null,
      projectName: project_name || null,
      attachmentNames: attachment_names,
    });

    return NextResponse.json({ success: true, triage: result });
  } catch (error) {
    console.error("Triage error:", error);
    const message =
      error instanceof Error ? error.message : "Triage failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
