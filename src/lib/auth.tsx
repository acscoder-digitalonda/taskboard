"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { User } from "@/types";

const ACCENT_COLORS = [
  "#00BCD4", "#E91E63", "#FFD600", "#9C27B0", "#FF5722",
  "#4CAF50", "#2196F3", "#FF9800", "#795548", "#607D8B",
];

function generateInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AuthContextValue {
  session: Session | null;
  currentUser: User | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  currentUser: null,
  isLoading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

async function fetchOrUpsertPublicUser(session: Session): Promise<User | null> {
  const authUser = session.user;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (data) {
    // Update name/avatar if changed on Google's side
    const googleName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;
    const googleAvatar = authUser.user_metadata?.avatar_url;
    if (googleName && (data.name !== googleName || data.avatar_url !== googleAvatar)) {
      await supabase.from("users").update({
        name: googleName,
        avatar_url: googleAvatar,
      }).eq("id", authUser.id);
    }
    return {
      id: data.id,
      name: data.name,
      color: data.color,
      initials: data.initials,
      email: data.email,
      avatar_url: data.avatar_url,
    };
  }

  // Trigger hasn't fired yet — insert manually as fallback
  if (error) {
    const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "User";
    const initials = generateInitials(name);
    const color = ACCENT_COLORS[0];
    const { data: inserted } = await supabase.from("users").upsert({
      id: authUser.id,
      email: authUser.email,
      name,
      initials,
      color,
      avatar_url: authUser.user_metadata?.avatar_url || null,
    }).select().single();
    if (inserted) {
      return {
        id: inserted.id,
        name: inserted.name,
        color: inserted.color,
        initials: inserted.initials,
        email: inserted.email,
        avatar_url: inserted.avatar_url,
      };
    }
  }
  return null;
}

// DEV_BYPASS: Same flag as page.tsx. When true, use fallback user from DB.
const DEV_BYPASS_AUTH = true;
const DEV_BYPASS_USER_ID = "9ccc8eb5-7690-49c3-8f42-c09f083e6c37";

const DEV_FALLBACK_USER: User = {
  id: DEV_BYPASS_USER_ID,
  name: "Jordan Howard",
  color: "#00BCD4",
  initials: "JH",
  email: "jordan@digitalonda.com",
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
      const d = rows[0];
      return {
        id: d.id,
        name: d.name,
        color: d.color,
        initials: d.initials,
        email: d.email,
        avatar_url: d.avatar_url,
      };
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

        // Race getSession against a timeout to prevent infinite hangs
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);

        if (cancelled) return;

        const initialSession = sessionResult
          ? (sessionResult as { data: { session: Session | null } }).data.session
          : null;
        setSession(initialSession);

        if (initialSession?.user) {
          const user = await fetchOrUpsertPublicUser(initialSession);
          if (!cancelled) setCurrentUser(user);
        }
      } catch (err) {
        console.error("Auth init failed:", err);
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
            if (!cancelled) setCurrentUser(user);
          } catch (err) {
            console.error("Auth state change user fetch failed:", err);
          }
        } else {
          setCurrentUser(null);
        }
        if (!cancelled) setIsLoading(false);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setCurrentUser(null);
  }

  return (
    <AuthContext.Provider value={{ session, currentUser, isLoading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
