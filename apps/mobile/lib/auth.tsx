import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';

interface User {
  id: string;
  name: string;
  color: string;
  initials: string;
  email?: string;
  avatar_url?: string;
}

interface AuthContextType {
  session: Session | null;
  currentUser: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  currentUser: null,
  isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUser(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUser(session.user.id);
      } else {
        setCurrentUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchUser(authId: string) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', authId)
      .single();

    if (data) {
      setCurrentUser({
        id: data.id,
        name: data.name,
        color: data.color,
        initials: data.initials,
        email: data.email,
        avatar_url: data.avatar_url,
      });
    }
    setIsLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setCurrentUser(null);
  }

  return (
    <AuthContext.Provider value={{ session, currentUser, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
