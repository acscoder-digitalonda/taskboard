import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  return provided === secret;
}
