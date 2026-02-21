import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

// Minimal NextRequest mock
function mockRequest(ip = "127.0.0.1"): any {
  return {
    headers: {
      get(name: string) {
        if (name === "x-forwarded-for") return ip;
        return null;
      },
    },
  };
}

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const limiter = rateLimit({ windowMs: 1000, max: 3 });
    const req = mockRequest();

    expect(limiter.check(req)).toBeNull();
    expect(limiter.check(req)).toBeNull();
    expect(limiter.check(req)).toBeNull();
  });

  it("blocks requests over the limit", () => {
    const limiter = rateLimit({ windowMs: 1000, max: 2 });
    const req = mockRequest();

    expect(limiter.check(req)).toBeNull(); // 1
    expect(limiter.check(req)).toBeNull(); // 2
    const result = limiter.check(req);      // 3 — should be blocked
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("resets after the window expires", () => {
    const limiter = rateLimit({ windowMs: 1000, max: 1 });
    const req = mockRequest();

    expect(limiter.check(req)).toBeNull(); // 1
    expect(limiter.check(req)).not.toBeNull(); // 2 — blocked

    // Advance past the window
    vi.advanceTimersByTime(1100);

    expect(limiter.check(req)).toBeNull(); // Should be allowed again
  });

  it("tracks different IPs separately", () => {
    const limiter = rateLimit({ windowMs: 1000, max: 1 });
    const req1 = mockRequest("1.2.3.4");
    const req2 = mockRequest("5.6.7.8");

    expect(limiter.check(req1)).toBeNull();
    expect(limiter.check(req2)).toBeNull();
    expect(limiter.check(req1)).not.toBeNull(); // 1.2.3.4 blocked
    expect(limiter.check(req2)).not.toBeNull(); // 5.6.7.8 blocked
  });

  it("uses defaults when no options provided", () => {
    const limiter = rateLimit();
    const req = mockRequest();

    // Should allow up to 30 requests
    for (let i = 0; i < 30; i++) {
      expect(limiter.check(req)).toBeNull();
    }
    // 31st should be blocked
    expect(limiter.check(req)).not.toBeNull();
  });
});
