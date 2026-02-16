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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchOrUpsertPublicUser(session).then((user) => {
          setCurrentUser(user);
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          const user = await fetchOrUpsertPublicUser(session);
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
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
