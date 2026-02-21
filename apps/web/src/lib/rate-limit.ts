/**
 * L11: Simple in-memory rate limiter for API routes.
 * Tracks requests by IP with a sliding window.
 *
 * Usage in API route:
 *   const limiter = rateLimit({ windowMs: 60_000, max: 30 });
 *   export async function POST(req: NextRequest) {
 *     const limited = limiter.check(req);
 *     if (limited) return limited;
 *     ...
 *   }
 */

import { NextRequest, NextResponse } from "next/server";

interface RateLimitOptions {
  windowMs?: number; // Time window in ms (default: 60s)
  max?: number;      // Max requests per window (default: 30)
}

interface RequestRecord {
  count: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs || 60_000;
  const max = options.max || 30;
  const records = new Map<string, RequestRecord>();

  // Periodically clean up expired entries (every 5 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of records) {
      if (record.resetAt < now) records.delete(key);
    }
  }, 300_000);

  return {
    /**
     * Check if request is rate-limited.
     * Returns null if OK, or a 429 response if limited.
     */
    check(req: NextRequest): NextResponse | null {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";

      const now = Date.now();
      const record = records.get(ip);

      if (!record || record.resetAt < now) {
        records.set(ip, { count: 1, resetAt: now + windowMs });
        return null;
      }

      record.count++;
      if (record.count > max) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil((record.resetAt - now) / 1000)),
            },
          }
        );
      }

      return null;
    },
  };
}
