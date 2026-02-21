/**
 * Authenticated API client for frontend → backend calls.
 *
 * Wraps `fetch` with a Bearer token from the current Supabase session.
 * In DEV_BYPASS mode the token is omitted and the server-side auth
 * middleware accepts the request without verification.
 *
 * Automatic retry on 401: if the first request returns 401 Unauthorized
 * the client refreshes the session once and retries with the new token.
 *
 * Usage:
 *   import { apiFetch } from "@/lib/api-client";
 *   const res = await apiFetch("/api/email/drafts", { method: "POST", body: ... });
 */

import { supabase } from "./supabase";

const DEV_BYPASS_AUTH = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

/**
 * Retrieve the current access token from the Supabase session.
 * Returns null when no session exists or in DEV_BYPASS mode.
 */
async function getAccessToken(): Promise<string | null> {
  if (DEV_BYPASS_AUTH) return null;

  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Force-refresh the Supabase session and return the new access token.
 * Returns null if refresh fails.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (DEV_BYPASS_AUTH) return null;

  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return null;
    return data.session.access_token;
  } catch {
    return null;
  }
}

/**
 * Build a Headers object with the auth token and default Content-Type.
 */
function buildHeaders(init: RequestInit, token: string | null): Headers {
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Default to JSON content type when a body is provided
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

/**
 * A thin wrapper around `fetch` that automatically attaches
 * the Supabase JWT as an `Authorization: Bearer <token>` header.
 *
 * - Merges caller-provided headers with the auth header.
 * - Adds `Content-Type: application/json` when body is present and
 *   Content-Type hasn't been set explicitly.
 * - In DEV_BYPASS mode the Authorization header is skipped.
 * - On 401 response, refreshes the session and retries once.
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers = buildHeaders(init, token);

  const res = await fetch(url, { ...init, headers });

  // Retry once with refreshed token on 401
  if (res.status === 401 && !DEV_BYPASS_AUTH) {
    const newToken = await refreshAccessToken();
    if (newToken && newToken !== token) {
      const retryHeaders = buildHeaders(init, newToken);
      return fetch(url, { ...init, headers: retryHeaders });
    }
  }

  return res;
}
