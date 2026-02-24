"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.replace("/");
      }
    });

    // Fallback: if session already exists, redirect immediately
    // Wrap with timeout — getSession() can hang due to Supabase SDK bug
    Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]).then((result) => {
      if (result) {
        const sess = (result as { data: { session: unknown } }).data.session;
        if (sess) router.replace("/");
      }
    });

    // Timeout: if nothing happens in 15s, show error
    const timeout = setTimeout(() => {
      setError("Sign-in timed out. This usually means a stale session is stuck in your browser.");
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
