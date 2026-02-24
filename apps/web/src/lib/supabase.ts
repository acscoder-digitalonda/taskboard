import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  !!supabaseUrl && supabaseUrl.startsWith("http") && !!supabaseAnonKey;

/**
 * Read the access_token directly from localStorage.
 * This bypasses the Supabase SDK's internal auth state which can hang
 * due to a bug in v2.95+ where _initialize() stalls.
 */
function getAccessTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    const projectRef = url.replace("https://", "").split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (!stored.access_token) return null;
    // Check if token is expired (with 60s grace)
    if (stored.expires_at && stored.expires_at * 1000 < Date.now() - 60000) {
      return null;
    }
    return stored.access_token;
  } catch {
    return null;
  }
}

/**
 * Build a fetch wrapper that adds apikey + Authorization headers.
 * This replaces the SDK's internal `fetchWithAuth` which hangs because
 * it calls `_getAccessToken()` → `auth.getSession()` → stuck `_initialize()`.
 *
 * Our version reads the JWT from localStorage (instant, 0ms) and falls
 * back to the anon key for unauthenticated requests.
 */
function buildAuthFetch(supabaseKey: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const accessToken = getAccessTokenFromStorage() ?? supabaseKey;
    const headers = new Headers(init?.headers);
    if (!headers.has("apikey")) headers.set("apikey", supabaseKey);
    // Always set Authorization — override whatever fetchWithAuth may have set
    headers.set("Authorization", `Bearer ${accessToken}`);
    return globalThis.fetch(input, { ...init, headers });
  };
}

function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    // L8: Clearer warning during build / when env vars aren't set.
    console.warn(
      "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. " +
      "Using placeholder client — all DB calls will fail."
    );
    return createClient("https://placeholder.supabase.co", "placeholder");
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  // WORKAROUND for Supabase SDK v2.95+ bug:
  //
  // The SDK's internal `fetchWithAuth` wraps every REST request with:
  //   const accessToken = await _getAccessToken();  // calls auth.getSession()
  // But auth.getSession() hangs because _initialize() stalls.
  //
  // We can't patch _getAccessToken because fetchWithAuth captured a bound
  // reference at construction time. We can't use global.fetch because
  // fetchWithAuth awaits _getAccessToken BEFORE calling our custom fetch.
  //
  // FIX: Replace client.fetch (the fetchWithAuth result) with our own fetch
  // that reads the JWT from localStorage directly. Then rebuild client.rest
  // (PostgrestClient) to use the new fetch. This bypasses the hung auth chain.
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientAny = client as any;
  const authFetch = buildAuthFetch(supabaseAnonKey);

  // Replace the client's fetch wrapper
  clientAny.fetch = authFetch;

  // Rebuild the REST client with our auth fetch
  // (PostgrestClient is constructed with: url, { headers, schema, fetch, timeout })
  if (clientAny.rest) {
    clientAny.rest.fetch = authFetch;
  }

  // Also patch the storage client's fetch
  if (clientAny.storage) {
    clientAny.storage.fetch = authFetch;
  }

  return client;
}

export const supabase = createSupabaseClient();
