"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/");
    });

    // Timeout: if nothing happens in 10s, show error
    const timeout = setTimeout(() => {
      setError("Sign-in timed out. Please try again.");
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div
          className="w-10 h-10 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)" }}
        >
          <span className="text-white font-black text-sm">TB</span>
        </div>
        {error ? (
          <>
            <p className="text-red-500 text-sm font-medium mb-3">{error}</p>
            <a
              href="/"
              className="text-sm font-bold text-cyan-600 hover:text-cyan-700 transition-colors"
            >
              Back to login
            </a>
          </>
        ) : (
          <p className="text-gray-500 text-sm font-medium">Signing you in...</p>
        )}
      </div>
    </div>
  );
}
