"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Parse the OAuth hash fragment that Supabase appends to the callback URL.
 * Format: #access_token=...&refresh_token=...&expires_in=3600&token_type=bearer&type=signup
 * The SDK's _initialize() is supposed to do this, but it hangs (see Issue #1594).
 */
function parseHashSession(): { access_token: string; refresh_token: string; expires_in: number; user?: unknown } | null {
  try {
    const hash = window.location.hash.substring(1); // remove leading #
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return null;
    return {
      access_token,
      refresh_token,
      expires_in: parseInt(params.get("expires_in") || "3600", 10),
    };
  } catch {
    return null;
  }
}

/**
 * Store session tokens in localStorage so the rest of the app can read them.
 * Mirrors the format the Supabase SDK uses internally.
 */
async function storeSessionViaRest(tokens: { access_token: string; refresh_token: string; expires_in: number }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  // Fetch the user profile from the access token
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });
  if (!userRes.ok) return false;
  const user = await userRes.json();

  // Store in localStorage using Supabase's expected format
  const projectRef = url.replace("https://", "").split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const stored = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    token_type: "bearer",
    user,
  };
  localStorage.setItem(storageKey, JSON.stringify(stored));
  return true;
}

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    // Check for OAuth error in URL params
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    const errorDescription = params.get("error_description");
    if (errorParam) {
      setError(errorDescription || errorParam);
      return;
    }

    let redirected = false;

    function doRedirect() {
      if (!redirected) {
        redirected = true;
        router.replace("/");
      }
    }

    // ── LAYER 1: Parse hash fragment directly (instant, no SDK) ──
    // After Google OAuth, Supabase redirects to /auth/callback#access_token=...
    // The SDK normally parses this, but _initialize() can hang.
    const hashTokens = parseHashSession();
    if (hashTokens) {
      storeSessionViaRest(hashTokens)
        .then((ok) => {
          if (ok) {
            // Clear hash from URL to prevent re-processing
            window.history.replaceState(null, "", window.location.pathname);
            doRedirect();
          }
        })
        .catch(() => { /* fall through to SDK layers */ });
    }

    // ── LAYER 2: SDK listener (may work if _initialize doesn't hang) ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        doRedirect();
      }
    });

    // ── LAYER 3: getSession() with timeout ──
    Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]).then((result) => {
      if (result) {
        const sess = (result as { data: { session: unknown } }).data.session;
        if (sess) doRedirect();
      }
    });

    // Timeout: if nothing works in 15s, show error
    const timeout = setTimeout(() => {
      if (!redirected) {
        setError("Sign-in timed out. This usually means a stale session is stuck in your browser.");
      }
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  async function handleClearAndRetry() {
    setClearing(true);
    try {
      // Sign out to clear any stale session tokens
      await supabase.auth.signOut();
      // Clear all Supabase-related localStorage entries
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sb-") || key.includes("supabase")) {
          localStorage.removeItem(key);
        }
      }
      // Also clear sessionStorage
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith("sb-") || key.includes("supabase")) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Best-effort cleanup
    }
    // Redirect to login with a clean slate
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center max-w-sm mx-auto px-6">
        <div
          className="w-10 h-10 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)" }}
        >
          <span className="text-white font-black text-sm">TB</span>
        </div>
        {error ? (
          <>
            <p className="text-red-500 text-sm font-medium mb-2">{error}</p>
            <p className="text-xs text-gray-400 mb-4">
              Click below to clear your session cache and try again.
            </p>
            <button
              onClick={handleClearAndRetry}
              disabled={clearing}
              className="px-4 py-2 bg-cyan-500 text-white text-sm font-bold rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors mb-3"
            >
              {clearing ? "Clearing..." : "Clear cache & retry"}
            </button>
            <br />
            <a
              href="/"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Back to login
            </a>
          </>
        ) : (
          <>
            <p className="text-gray-500 text-sm font-medium">Signing you in...</p>
            <div className="mt-3 w-6 h-6 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin mx-auto" />
          </>
        )}
      </div>
    </div>
  );
}
