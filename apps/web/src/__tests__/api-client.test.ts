import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock supabase auth
const mockGetSession = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      refreshSession: () => mockRefreshSession(),
    },
  },
}));

// Stub env
const originalEnv = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH;

import { apiFetch } from "@/lib/api-client";

describe("apiFetch", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-token-123" } },
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-token-456" } },
      error: null,
    });
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH = originalEnv;
  });

  it("attaches Authorization header with Bearer token", async () => {
    await apiFetch("/api/test");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token-123");
  });

  it("adds Content-Type json when body is present", async () => {
    await apiFetch("/api/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does not override explicitly set Content-Type", async () => {
    await apiFetch("/api/test", {
      method: "POST",
      body: "custom",
      headers: { "Content-Type": "text/plain" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("text/plain");
  });

  it("retries on 401 with refreshed token", async () => {
    // First call returns 401, second returns 200
    fetchSpy
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await apiFetch("/api/test");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Second call should use refreshed token
    const [, retryInit] = fetchSpy.mock.calls[1];
    const headers = retryInit?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer refreshed-token-456");
    expect(res.status).toBe(200);
  });

  it("does not retry when session refresh fails", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 401 }));
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: new Error("fail") });

    const res = await apiFetch("/api/test");

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(res.status).toBe(401);
  });
});
