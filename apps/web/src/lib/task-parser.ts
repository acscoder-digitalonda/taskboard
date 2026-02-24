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

export interface ParsedTaskBatch {
  tasks: ParsedTask[];
  confidence: number;
}

/**
 * Parse natural language text into one or more structured tasks using Claude Sonnet.
 *
 * If the input describes multiple actions (e.g. "Review deck, draft proposal, and schedule meeting"),
 * returns multiple tasks. Shared metadata (assignee, due date, project) is applied to all.
 *
 * Max 10 tasks per input.
 */
export async function parseTasksWithLLM(
  text: string,
  users: { id: string; name: string }[],
  projects: { id: string; name: string }[]
): Promise<ParsedTaskBatch> {
  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const systemPrompt = `You are a task parser for a project management app called TaskBoard.
Given a natural language message, extract one or more structured tasks.

Today is ${dayOfWeek}, ${today}.

Available team members:
${JSON.stringify(users.map((u) => ({ id: u.id, name: u.name })))}

Available projects:
${JSON.stringify(projects.map((p) => ({ id: p.id, name: p.name })))}

Return ONLY valid JSON (no markdown, no backticks) with this structure:
{
  "tasks": [
    {
      "title": "cleaned task title — the core action, without metadata phrases like 'assign to' or 'due tomorrow'",
      "assignee_id": "user id from the list above, or null if not specified",
      "project_id": "project id from the list above, or null if not specified",
      "due_at": "ISO 8601 date string (e.g. 2026-02-23T17:00:00.000Z) or null",
      "priority": 1-4 where 1=urgent 2=high 3=normal 4=low,
      "status": "backlog" | "doing" | "waiting" | "done",
      "confidence": 0.0-1.0
    }
  ],
  "confidence": 0.0-1.0
}

Rules:
- If the input describes multiple distinct actions or tasks, return one task per action. Examples:
  - "Review deck, draft proposal, and schedule meeting" → 3 tasks
  - "Send invoice and follow up with client about contract" → 2 tasks
  - "Finish the landing page" → 1 task
- If a shared assignee, due date, or project is mentioned once, apply it to ALL tasks
- If different assignees are specified per task (e.g. "assign X to Katie, Y to An"), respect individual assignments
- Maximum 10 tasks per input
- Match user names case-insensitively, accept first names, partial names, and nicknames
- Match project names case-insensitively, accept partial matches
- For due dates: "today" = today at 5 PM, "tomorrow" = tomorrow at 5 PM, "next week" = 7 days, "Friday" = next Friday at 5 PM, etc.
- Default priority is 3 (normal) unless urgency words like "urgent", "ASAP", "critical" appear (then 1)
- Default status is "doing" unless context suggests otherwise ("backlog" for vague ideas, "waiting" if blocked)
- confidence reflects how well you understood the request (1.0 = very clear, 0.5 = guessing)
- The top-level confidence is the overall confidence for the entire batch
- Strip metadata phrases from titles — keep only the actionable task description`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1200,
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

  const parsed = JSON.parse(jsonMatch[0]);

  // Handle both new array format and legacy single-object format
  if (parsed.tasks && Array.isArray(parsed.tasks)) {
    return {
      tasks: parsed.tasks.slice(0, 10) as ParsedTask[],
      confidence: parsed.confidence ?? parsed.tasks[0]?.confidence ?? 0.5,
    };
  }

  // Legacy single-object fallback
  return {
    tasks: [parsed as ParsedTask],
    confidence: parsed.confidence ?? 0.5,
  };
}

/**
 * Parse natural language text into a single structured task using Claude Sonnet.
 *
 * Backward-compatible wrapper around parseTasksWithLLM — returns the first task.
 * Used by POST /api/v1/tasks/assign (external API).
 */
export async function parseTaskWithLLM(
  text: string,
  users: { id: string; name: string }[],
  projects: { id: string; name: string }[]
): Promise<ParsedTask> {
  const batch = await parseTasksWithLLM(text, users, projects);
  return batch.tasks[0];
}
