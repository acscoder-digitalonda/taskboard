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
  users: { id: string; name: string; role?: string; description?: string }[],
  projects: { id: string; name: string }[]
): Promise<ParsedTaskBatch> {
  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Build team roster with roles and descriptions so the AI can assign
  // tasks to the right person based on their expertise, not just name matching.
  const teamRoster = users
    .map((u) => {
      let entry = `- ${u.name} (id: ${u.id}, role: ${u.role || "member"})`;
      if (u.description) entry += ` — ${u.description}`;
      return entry;
    })
    .join("\n");

  const systemPrompt = `You are a task parser for a project management app called TaskBoard.
Given a natural language message, extract one or more structured tasks.

Today is ${dayOfWeek}, ${today}.

## Team Members
${teamRoster}

## Role Definitions
- "design" → visual/brand/UI/UX/graphics/illustration/layout work
- "strategy" → planning/positioning/messaging/research/competitive analysis/content strategy
- "development" → code/engineering/bugs/features/deployment/API/database
- "pm" → scheduling/budgets/timelines/coordination/general inquiries
- "content_writer" → copywriting, blog posts, social media content, editing
- "member" → general team member (no specific specialty)

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
- CRITICAL — SMART ASSIGNMENT: You MUST attempt to assign every task to the best-fit team member based on their ROLE and DESCRIPTION. Do NOT leave assignee_id as null if ANY team member's role matches the task type.
  - Bug fixes, coding, front-end, back-end, API work, deployment, engineering, website issues → assign to "development" role members
  - Design mockups, UI/UX, branding, graphics, illustration, layout → assign to "design" role members
  - Strategy, research, planning, positioning, competitive analysis → assign to "strategy" role members
  - Scheduling, coordination, budgets, timelines, general inquiries → assign to "pm" role members
  - Writing, blog posts, content creation, copywriting, editing → assign to "content_writer" role members
  - If the user explicitly names an assignee, always respect that — even if the role doesn't match
  - If no assignee is specified, ALWAYS check team member roles and descriptions for the best match
  - When multiple members share the same role, prefer the one whose DESCRIPTION best matches the task
  - Also check each member's DESCRIPTION for keywords (e.g., a member described as "front-end developer" should get front-end tasks)
  - Only leave assignee_id as null if the task is truly ambiguous AND no team member's role or description matches at all
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
  users: { id: string; name: string; role?: string; description?: string }[],
  projects: { id: string; name: string }[]
): Promise<ParsedTask> {
  const batch = await parseTasksWithLLM(text, users, projects);
  return batch.tasks[0];
}

/**
 * Basic regex-only task parser — server-side fallback when LLM is unavailable.
 *
 * Same signature as parseTasksWithLLM but uses simple regex patterns instead
 * of calling Claude. Returns a single task with lower confidence (0.3).
 *
 * Capabilities:
 * - Assignee: "assign to <name>" or "@<name>"
 * - Project: "project: <name>" or "project <name>"
 * - Due dates: "due today", "due tomorrow", "due in N days"
 * - Priority: "urgent", "asap", "critical" → priority 1; default 3
 * - Status: defaults to "doing"
 */
export function parseTasksBasic(
  text: string,
  users: { id: string; name: string; role?: string; description?: string }[],
  projects: { id: string; name: string }[]
): ParsedTaskBatch {
  const input = text.trim();
  let title = input;
  let assignee_id: string | null = null;
  let project_id: string | null = null;
  let due_at: string | null = null;
  let priority = 3;

  // --- Assignee: "assign to Katie" or "@Katie" ---
  const assignMatch = input.match(/(?:assign(?:ed)?\s+to\s+|@)(\w+)/i);
  if (assignMatch) {
    const name = assignMatch[1].toLowerCase();
    const user = users.find((u) => u.name.toLowerCase() === name);
    if (user) {
      assignee_id = user.id;
      title = title.replace(assignMatch[0], "").trim();
    }
  }

  // --- Project: "project: TaskBoard" or "project TaskBoard" ---
  const projMatch = input.match(/project[:\s]+(\w+)/i);
  if (projMatch) {
    const projName = projMatch[1].toLowerCase();
    const proj = projects.find((p) => p.name.toLowerCase().includes(projName));
    if (proj) {
      project_id = proj.id;
      title = title.replace(projMatch[0], "").trim();
    }
  }

  // --- Due date: "due today", "due tomorrow", "due in 3 days" ---
  const dueMatch = input.match(/due\s+(today|tomorrow|in\s+(\d+)\s+days?)/i);
  if (dueMatch) {
    const now = new Date();
    if (dueMatch[1].toLowerCase() === "today") {
      now.setHours(17, 0, 0, 0);
      due_at = now.toISOString();
    } else if (dueMatch[1].toLowerCase() === "tomorrow") {
      now.setDate(now.getDate() + 1);
      now.setHours(17, 0, 0, 0);
      due_at = now.toISOString();
    } else if (dueMatch[2]) {
      now.setDate(now.getDate() + parseInt(dueMatch[2]));
      now.setHours(17, 0, 0, 0);
      due_at = now.toISOString();
    }
    title = title.replace(dueMatch[0], "").trim();
  }

  // --- Priority: urgent/asap/critical → 1 ---
  if (/\b(urgent|asap|critical)\b/i.test(input)) {
    priority = 1;
  }

  // --- Clean up title ---
  title = title
    .replace(/,\s*$/, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  // Fall back to original input if title is empty after cleanup
  if (!title) title = input;

  const task: ParsedTask = {
    title,
    assignee_id,
    project_id,
    due_at,
    priority,
    status: "doing",
    confidence: 0.3,
  };

  return {
    tasks: [task],
    confidence: 0.3,
  };
}
