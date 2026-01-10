"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase, signOut as supabaseSignOut } from "@/lib/supabaseClient";

// Dev bypass - skip Supabase entirely
// Set NEXT_PUBLIC_DEV_AUTH_BYPASS=true in .env.local ONLY if you explicitly want to bypass auth
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

// Mock user for dev bypass
const DEV_MOCK_USER: User = {
  id: "dev-user-00000000-0000-0000-0000-000000000000",
  email: "don.race@outlook.com",
  app_metadata: {},
  user_metadata: { full_name: "Dev User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  recipientContext: {
    recipient_type: "Administrator" | "Normal" | null;
    branch_id: string | null;
    association_id: string | null;
    alliance_id: string | null;
  };
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  devSignIn: (email?: string) => void; // Dev bypass sign-in with optional email
  isDevMode: boolean; // Flag to indicate dev bypass mode
  setRecipientContext: (ctx: {
    recipient_type: "Administrator" | "Normal" | null;
    branch_id: string | null;
    association_id: string | null;
    alliance_id: string | null;
  }) => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  recipientContext: { recipient_type: null, branch_id: null, association_id: null, alliance_id: null },
  loading: true,
  signOut: async () => {},
  refreshSession: async () => {},
  devSignIn: () => {},
  isDevMode: false,
  setRecipientContext: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Dev bypass: start with null user, use devSignIn to emulate login
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!DEV_AUTH_BYPASS); // Not loading if dev bypass
  const [recipientContext, setRecipientContext] = useState<{
    recipient_type: "Administrator" | "Normal" | null;
    branch_id: string | null;
    association_id: string | null;
    alliance_id: string | null;
  }>({ recipient_type: null, branch_id: null, association_id: null, alliance_id: null });

  const refreshSession = useCallback(async () => {
    if (DEV_AUTH_BYPASS) return; // Skip Supabase in dev mode
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
  }, []);

  useEffect(() => {
    // Dev bypass: skip all Supabase auth
    if (DEV_AUTH_BYPASS) {
      return;
    }

    // Get initial session
    const initSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    initSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    if (!DEV_AUTH_BYPASS) {
      await supabaseSignOut();
    }
    setUser(null);
    setSession(null);
    setRecipientContext({ recipient_type: null, branch_id: null, association_id: null, alliance_id: null });
  }, []);

  // Dev bypass sign-in - sets mock user without Supabase
  const devSignIn = useCallback((email?: string) => {
    if (DEV_AUTH_BYPASS) {
      const mockUser: User = {
        ...DEV_MOCK_USER,
        email: email || DEV_MOCK_USER.email,
      };
      setUser(mockUser);
      setSession(null); // No real session, but user is set
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        recipientContext,
        loading,
        signOut: handleSignOut,
        refreshSession,
        devSignIn,
        isDevMode: DEV_AUTH_BYPASS,
        setRecipientContext,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}


