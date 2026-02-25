/**
 * Integration test: AI smart task assignment via parseTasksWithLLM.
 *
 * Proves that the AI parser correctly assigns tasks to team members
 * based on their role and description — NOT always to the current user.
 *
 * Requires TASKBOARD_ANTHROPIC_KEY env var to run.
 * Skipped automatically if the key is missing.
 *
 * Run with:
 *   TASKBOARD_ANTHROPIC_KEY=sk-ant-... npx vitest run src/__tests__/task-parser-assignment.test.ts
 */

import { describe, it, expect } from "vitest";

// Dynamic import so the test file loads even without the env var
const API_KEY = process.env.TASKBOARD_ANTHROPIC_KEY;

// --- Mock team roster (same shape ChatPanel sends to the parser) ---

const MOCK_USERS = [
  {
    id: "user-jordan",
    name: "Jordan",
    role: "pm",
    description: "Project manager, coordinates team and handles scheduling",
  },
  {
    id: "user-an",
    name: "An",
    role: "development",
    description: "Full-stack developer, handles front-end and back-end code",
  },
  {
    id: "user-katie",
    name: "Katie",
    role: "design",
    description: "UI/UX designer, creates mockups and brand assets",
  },
  {
    id: "user-mike",
    name: "Mike",
    role: "strategy",
    description: "Strategy lead, market research and competitive analysis",
  },
  {
    id: "user-sara",
    name: "Sara",
    role: "content_writer",
    description: "Content writer, blog posts and social media copy",
  },
];

const MOCK_PROJECTS = [
  { id: "proj-taskboard", name: "TaskBoard" },
  { id: "proj-website", name: "Company Website" },
];

// Skip entire suite if no API key
const describeIf = API_KEY ? describe : describe.skip;

describeIf("AI Smart Task Assignment (integration)", () => {
  // Import the parser dynamically (it imports Anthropic SDK which needs the key)
  let parseTasksWithLLM: typeof import("@/lib/task-parser").parseTasksWithLLM;

  // Load the module before tests
  it("loads the parser module", async () => {
    const mod = await import("@/lib/task-parser");
    parseTasksWithLLM = mod.parseTasksWithLLM;
    expect(parseTasksWithLLM).toBeDefined();
  });

  it("assigns coding task to developer (An), NOT to current user", async () => {
    const result = await parseTasksWithLLM(
      "task for coder check all features of taskboard app",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== CODING TASK RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    expect(result.tasks.length).toBeGreaterThanOrEqual(1);

    const task = result.tasks[0];
    // Should assign to An (development role), not leave null
    expect(task.assignee_id).toBe("user-an");
  }, 30000);

  it("assigns design task to designer (Katie)", async () => {
    const result = await parseTasksWithLLM(
      "create new logo mockup for the website redesign",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== DESIGN TASK RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    expect(result.tasks.length).toBeGreaterThanOrEqual(1);

    const task = result.tasks[0];
    expect(task.assignee_id).toBe("user-katie");
  }, 30000);

  it("assigns strategy task to strategist (Mike)", async () => {
    const result = await parseTasksWithLLM(
      "do competitive analysis on rival products",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== STRATEGY TASK RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    expect(result.tasks.length).toBeGreaterThanOrEqual(1);

    const task = result.tasks[0];
    expect(task.assignee_id).toBe("user-mike");
  }, 30000);

  it("assigns writing task to content writer (Sara)", async () => {
    const result = await parseTasksWithLLM(
      "write a blog post about our new product launch",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== WRITING TASK RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    expect(result.tasks.length).toBeGreaterThanOrEqual(1);

    const task = result.tasks[0];
    expect(task.assignee_id).toBe("user-sara");
  }, 30000);

  it("assigns scheduling/coordination task to PM (Jordan)", async () => {
    const result = await parseTasksWithLLM(
      "schedule a team meeting for next week to discuss project timeline",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== PM TASK RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    expect(result.tasks.length).toBeGreaterThanOrEqual(1);

    const task = result.tasks[0];
    expect(task.assignee_id).toBe("user-jordan");
  }, 30000);

  it("assigns 'fix front-end bug' to developer, not PM or designer", async () => {
    const result = await parseTasksWithLLM(
      "fix the front-end bug on the login page",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== FRONT-END BUG RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    expect(result.tasks.length).toBeGreaterThanOrEqual(1);

    const task = result.tasks[0];
    expect(task.assignee_id).toBe("user-an");
  }, 30000);

  it("respects explicit name assignment even if role doesn't match", async () => {
    const result = await parseTasksWithLLM(
      "assign to Katie: fix the API endpoint for user registration",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== EXPLICIT ASSIGNMENT RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    expect(result.tasks.length).toBeGreaterThanOrEqual(1);

    const task = result.tasks[0];
    // Should respect explicit name even though Katie is a designer
    expect(task.assignee_id).toBe("user-katie");
  }, 30000);

  it("multi-task assigns to different people by role", async () => {
    const result = await parseTasksWithLLM(
      "fix the login bug, create a new homepage mockup, and write a press release",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== MULTI-TASK RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    expect(result.tasks.length).toBe(3);

    const assignees = result.tasks.map((t) => t.assignee_id);
    // Should have developer, designer, and content writer
    expect(assignees).toContain("user-an");     // fix login bug → developer
    expect(assignees).toContain("user-katie");  // homepage mockup → designer
    expect(assignees).toContain("user-sara");   // press release → content writer
  }, 30000);

  it("NEVER returns null assignee when a matching role exists", async () => {
    const result = await parseTasksWithLLM(
      "deploy the new version to production",
      MOCK_USERS,
      MOCK_PROJECTS
    );

    console.log("=== NULL CHECK RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    const task = result.tasks[0];
    // deployment = development role → should assign to An, NEVER null
    expect(task.assignee_id).not.toBeNull();
    expect(task.assignee_id).toBe("user-an");
  }, 30000);
});
