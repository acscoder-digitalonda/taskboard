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
    phone: (row.phone as string) || undefined,
  };
}

interface AuthContextValue {
  session: Session | null;
  currentUser: User | null;
  isLoading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<User, "name" | "role" | "description" | "color" | "phone">>) => Promise<void>;
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
    let authResolved = false; // Track whether auth has been definitively resolved

    function resolveAuth() {
      if (!authResolved && !cancelled) {
        authResolved = true;
        setIsLoading(false);
      }
    }

    // Track which user was restored by Layer 1 to avoid duplicate fetches
    let initialRestoredUserId: string | null = null;

    /**
     * LAYER 1: Read session from localStorage directly.
     * Does NOT call any Supabase SDK methods — pure localStorage read.
     * The Supabase SDK's getSession()/setSession() both hang due to a bug
     * in v2.95+ where the internal _initialize() promise stalls.
     */
    function readSessionFromLocalStorage(): Session | null {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!url) return null;
        const projectRef = url.replace("https://", "").split(".")[0];
        const storageKey = `sb-${projectRef}-auth-token`;
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;

        const stored = JSON.parse(raw);
        if (!stored.access_token || !stored.refresh_token || !stored.user) return null;

        // Check if token is expired (with 60s grace for clock drift)
        const expiresAt = stored.expires_at;
        if (expiresAt && expiresAt * 1000 < Date.now() - 60000) {
          console.warn("[auth] Stored token expired, clearing");
          localStorage.removeItem(storageKey);
          return null;
        }

        return {
          access_token: stored.access_token,
          refresh_token: stored.refresh_token,
          expires_in: stored.expires_in || 3600,
          expires_at: stored.expires_at,
          token_type: stored.token_type || "bearer",
          user: stored.user,
        } as Session;
      } catch (err) {
        console.warn("[auth] readSessionFromLocalStorage error:", err);
        return null;
      }
    }

    /**
     * LAYER 3: Fetch user profile via direct REST call.
     * Bypasses the Supabase JS client entirely — uses fetch() with
     * the access_token from localStorage as Authorization header.
     * PostgREST validates the JWT independently of the JS client.
     */
    async function fetchUserViaRest(sess: Session): Promise<User | null> {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return null;

      const authUser = sess.user;
      const email = authUser.email?.toLowerCase();
      if (!email) return null;

      // Check allowed_emails via REST
      try {
        const allowRes = await fetch(
          `${url}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${sess.access_token}` } }
        );
        if (allowRes.ok) {
          const rows = await allowRes.json();
          if (rows.length === 0) {
            // Email not allowed — but check domain fallback
            const domain = email.split("@")[1];
            if (!domain || !FALLBACK_ALLOWED_DOMAINS.includes(domain)) return null;
          }
        }
        // If fetch failed (table might not exist), fall through to domain check
      } catch {
        const domain = email.split("@")[1];
        if (!domain || !FALLBACK_ALLOWED_DOMAINS.includes(domain)) return null;
      }

      // Fetch user profile via REST
      try {
        const userRes = await fetch(
          `${url}/rest/v1/users?id=eq.${authUser.id}&select=*&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${sess.access_token}` } }
        );
        if (userRes.ok) {
          const rows = await userRes.json();
          if (rows.length > 0) return mapRowToUser(rows[0]);
        }
      } catch {
        // Fall through to upsert
      }

      // User doesn't exist yet — upsert via REST
      try {
        const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split("@")[0] || "User";
        const initials = generateInitials(name);
        const color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
        const upsertRes = await fetch(`${url}/rest/v1/users`, {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${sess.access_token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation,resolution=merge-duplicates",
          },
          body: JSON.stringify({
            id: authUser.id, email: authUser.email, name, initials, color,
            avatar_url: authUser.user_metadata?.avatar_url || null, role: "member",
          }),
        });
        if (upsertRes.ok) {
          const rows = await upsertRes.json();
          if (rows.length > 0) return mapRowToUser(rows[0]);
        }
      } catch {
        // Failed to upsert
      }

      return null;
    }

    /**
     * BACKGROUND SYNC: Try to get the Supabase JS client into a good state.
     * Fire-and-forget — if it hangs, the app already works because Layer 1
     * resolved the UI. If it succeeds, subsequent store.ts/realtime queries
     * benefit from the SDK's internal auth state.
     */
    function syncSupabaseClient(sess: Session) {
      Promise.race([
        supabase.auth.setSession({
          access_token: sess.access_token,
          refresh_token: sess.refresh_token,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
      ])
        .then((result: unknown) => {
          if (cancelled) return;
          const { data, error } = result as { data: { session: Session | null }; error: unknown };
          if (data?.session) {
            setSession(data.session); // Update with potentially refreshed session
          }
          if (error) console.warn("[auth] syncSupabaseClient error:", error);
        })
        .catch(() => {
          // Timed out or failed — not critical, Layer 1 already resolved
        });
    }

    async function initAuth() {
      try {
        if (DEV_BYPASS_AUTH) {
          const user = await fetchDevBypassUser();
          if (!cancelled) setCurrentUser(user);
          resolveAuth();
          return;
        }

        // ========================================
        // LAYER 1: Instant localStorage read (0ms)
        // ========================================
        const storedSession = readSessionFromLocalStorage();

        if (storedSession?.user) {
          // Set session immediately — user sees the app, not login page
          if (!cancelled) setSession(storedSession);

          // LAYER 2: Try SDK-based user fetch (3s timeout)
          let user: User | null = null;
          try {
            user = await Promise.race([
              fetchOrUpsertPublicUser(storedSession),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ]) as User | null;
          } catch {
            // SDK call failed — fall through to Layer 3
          }

          // LAYER 3: REST fallback for user profile
          if (!user && !cancelled) {
            try {
              user = await fetchUserViaRest(storedSession);
            } catch (err) {
              console.warn("[auth] fetchUserViaRest failed:", err);
            }
          }

          if (!cancelled && user) {
            setCurrentUser(user);
            setAuthError(null);
            initialRestoredUserId = user.id;
            resolveAuth();
          } else if (!cancelled) {
            // Token exists but user fetch failed — may be invalid
            setSession(null);
            resolveAuth();
          }

          // BACKGROUND: Sync Supabase client (non-blocking)
          if (!cancelled) syncSupabaseClient(storedSession);
          return;
        }

        // ========================================
        // NO STORED TOKEN: User genuinely not logged in
        // ========================================
        // Still try getSession() briefly in case of OAuth redirect
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);

        if (cancelled) return;

        const sdkSession = sessionResult
          ? (sessionResult as { data: { session: Session | null } }).data.session
          : null;

        if (sdkSession?.user) {
          setSession(sdkSession);
          try {
            const user = await fetchOrUpsertPublicUser(sdkSession);
            if (!cancelled) {
              setCurrentUser(user);
              setAuthError(null);
            }
          } catch (err) {
            console.warn("[auth] New session user fetch failed:", err);
          }
        }

        resolveAuth();
      } catch (err) {
        console.error("[auth] initAuth failed:", err);
        if (!cancelled) {
          setAuthError(err instanceof Error ? err.message : "Sign-in failed");
          setCurrentUser(null);
          setSession(null);
        }
        resolveAuth();
      }
    }

    initAuth();

    // In DEV_BYPASS mode, skip auth state listener
    if (DEV_BYPASS_AUTH) {
      return () => { cancelled = true; };
    }

    // onAuthStateChange: handles new sign-ins, sign-outs, and token refreshes.
    // If Layer 1 already restored the same user, skip the duplicate fetch.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (cancelled) return;

        // Skip redundant fetch if Layer 1 already restored this user
        if (newSession?.user?.id === initialRestoredUserId && authResolved) {
          setSession(newSession); // Still update session (may be refreshed)
          return;
        }

        setSession(newSession);
        if (newSession?.user) {
          try {
            const user = await fetchOrUpsertPublicUser(newSession);
            if (!cancelled) {
              setCurrentUser(user);
              setAuthError(null);
            }
          } catch (err) {
            console.error("[auth] onAuthStateChange user fetch failed:", err);
            if (!cancelled) {
              setAuthError(err instanceof Error ? err.message : "Sign-in failed");
              setCurrentUser(null);
              setSession(null);
            }
          }
        } else {
          setCurrentUser(null);
        }
        resolveAuth();
      }
    );

    /**
     * MANUAL TOKEN REFRESH via Supabase REST API.
     * Bypasses the SDK entirely (which hangs on getSession/_initialize).
     * Uses the refresh_token from localStorage to get a fresh access_token.
     */
    async function refreshTokenViaRest(): Promise<Session | null> {
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

        if (!res.ok) {
          console.warn("[auth] Token refresh failed:", res.status);
          return null;
        }

        const refreshed = await res.json();
        if (!refreshed.access_token || !refreshed.refresh_token || !refreshed.user) return null;

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

        return {
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_in: refreshed.expires_in || 3600,
          expires_at: refreshed.expires_at,
          token_type: refreshed.token_type || "bearer",
          user: refreshed.user,
        } as Session;
      } catch (err) {
        console.warn("[auth] refreshTokenViaRest error:", err);
        return null;
      }
    }

    // Refresh session when user returns to the app (visibility change)
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !cancelled) {
        // Use our REST-based refresh instead of SDK's getSession (which hangs)
        refreshTokenViaRest().then((freshSession) => {
          if (freshSession && !cancelled) {
            setSession(freshSession);
            // Also try to sync SDK in background (non-blocking)
            syncSupabaseClient(freshSession);
          }
        }).catch(() => { /* silent */ });
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Proactive token refresh: refresh 5 minutes before expiry.
    // Supabase JWTs default to 1 hour — this keeps the session alive
    // as long as the tab is open, even if the user doesn't switch away and back.
    const refreshInterval = setInterval(() => {
      if (cancelled) return;
      const storedSession = readSessionFromLocalStorage();
      if (!storedSession?.expires_at) return;

      const expiresInMs = storedSession.expires_at * 1000 - Date.now();
      // Refresh when less than 5 minutes remain
      if (expiresInMs < 5 * 60 * 1000) {
        refreshTokenViaRest().then((freshSession) => {
          if (freshSession && !cancelled) {
            setSession(freshSession);
            syncSupabaseClient(freshSession);
          }
        }).catch(() => { /* silent */ });
      }
    }, 60_000); // Check every minute

    // Ultimate fallback: Layer 1 should resolve in <500ms, so 5s is generous
    const ultimateTimeout = setTimeout(() => {
      if (!authResolved && !cancelled) {
        console.warn("[auth] Ultimate timeout — showing login");
        resolveAuth();
      }
    }, 5000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(refreshInterval);
      clearTimeout(ultimateTimeout);
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

  async function updateProfile(updates: Partial<Pick<User, "name" | "role" | "description" | "color" | "phone">>) {
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
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;

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
