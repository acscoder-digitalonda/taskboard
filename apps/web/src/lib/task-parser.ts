import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.TASKBOARD_ANTHROPIC_KEY,
});

export interface ParsedTask {
  title: string;
  assignee_id: string | null;
  project_id: string | null;
  due_at: string | null;
  priority: number;
  status: "backlog" | "doing" | "waiting" | "done";
  confidence: number;
}

/**
 * Parse natural language text into structured task data using Claude Sonnet.
 *
 * Shared by:
 *   - POST /api/chat/parse  (in-app chat task creation)
 *   - POST /api/v1/tasks/assign  (external API task creation)
 */
export async function parseTaskWithLLM(
  text: string,
  users: { id: string; name: string }[],
  projects: { id: string; name: string }[]
): Promise<ParsedTask> {
  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const systemPrompt = `You are a task parser for a project management app called TaskBoard.
Given a natural language message, extract structured task data.

Today is ${dayOfWeek}, ${today}.

Available team members:
${JSON.stringify(users.map((u) => ({ id: u.id, name: u.name })))}

Available projects:
${JSON.stringify(projects.map((p) => ({ id: p.id, name: p.name })))}

Return ONLY valid JSON (no markdown, no backticks) with these fields:
{
  "title": "cleaned task title — the core action, without metadata phrases like 'assign to' or 'due tomorrow'",
  "assignee_id": "user id from the list above, or null if not specified",
  "project_id": "project id from the list above, or null if not specified",
  "due_at": "ISO 8601 date string (e.g. 2026-02-23T17:00:00.000Z) or null",
  "priority": 1-4 where 1=urgent 2=high 3=normal 4=low,
  "status": "backlog" | "doing" | "waiting" | "done",
  "confidence": 0.0-1.0
}

Rules:
- Match user names case-insensitively, accept first names, partial names, and nicknames
- Match project names case-insensitively, accept partial matches
- For due dates: "today" = today at 5 PM, "tomorrow" = tomorrow at 5 PM, "next week" = 7 days, "Friday" = next Friday at 5 PM, etc.
- Default priority is 3 (normal) unless urgency words like "urgent", "ASAP", "critical" appear (then 1)
- Default status is "doing" unless context suggests otherwise ("backlog" for vague ideas, "waiting" if blocked)
- confidence reflects how well you understood the request (1.0 = very clear, 0.5 = guessing)
- Strip metadata phrases from title — keep only the actionable task description`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response (handle possible markdown wrapping)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to parse AI response: ${responseText}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as ParsedTask;
  return parsed;
}
