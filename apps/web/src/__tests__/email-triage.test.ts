import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock Supabase (chainable query builder) ───────────────────
let chainResult = { data: null as unknown, error: null as unknown };

/** Create a chainable mock that always returns itself + result */
function makeChain(): Record<string, any> {
  const chain: Record<string, any> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "neq", "not", "is", "ilike", "contains",
    "single", "limit", "order", "range", "maybeSingle",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockImplementation(() => {
      // single/maybeSingle return the result directly
      if (m === "single" || m === "maybeSingle") return chainResult;
      return chain;
    });
  }
  // Spread result onto chain so `.data` and `.error` are accessible
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

// ── Mock Gmail ─────────────────────────────────────────────────
vi.mock("@/lib/gmail", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "gmail-msg-1", threadId: "gmail-thread-1" }),
  isGmailConfigured: vi.fn().mockReturnValue(true),
  getSendAsEmail: vi.fn().mockReturnValue("team@example.com"),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ check: () => null }),
}));

// ── Mock triage (Anthropic SDK can't init in test env) ───────
vi.mock("@/app/api/email/triage/route", () => ({
  triageEmail: vi.fn().mockResolvedValue(null),
  TriageResult: {},
}));

// ── Mock context + files-server ──────────────────────────────
vi.mock("@/lib/context", () => ({
  getProjectContext: vi.fn().mockResolvedValue(""),
  appendToDecisionLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/files-server", () => ({
  uploadFileFromUrl: vi.fn().mockResolvedValue(null),
  linkFilesToTask: vi.fn().mockResolvedValue(undefined),
  formatFileSize: vi.fn().mockReturnValue("0 B"),
}));

// ── Helpers ────────────────────────────────────────────────────
function makeRequest(
  body: Record<string, unknown>,
  options: {
    method?: string;
    headers?: Record<string, string>;
    url?: string;
  } = {}
) {
  const { method = "POST", headers = {}, url = "http://localhost/api/email/drafts" } = options;
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
      ...headers,
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  }) as unknown as import("next/server").NextRequest;
}

function makeGetRequest(url: string) {
  return new Request(url, {
    method: "GET",
    headers: {
      authorization: "Bearer test-token",
    },
  }) as unknown as import("next/server").NextRequest;
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("POST /api/email/drafts — create draft", () => {
  let POST: typeof import("@/app/api/email/drafts/route").POST;

  beforeEach(async () => {
    vi.resetModules();
    resetChain({ id: "draft-1", status: "draft" });
    const mod = await import("@/app/api/email/drafts/route");
    POST = mod.POST;
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 400 when required fields are missing", async () => {
    const req = makeRequest({ to_email: "a@b.com", subject: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Missing required fields/);
  });

  it("returns 400 for invalid email format", async () => {
    const req = makeRequest({
      to_email: "not-an-email",
      subject: "Test",
      body_text: "Hello",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid email format/);
  });

  it("creates a draft with valid input", async () => {
    resetChain({ id: "draft-1", status: "draft", to_email: "client@example.com" });
    const req = makeRequest({
      to_email: "client@example.com",
      subject: "Hello",
      body_text: "Body here",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.draft.id).toBe("draft-1");
  });

  it("returns 401 when unauthenticated", async () => {
    const { getAuthenticatedUserId } = await import("@/lib/api-auth");
    vi.mocked(getAuthenticatedUserId).mockResolvedValueOnce(null);

    const req = makeRequest({
      to_email: "a@b.com",
      subject: "Test",
      body_text: "Hi",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/email/drafts — list drafts", () => {
  let GET: typeof import("@/app/api/email/drafts/route").GET;

  beforeEach(async () => {
    vi.resetModules();
    resetChain([
      { id: "d1", status: "draft" },
      { id: "d2", status: "sent" },
    ]);
    const mod = await import("@/app/api/email/drafts/route");
    GET = mod.GET;
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns drafts list", async () => {
    const req = makeGetRequest("http://localhost/api/email/drafts");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.drafts).toBeDefined();
  });
});

describe("PATCH /api/email/drafts/[id] — edit draft", () => {
  let PATCH: typeof import("@/app/api/email/drafts/[id]/route").PATCH;

  beforeEach(async () => {
    vi.resetModules();
    resetChain({ id: "draft-1", status: "draft" });
    const mod = await import("@/app/api/email/drafts/[id]/route");
    PATCH = mod.PATCH;
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 400 when no valid fields provided", async () => {
    const req = makeRequest({ unknown_field: "val" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "draft-1" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/No valid fields/);
  });

  it("returns 400 for empty required fields", async () => {
    const req = makeRequest({ subject: "" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "draft-1" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/cannot be empty/);
  });

  it("validates email format on to_email update", async () => {
    const req = makeRequest({ to_email: "bad-email" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "draft-1" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid email format/);
  });

  it("prevents editing sent drafts", async () => {
    resetChain({ id: "draft-1", status: "sent" });
    const req = makeRequest({ body_text: "Updated" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "draft-1" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Cannot edit a sent draft/);
  });

  it("updates draft with valid fields", async () => {
    // Chain returns draft with status=draft for both the check and update
    resetChain({ id: "draft-1", status: "draft", body_text: "Updated" });

    const req = makeRequest({ body_text: "Updated" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "draft-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

describe("DELETE /api/email/drafts/[id] — discard draft", () => {
  let DELETE: typeof import("@/app/api/email/drafts/[id]/route").DELETE;

  beforeEach(async () => {
    vi.resetModules();
    resetChain({ id: "draft-1", status: "draft" });
    const mod = await import("@/app/api/email/drafts/[id]/route");
    DELETE = mod.DELETE;
  });

  afterEach(() => vi.restoreAllMocks());

  it("prevents deleting sent drafts", async () => {
    resetChain({ id: "draft-1", status: "sent" });
    const req = makeRequest({}, { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "draft-1" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Cannot delete a sent draft/);
  });

  it("deletes a draft successfully", async () => {
    // Chain returns status=draft for the check, and no error for delete
    resetChain({ status: "draft" });

    const req = makeRequest({}, { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "draft-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 404 for nonexistent draft", async () => {
    resetChain(null);
    const req = makeRequest({}, { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/email/send — send via Gmail", () => {
  let POST: typeof import("@/app/api/email/send/route").POST;

  beforeEach(async () => {
    vi.resetModules();
    resetChain({
      id: "draft-1",
      status: "draft",
      to_email: "client@example.com",
      to_name: "Client",
      subject: "Hello",
      body_text: "Body",
      body_html: null,
      gmail_thread_id: null,
      gmail_message_id: null,
      channel_id: null,
      project_id: null,
    });
    const mod = await import("@/app/api/email/send/route");
    POST = mod.POST;
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 400 when draft_id is missing", async () => {
    const req = makeRequest({ sent_by: "user-1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent draft", async () => {
    resetChain(null, { message: "not found" });
    const req = makeRequest({ draft_id: "nope", sent_by: "user-1" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("prevents re-sending already sent drafts", async () => {
    resetChain({
      id: "draft-1",
      status: "sent",
      to_email: "c@e.com",
      subject: "Hi",
      body_text: "Body",
    });
    const req = makeRequest({ draft_id: "draft-1", sent_by: "user-1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/already been sent/);
  });

  it("returns 503 when Gmail is not configured", async () => {
    const { isGmailConfigured } = await import("@/lib/gmail");
    vi.mocked(isGmailConfigured).mockReturnValueOnce(false);

    const req = makeRequest({ draft_id: "draft-1", sent_by: "user-1" });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/not configured/);
  });

  it("sends email successfully", async () => {
    const req = makeRequest({ draft_id: "draft-1", sent_by: "user-1" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.messageId).toBe("gmail-msg-1");
    expect(data.threadId).toBe("gmail-thread-1");
  });

  it("marks draft as failed when Gmail API throws", async () => {
    const { sendEmail } = await import("@/lib/gmail");
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Gmail auth failed"));

    const req = makeRequest({ draft_id: "draft-1", sent_by: "user-1" });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/Gmail send failed/);
  });
});

describe("POST /api/email/inbound — webhook", () => {
  let POST: typeof import("@/app/api/email/inbound/route").POST;

  beforeEach(async () => {
    vi.resetModules();
    // Default: no project match, channel creation works
    resetChain(null);
    const mod = await import("@/app/api/email/inbound/route");
    POST = mod.POST;
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 403 when webhook secret is invalid", async () => {
    const { verifyWebhookSecret } = await import("@/lib/api-auth");
    vi.mocked(verifyWebhookSecret).mockReturnValueOnce(false);

    const req = makeRequest(
      { from: "client@acme.com", subject: "Hi" },
      { headers: { "x-webhook-secret": "wrong" } }
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when from field is missing", async () => {
    const req = makeRequest({ subject: "Hi", text: "Body" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Missing from/);
  });

  it("processes inbound email successfully", async () => {
    // No project/channel match → all queries return null
    resetChain(null);

    const req = makeRequest({
      from: "client@acme.com",
      to: "team@example.com",
      subject: "Project update",
      text: "Here is the latest status...",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("extracts email from Name <email> format", async () => {
    resetChain(null);

    const req = makeRequest({
      from: "John Doe <john@acme.com>",
      subject: "Hi",
      text: "Hello",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("does not create orphaned drafts when no channel exists", async () => {
    // No project match → no channel → draft should NOT be created
    resetChain(null);

    const req = makeRequest({
      from: "unknown@nowhere.com",
      subject: "Random",
      text: "Hello",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    // draft_id should be null since no channel was created
    expect(data.draft_id).toBeNull();
  });
});

describe("gmail.ts — buildRawEmail & config", () => {
  it("isGmailConfigured returns false when env vars missing", async () => {
    // We can test the real isGmailConfigured by not mocking gmail
    const origSvc = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const origSendAs = process.env.GMAIL_SEND_AS;

    try {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "";
      process.env.GMAIL_SEND_AS = "";

      // Re-import to get fresh module
      vi.resetModules();
      // Don't mock gmail for this test
      vi.doUnmock("@/lib/gmail");
      const { isGmailConfigured } = await import("@/lib/gmail");
      expect(isGmailConfigured()).toBe(false);
    } finally {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = origSvc;
      process.env.GMAIL_SEND_AS = origSendAs;
    }
  });
});
