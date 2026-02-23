"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleSignIn() {
    try {
      setError(null);
      setLoading(true);
      await signInWithGoogle();
    } catch {
      setError("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleClearCache() {
    setClearing(true);
    try {
      await supabase.auth.signOut();
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sb-") || key.includes("supabase")) {
          localStorage.removeItem(key);
        }
      }
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith("sb-") || key.includes("supabase")) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Best-effort cleanup
    }
    setClearing(false);
    setError(null);
    // Force full page reload to reinitialize auth cleanly
    window.location.reload();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm mx-auto px-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)" }}
          >
            <span className="text-white font-black text-lg">TB</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">TASKBOARD</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 text-center mb-2">Welcome back</h2>
          <p className="text-sm text-gray-400 text-center mb-6">Sign in to manage your team&apos;s tasks</p>

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-all focus:ring-2 focus:ring-cyan-200 focus:outline-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loading ? "Signing in..." : "Sign in with Google"}
          </button>

          {error && (
            <p className="text-xs text-red-500 text-center mt-3">{error}</p>
          )}
        </div>

        <div className="text-center mt-6 space-y-2">
          <p className="text-xs text-gray-300">
            Only team members with authorized Google accounts can sign in.
          </p>
          <button
            onClick={handleClearCache}
            disabled={clearing}
            className="text-xs text-gray-300 hover:text-cyan-600 transition-colors disabled:opacity-50"
          >
            {clearing ? "Clearing..." : "Trouble signing in? Clear cache"}
          </button>
        </div>
      </div>
    </div>
  );
}
