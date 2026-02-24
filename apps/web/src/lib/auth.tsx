"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { User, UserRole } from "@/types";
import { ACCENT_COLORS } from "./utils";

// ============================================
// Email allow list — checked against `allowed_emails` table in DB
// If the table is empty or doesn't exist, falls back to domain check
// ============================================
const FALLBACK_ALLOWED_DOMAINS = ["digitalonda.com"];

function generateInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function mapRowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    initials: row.initials as string,
    email: row.email as string | undefined,
    avatar_url: row.avatar_url as string | undefined,
    role: (row.role as UserRole) || "member",
    description: (row.description as string) || undefined,
  };
}

interface AuthContextValue {
  session: Session | null;
  currentUser: User | null;
  isLoading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<User, "name" | "role" | "description" | "color">>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  currentUser: null,
  isLoading: true,
  authError: null,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
});

async function fetchOrUpsertPublicUser(session: Session): Promise<User | null> {
  const authUser = session.user;

  // ── Email allow list check (DB-based) ────────────────────
  const email = authUser.email?.toLowerCase();
  if (!email) {
    await supabase.auth.signOut();
    throw new Error("No email associated with this account.");
  }

  // Check the allowed_emails table first
  const { data: allowEntry, error: allowError } = await supabase
    .from("allowed_emails")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  // If the table doesn't exist yet (allowError with code 42P01) or is empty,
  // fall back to domain-based check for backwards compatibility
  const tableNotReady = allowError && (allowError.code === "42P01" || allowError.message?.includes("does not exist"));

  if (tableNotReady) {
    // Fallback: domain whitelist
    const domain = email.split("@")[1];
    if (!domain || !FALLBACK_ALLOWED_DOMAINS.includes(domain)) {
      await supabase.auth.signOut();
      throw new Error(
        `Your account (${email}) is not authorized. Contact your admin to get access.`
      );
    }
  } else if (!allowEntry) {
    // Table exists but email not found
    await supabase.auth.signOut();
    throw new Error(
      `Your account (${email}) is not on the allow list. Contact your admin to get access.`
    );
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (data) {
    // Existing user — do NOT overwrite name/avatar (user may have customized them)
    return mapRowToUser(data);
  }

  // New user — insert with Google metadata as defaults
  if (error) {
    const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "User";
    const initials = generateInitials(name);
    const color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
    const { data: inserted } = await supabase.from("users").upsert({
      id: authUser.id,
      email: authUser.email,
      name,
      initials,
      color,
      avatar_url: authUser.user_metadata?.avatar_url || null,
      role: "member",
    }).select().single();
    if (inserted) {
      return mapRowToUser(inserted);
    }
  }
  return null;
}

// DEV_BYPASS: Set NEXT_PUBLIC_DEV_BYPASS_AUTH=true in .env.local for dev preview.
const DEV_BYPASS_AUTH = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";
const DEV_BYPASS_USER_ID = process.env.NEXT_PUBLIC_DEV_BYPASS_USER_ID || "9ccc8eb5-7690-49c3-8f42-c09f083e6c37";

// L3: Dev fallback user — no hardcoded org-specific values
const DEV_FALLBACK_USER: User = {
  id: DEV_BYPASS_USER_ID,
  name: "Dev User",
  color: "#00BCD4",
  initials: "DU",
  email: process.env.NEXT_PUBLIC_DEV_BYPASS_EMAIL || "dev@localhost",
};

async function fetchDevBypassUser(): Promise<User> {
  // Use direct REST call to avoid the Supabase JS client's internal auth
  // initialization which can hang when there's no active session.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return DEV_FALLBACK_USER;

    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${DEV_BYPASS_USER_ID}&select=*`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      }
    );
    if (!res.ok) return DEV_FALLBACK_USER;

    const rows = await res.json();
    if (rows.length > 0) {
      return mapRowToUser(rows[0]);
    }
  } catch (err) {
    console.warn("fetchDevBypassUser failed, using fallback:", err);
  }
  return DEV_FALLBACK_USER;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      try {
        // In DEV_BYPASS mode, skip the auth session check entirely — it can hang
        // when there's no active session and the Supabase auth client blocks.
        if (DEV_BYPASS_AUTH) {
          const user = await fetchDevBypassUser();
          if (!cancelled) setCurrentUser(user);
          return;
        }

        // Race getSession against a timeout to prevent infinite hangs.
        // 8s gives slow networks a fair chance while still recovering from
        // stale tokens that cause Supabase to hang indefinitely.
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);

        if (cancelled) return;

        const initialSession = sessionResult
          ? (sessionResult as { data: { session: Session | null } }).data.session
          : null;
        setSession(initialSession);

        if (initialSession?.user) {
          const user = await fetchOrUpsertPublicUser(initialSession);
          if (!cancelled) {
            setCurrentUser(user);
            setAuthError(null);
          }
        }
      } catch (err) {
        console.error("Auth init failed:", err);
        if (!cancelled) {
          setAuthError(err instanceof Error ? err.message : "Sign-in failed");
          setCurrentUser(null);
          setSession(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    initAuth();

    // In DEV_BYPASS mode, skip auth state listener — the Supabase auth client's
    // internal initialization can hang when there's no active session.
    if (DEV_BYPASS_AUTH) {
      return () => { cancelled = true; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (cancelled) return;
        setSession(session);
        if (session?.user) {
          try {
            const user = await fetchOrUpsertPublicUser(session);
            if (!cancelled) {
              setCurrentUser(user);
              setAuthError(null);
            }
          } catch (err) {
            console.error("Auth state change user fetch failed:", err);
            if (!cancelled) {
              setAuthError(err instanceof Error ? err.message : "Sign-in failed");
              setCurrentUser(null);
              setSession(null);
            }
          }
        } else {
          setCurrentUser(null);
        }
        if (!cancelled) setIsLoading(false);
      }
    );

    // Proactively refresh session when user returns to the app (e.g., opening
    // PWA after hours/days away). This prevents stale access tokens from causing
    // a logout — the SDK refreshes using the stored refresh token.
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !cancelled) {
        supabase.auth.getSession().then(({ data: { session: freshSession } }) => {
          if (freshSession && !cancelled) {
            setSession(freshSession);
          }
        }).catch(() => {
          // Silent — the onAuthStateChange listener will handle sign-out if needed
        });
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function signInWithGoogle() {
    setAuthError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          // Always show the Google account picker so users can switch accounts
          prompt: "select_account",
        },
      },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setCurrentUser(null);
    setAuthError(null);
    // Clear stale Supabase tokens from storage to prevent timeout on re-login
    try {
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
  }

  async function updateProfile(updates: Partial<Pick<User, "name" | "role" | "description" | "color">>) {
    if (!currentUser) return;

    // Build the DB update payload
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) {
      dbUpdates.name = updates.name;
      dbUpdates.initials = generateInitials(updates.name);
    }
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.color !== undefined) dbUpdates.color = updates.color;

    const { error } = await supabase
      .from("users")
      .update(dbUpdates)
      .eq("id", currentUser.id);

    if (error) throw new Error(error.message);

    // Update local state
    setCurrentUser((prev) =>
      prev
        ? {
            ...prev,
            ...updates,
            initials: updates.name ? generateInitials(updates.name) : prev.initials,
          }
        : null
    );
  }

  return (
    <AuthContext.Provider value={{ session, currentUser, isLoading, authError, signInWithGoogle, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
