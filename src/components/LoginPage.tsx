"use client";

import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();

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
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all focus:ring-2 focus:ring-cyan-200 focus:outline-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        <p className="text-xs text-gray-300 text-center mt-6">
          Only team members with authorized Google accounts can sign in.
        </p>
      </div>
    </div>
  );
}
