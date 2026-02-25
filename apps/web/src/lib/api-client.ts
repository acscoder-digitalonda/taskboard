/**
 * Authenticated API client for frontend → backend calls.
 *
 * Wraps `fetch` with a Bearer token read directly from localStorage.
 *
 * IMPORTANT: We do NOT use supabase.auth.getSession() because the
 * Supabase SDK v2.95+ has a bug where _initialize() / getSession() can
 * hang indefinitely (Navigator Lock deadlock, Issue #1594). Instead we
 * read the JWT from localStorage (0ms, no SDK dependency) — the same
 * approach used by buildAuthFetch in supabase.ts.
 *
 * Automatic retry on 401: if the first request returns 401 Unauthorized,
 * refreshes the token via Supabase REST API and retries once.
 *
 * Usage:
 *   import { apiFetch } from "@/lib/api-client";
 *   const res = await apiFetch("/api/email/drafts", { method: "POST", body: ... });
 */

import { getAccessTokenFromStorage } from "./supabase";

const DEV_BYPASS_AUTH = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

/**
 * Retrieve the current access token from localStorage.
 * Instant (0ms) — no SDK calls, no async, no risk of hanging.
 */
function getAccessToken(): string | null {
  if (DEV_BYPASS_AUTH) return null;
  return getAccessTokenFromStorage();
}

/**
 * Refresh the token via Supabase REST API (bypasses SDK entirely).
 * Reads the refresh_token from localStorage, POSTs to /auth/v1/token,
 * and saves the new tokens back to localStorage.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (DEV_BYPASS_AUTH) return null;
  if (typeof window === "undefined") return null;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const projectRef = url.replace("https://", "").split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const stored = JSON.parse(raw);
    if (!stored.refresh_token) return null;

    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });

    if (!res.ok) return null;

    const refreshed = await res.json();
    if (!refreshed.access_token || !refreshed.refresh_token) return null;

    // Save refreshed tokens to localStorage
    const newStored = {
      ...stored,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      expires_in: refreshed.expires_in,
      user: refreshed.user,
    };
    localStorage.setItem(storageKey, JSON.stringify(newStored));

    return refreshed.access_token;
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
 * - Reads JWT from localStorage (instant, no SDK calls).
 * - Merges caller-provided headers with the auth header.
 * - Adds `Content-Type: application/json` when body is present and
 *   Content-Type hasn't been set explicitly.
 * - In DEV_BYPASS mode the Authorization header is skipped.
 * - On 401 response, refreshes the token via REST API and retries once.
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = getAccessToken();
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
