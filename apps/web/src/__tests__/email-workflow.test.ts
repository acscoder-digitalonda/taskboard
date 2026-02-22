import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Supabase (chainable query builder) ───────────────────
let chainResult = { data: null as unknown, error: null as unknown };

function makeChain(): Record<string, any> {
  const chain: Record<string, any> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "neq", "not", "is", "ilike", "contains",
    "single", "limit", "order", "range", "maybeSingle",
    "in", "gte", "lte", "textSearch",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockImplementation(() => {
      if (m === "single" || m === "maybeSingle") return chainResult;
      return chain;
    });
  }
  Object.defineProperty(chain, "data", { get: () => chainResult.data, configurable: true });
  Object.defineProperty(chain, "error", { get: () => chainResult.error, configurable: true });
  return chain;
}

const chain = makeChain();

function resetChain(data: unknown = null, error: unknown = null) {
  chainResult = { data, error };
}

const mockFrom = vi.fn().mockImplementation(() => chain);

vi.mock("@/lib/api-auth", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
  getAuthenticatedUserId: vi.fn().mockResolvedValue("user-123"),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  verifyWebhookSecret: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ check: () => null }),
}));

// ── Mock triage route (Anthropic SDK can't init in test env) ─
vi.mock("@/app/api/email/triage/route", () => ({
  triageEmail: vi.fn().mockResolvedValue({
    category: "design",
    assignee_role: "design",
    task_title: "Update brand colors",
    task_priority: 2,
    task_sections: [{ heading: "Goal", content: "Refresh brand palette" }],
    draft_reply: "Thanks for reaching out about colors.",
    reasoning: "Client requesting visual changes",
    confidence: 0.92,
  }),
  TriageResult: {},
}));

// ── Mock context lib ─────────────────────────────────────────
vi.mock("@/lib/context", () => ({
  getProjectContext: vi.fn().mockResolvedValue("## Project Context\nSample context"),
  appendToDecisionLog: vi.fn().mockResolvedValue(undefined),
  getOrCreateContextDoc: vi.fn().mockResolvedValue({ id: "ctx-1", content: "repo: https://github.com/test", version: 1 }),
}));

// ── Mock files-server (but let formatFileSize through) ───────
vi.mock("@/lib/files-server", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    uploadFileFromUrl: vi.fn().mockResolvedValue({ id: "file-1", storage_path: "taskboard/test.pdf" }),
    linkFilesToTask: vi.fn().mockResolvedValue(undefined),
  };
});

function makeReq(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const { method = "GET", body, headers = {} } = options;
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": "test-secret",
      ...headers,
    },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(url, init);
}

/** Create a one-off chain with specific data */
function makeChainWith(data: unknown, error: unknown = null): Record<string, any> {
  const localResult = { data, error };
  const localChain: Record<string, any> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "neq", "not", "is", "ilike", "contains",
    "single", "limit", "order", "range", "maybeSingle",
    "in", "gte", "lte", "textSearch",
  ];
  for (const m of methods) {
    localChain[m] = vi.fn().mockImplementation(() => {
      if (m === "single" || m === "maybeSingle") return localResult;
      return localChain;
    });
  }
  Object.defineProperty(localChain, "data", { get: () => localResult.data, configurable: true });
  Object.defineProperty(localChain, "error", { get: () => localResult.error, configurable: true });
  return localChain;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetChain();
  mockFrom.mockImplementation(() => chain);
});

// ═══════════════════════════════════════════════════════════════
// Context API tests
// ═══════════════════════════════════════════════════════════════
describe("Context CRUD API", () => {
  it("GET /api/context returns docs for a project", async () => {
    const docs = [
      { id: "ctx-1", doc_type: "strategy_brief", title: "Strategy", content: "Brief content", version: 1 },
      { id: "ctx-2", doc_type: "decision_log", title: "Decisions", content: "Log entries", version: 3 },
    ];
    resetChain(docs);

    const { GET } = await import("@/app/api/context/route");
    const req = makeReq("/api/context?project_id=proj-1");
    const res = await GET(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.docs).toEqual(docs);
  });

  it("GET /api/context returns 400 without project_id", async () => {
    const { GET } = await import("@/app/api/context/route");
    const req = makeReq("/api/context");
    const res = await GET(req as any);

    expect(res.status).toBe(400);
  });

  it("POST /api/context creates a new doc", async () => {
    resetChain({ id: "ctx-new", doc_type: "brand_guidelines", title: "Brand Guide", content: "Colors..." });

    const { POST } = await import("@/app/api/context/route");
    const req = makeReq("/api/context", {
      method: "POST",
      body: {
        project_id: "proj-1",
        doc_type: "brand_guidelines",
        title: "Brand Guide",
        content: "Colors and fonts",
      },
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.doc.doc_type).toBe("brand_guidelines");
  });

  it("POST /api/context rejects invalid doc_type", async () => {
    const { POST } = await import("@/app/api/context/route");
    const req = makeReq("/api/context", {
      method: "POST",
      body: {
        project_id: "proj-1",
        doc_type: "invalid_type",
        title: "Bad",
        content: "Test",
      },
    });
    const res = await POST(req as any);

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// Context doc update/delete tests
// ═══════════════════════════════════════════════════════════════
describe("Context Doc PATCH/DELETE", () => {
  it("PATCH /api/context/[id] updates content and bumps version", async () => {
    resetChain({ id: "ctx-1", content: "Old content", version: 2 });

    const { PATCH } = await import("@/app/api/context/[id]/route");
    const req = makeReq("/api/context/ctx-1", {
      method: "PATCH",
      body: { content: "New content" },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "ctx-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("project_context");
  });

  it("PATCH /api/context/[id] with append mode appends content", async () => {
    resetChain({ id: "ctx-1", content: "Line 1", version: 1 });

    const { PATCH } = await import("@/app/api/context/[id]/route");
    const req = makeReq("/api/context/ctx-1", {
      method: "PATCH",
      body: { content: "Line 2", append: true },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "ctx-1" }) });

    expect(res.status).toBe(200);
  });

  it("DELETE /api/context/[id] removes a doc", async () => {
    resetChain({ id: "ctx-1" });

    const { DELETE } = await import("@/app/api/context/[id]/route");
    const req = makeReq("/api/context/ctx-1", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "ctx-1" }) });

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Agent task polling tests
// ═══════════════════════════════════════════════════════════════
describe("GET /api/agent/tasks", () => {
  it("returns tasks assigned to agent user", async () => {
    const agentUser = { id: "agent-1" };
    const tasks = [
      {
        id: "task-1",
        title: "Process data report",
        status: "doing",
        project_id: "proj-1",
        assignee_id: "agent-1",
        client: "ACME",
        priority: 2,
        email_draft_id: null,
        source_email_id: null,
        created_at: "2026-02-22T00:00:00Z",
      },
    ];
    const sections = [{ heading: "Goal", content: "Generate report" }];

    // We need different results for different from() calls:
    // 1. users -> agentUser (single)
    // 2. tasks -> task list (data)
    // 3. task_sections -> sections (data)
    let callIdx = 0;
    mockFrom.mockImplementation((table: string) => {
      callIdx++;
      if (table === "users") return makeChainWith(agentUser);
      if (table === "tasks") return makeChainWith(tasks);
      if (table === "task_sections") return makeChainWith(sections);
      return makeChainWith(null);
    });

    const { GET } = await import("@/app/api/agent/tasks/route");
    const req = makeReq("/api/agent/tasks");
    const res = await GET(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.tasks).toBeDefined();
    expect(json.tasks.length).toBe(1);
    expect(json.tasks[0].title).toBe("Process data report");
  });

  it("returns empty when no agent user exists", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return makeChainWith(null);
      return makeChainWith(null);
    });

    const { GET } = await import("@/app/api/agent/tasks/route");
    const req = makeReq("/api/agent/tasks");
    const res = await GET(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.tasks).toEqual([]);
  });

  it("returns 403 without valid webhook secret", async () => {
    const { verifyWebhookSecret } = await import("@/lib/api-auth");
    (verifyWebhookSecret as any).mockReturnValueOnce(false);

    const { GET } = await import("@/app/api/agent/tasks/route");
    const req = makeReq("/api/agent/tasks");
    const res = await GET(req as any);

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
// Agent task status update tests
// ═══════════════════════════════════════════════════════════════
describe("PATCH /api/agent/tasks/[id]/status", () => {
  it("updates task status and creates timeline entry", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tasks") {
        return makeChainWith({
          id: "task-1",
          title: "Process data",
          status: "doing",
          project_id: "proj-1",
          assignee_id: "agent-1",
          drive_links: [],
        });
      }
      // task_updates, agent_activity inserts
      return makeChainWith({ id: "new-id" });
    });

    const { PATCH } = await import("@/app/api/agent/tasks/[id]/status/route");
    const req = makeReq("/api/agent/tasks/task-1/status", {
      method: "PATCH",
      body: {
        status: "done",
        update_body: "Report generated successfully",
        deliverables: ["https://example.com/report.pdf"],
      },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "task-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.new_status).toBe("done");
  });

  it("returns 400 for invalid status", async () => {
    const { PATCH } = await import("@/app/api/agent/tasks/[id]/status/route");
    const req = makeReq("/api/agent/tasks/task-1/status", {
      method: "PATCH",
      body: { status: "invalid", update_body: "Test" },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "task-1" }) });

    expect(res.status).toBe(400);
  });

  it("returns 400 without required fields", async () => {
    const { PATCH } = await import("@/app/api/agent/tasks/[id]/status/route");
    const req = makeReq("/api/agent/tasks/task-1/status", {
      method: "PATCH",
      body: { status: "done" },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "task-1" }) });

    expect(res.status).toBe(400);
  });

  it("returns 404 when task not found", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tasks") return makeChainWith(null);
      return makeChainWith(null);
    });

    const { PATCH } = await import("@/app/api/agent/tasks/[id]/status/route");
    const req = makeReq("/api/agent/tasks/nonexistent/status", {
      method: "PATCH",
      body: { status: "done", update_body: "Test" },
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// files-server tests
// ═══════════════════════════════════════════════════════════════
describe("files-server utilities", () => {
  it("formatFileSize formats bytes correctly", async () => {
    const { formatFileSize } = await import("@/lib/files-server");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1500000)).toBe("1.4 MB");
  });
});

// ═══════════════════════════════════════════════════════════════
// context.ts lib tests
// ═══════════════════════════════════════════════════════════════
describe("context.ts library", () => {
  it("getProjectContext compiles context from multiple sources", async () => {
    const { getProjectContext } = await import("@/lib/context");
    const result = await getProjectContext({} as any, "proj-1");
    expect(result).toContain("Project Context");
  });

  it("appendToDecisionLog does not throw", async () => {
    const { appendToDecisionLog } = await import("@/lib/context");
    await expect(appendToDecisionLog({} as any, "proj-1", "Test entry")).resolves.toBeUndefined();
  });
});
