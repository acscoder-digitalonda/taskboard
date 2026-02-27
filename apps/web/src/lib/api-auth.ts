import "@/lib/env"; // Validate env vars on first import
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns false for mismatched lengths without leaking timing info.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Create a Supabase client for server-side API routes.
 * Uses the service role key when available for full DB access,
 * falls back to anon key for development.
 */
export function createServerSupabase() {
  const key = supabaseServiceKey || supabaseAnonKey;
  if (!supabaseUrl || !key) {
    throw new Error("Supabase not configured");
  }
  return createClient(supabaseUrl, key);
}

/**
 * Create a Supabase client authenticated with the caller's JWT.
 * This satisfies RLS policies that check `auth.uid()` without
 * requiring the service role key.
 *
 * Use this for routes where the caller is an authenticated user
 * and the data operations should respect RLS.
 */
export function createUserSupabase(req: NextRequest) {
  const token = req.headers.get("authorization")?.slice(7) || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase not configured");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Verify the user session from the Authorization header.
 * Returns the authenticated user ID or null.
 *
 * Expects: Authorization: Bearer <access_token>
 */
export async function getAuthenticatedUserId(
  req: NextRequest
): Promise<string | null> {
  // In dev bypass mode, skip auth and use env-configured user
  if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true") {
    return process.env.DEV_BYPASS_USER_ID || "9ccc8eb5-7690-49c3-8f42-c09f083e6c37";
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) return null;

  // Create a client with the user's JWT to verify it
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
}

/**
 * Helper to return a 401 Unauthorized response.
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized. Provide a valid Bearer token in the Authorization header." },
    { status: 401 }
  );
}

/**
 * Verify a webhook secret for machine-to-machine endpoints.
 * Checks the X-Webhook-Secret header against WEBHOOK_SECRET env var.
 */
export function verifyWebhookSecret(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured = dev mode, allow through
    console.warn("WEBHOOK_SECRET not configured — allowing webhook without verification");
    return true;
  }
  const provided = req.headers.get("x-webhook-secret");
  if (!provided) return false;
  return safeCompare(provided, secret);
}

/**
 * Verify an API key for external tool access.
 * Checks the X-API-Key header against TASKBOARD_API_KEY env var.
 * Fails closed — returns false if the env var is not configured.
 */
export function verifyApiKey(req: NextRequest): boolean {
  const key = process.env.TASKBOARD_API_KEY;
  if (!key) {
    console.warn("TASKBOARD_API_KEY not configured — rejecting request");
    return false;
  }
  const provided = req.headers.get("x-api-key");
  if (!provided) return false;
  return safeCompare(provided, key);
}

/**
 * Helper to return a 403 Forbidden response for invalid API keys.
 */
export function forbiddenResponse() {
  return NextResponse.json(
    { error: "Forbidden. Provide a valid API key in the X-API-Key header." },
    { status: 403 }
  );
}
