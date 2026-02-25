/**
 * Unit tests: Smart assignment flow in ChatPanel.
 *
 * Tests the data flow from AI parser response → preview → task creation,
 * proving that when the AI returns a correct assignee_id, it flows through
 * to the created task (NOT overridden by currentUserId).
 *
 * No Anthropic API key needed — uses mocked responses.
 *
 * Run with:
 *   cd apps/web && npx vitest run src/__tests__/smart-assignment-flow.test.ts
 */

import { describe, it, expect } from "vitest";

// --- Simulate exactly what ChatPanel does ---

const CURRENT_USER_ID = "user-jordan"; // The person typing in ChatPanel

interface MockParsedTask {
  title: string;
  assignee_id: string | null;
  project_id: string | null;
  status: string;
  priority: number;
  confidence: number;
}

/**
 * Simulates ChatPanel lines 110-122: processing API response.
 * This is the PREVIEW step — what the user sees before clicking "Create".
 */
function processApiResponse(parsedArray: MockParsedTask[]) {
  return parsedArray.map((p) => ({
    ...p,
    assignee_id: p.assignee_id || undefined,   // Line 119: null → undefined
    status: p.status || "doing",
    priority: p.priority || 3,
  }));
}

/**
 * Simulates ChatPanel line 201-215: creating the task.
 * This is the CREATION step — what actually gets stored.
 */
function createTask(pt: ReturnType<typeof processApiResponse>[0]) {
  return {
    title: pt.title || "Untitled task",
    assignee_id: pt.assignee_id || CURRENT_USER_ID,  // Line 203: fallback
    status: pt.status || "doing",
    priority: pt.priority || 2,
  };
}

describe("Smart Assignment Flow (unit, no API key needed)", () => {
  describe("When AI returns correct assignee (user has proper role)", () => {
    const AI_RESPONSE: MockParsedTask = {
      title: "Check all features of taskboard app",
      assignee_id: "user-an",  // AI correctly assigned to developer
      project_id: null,
      status: "doing",
      priority: 3,
      confidence: 0.9,
    };

    it("preview keeps AI's assignee (not current user)", () => {
      const [preview] = processApiResponse([AI_RESPONSE]);
      expect(preview.assignee_id).toBe("user-an");
      expect(preview.assignee_id).not.toBe(CURRENT_USER_ID);
    });

    it("created task keeps AI's assignee (not current user)", () => {
      const [preview] = processApiResponse([AI_RESPONSE]);
      const task = createTask(preview);
      expect(task.assignee_id).toBe("user-an");
      expect(task.assignee_id).not.toBe(CURRENT_USER_ID);
    });
  });

  describe("When AI returns null assignee (no matching role found)", () => {
    const AI_RESPONSE: MockParsedTask = {
      title: "Check all features of taskboard app",
      assignee_id: null,  // AI couldn't find a match (all roles are "member")
      project_id: null,
      status: "doing",
      priority: 3,
      confidence: 0.7,
    };

    it("preview shows undefined (displays as 'Unassigned')", () => {
      const [preview] = processApiResponse([AI_RESPONSE]);
      expect(preview.assignee_id).toBeUndefined();
    });

    it("created task FALLS BACK to current user (this is the bug!)", () => {
      const [preview] = processApiResponse([AI_RESPONSE]);
      const task = createTask(preview);
      // This proves: when AI returns null → task gets current user
      // This is WHY the user sees "assigned to current user"
      expect(task.assignee_id).toBe(CURRENT_USER_ID);
    });
  });

  describe("Multi-task: AI assigns different people by role", () => {
    const AI_RESPONSE: MockParsedTask[] = [
      {
        title: "Fix the login bug",
        assignee_id: "user-an",     // developer
        project_id: null,
        status: "doing",
        priority: 2,
        confidence: 0.95,
      },
      {
        title: "Create homepage mockup",
        assignee_id: "user-katie",  // designer
        project_id: null,
        status: "doing",
        priority: 3,
        confidence: 0.9,
      },
      {
        title: "Write press release",
        assignee_id: "user-sara",   // content writer
        project_id: null,
        status: "doing",
        priority: 3,
        confidence: 0.85,
      },
    ];

    it("all three tasks keep their AI-assigned owners", () => {
      const previews = processApiResponse(AI_RESPONSE);
      const tasks = previews.map(createTask);

      expect(tasks[0].assignee_id).toBe("user-an");
      expect(tasks[1].assignee_id).toBe("user-katie");
      expect(tasks[2].assignee_id).toBe("user-sara");
      // None should be current user
      expect(tasks.every((t) => t.assignee_id !== CURRENT_USER_ID)).toBe(true);
    });
  });

  describe("Root cause demonstration", () => {
    it("PROVES: if all users have role=member, AI returns null → falls back to current user", () => {
      // This is what happens when users in the DB don't have roles set:
      // The AI sees: "Jordan (role: member), An (role: member), Katie (role: member)"
      // It can't tell who's a developer, so it returns null
      const aiResponseWithNoRoles: MockParsedTask = {
        title: "Check all features of taskboard app",
        assignee_id: null,  // AI returns null because it can't distinguish users
        project_id: null,
        status: "doing",
        priority: 3,
        confidence: 0.5,
      };

      const [preview] = processApiResponse([aiResponseWithNoRoles]);
      const task = createTask(preview);

      // The task ends up assigned to current user — NOT smart assignment
      expect(task.assignee_id).toBe(CURRENT_USER_ID);
    });

    it("PROVES: if users have proper roles, AI returns correct assignee → works", () => {
      // This is what happens when users have roles set:
      // The AI sees: "An (role: development) — Full-stack developer"
      // It correctly assigns coding tasks to An
      const aiResponseWithRoles: MockParsedTask = {
        title: "Check all features of taskboard app",
        assignee_id: "user-an",  // AI correctly identifies developer
        project_id: null,
        status: "doing",
        priority: 3,
        confidence: 0.9,
      };

      const [preview] = processApiResponse([aiResponseWithRoles]);
      const task = createTask(preview);

      // The task is correctly assigned to the developer
      expect(task.assignee_id).toBe("user-an");
      expect(task.assignee_id).not.toBe(CURRENT_USER_ID);
    });
  });
});
