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

  // WORKAROUND: Patch _getAccessToken to read from localStorage directly.
  // The default implementation calls auth.getSession() which hangs due to
  // a Supabase SDK v2.95+ bug where the internal _initialize() promise stalls.
  // This ensures ALL PostgREST queries (from store.ts, etc.) get the correct
  // JWT auth header without depending on the SDK's internal auth state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientAny = client as any;
  const originalGetAccessToken = clientAny._getAccessToken;
  clientAny._getAccessToken = async function () {
    // First try reading from localStorage (instant, no SDK dependency)
    const storedToken = getAccessTokenFromStorage();
    if (storedToken) return storedToken;

    // Fallback: try the original method with a 2s timeout
    // (covers the case where SDK auth actually works, e.g. after OAuth redirect)
    if (typeof originalGetAccessToken === "function") {
      try {
        const result = await Promise.race([
          originalGetAccessToken.call(this),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        if (result && typeof result === "string") return result;
      } catch {
        // Original method failed — fall through to anon key
      }
    }

    // Last resort: use anon key (for unauthenticated requests)
    return supabaseAnonKey;
  };

  return client;
}

export const supabase = createSupabaseClient();
