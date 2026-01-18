"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
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

const RECIPIENT_CONTEXT_STORAGE_KEY = "ymca-recipient-context-v1";

type RecipientContext = {
  recipient_type: "Administrator" | "Branch" | null;
  branch_id: string | null;
  association_id: string | null;
  alliance_id: string | null;
};

function readStoredRecipientContext(): RecipientContext {
  if (typeof window === "undefined") {
    return { recipient_type: null, branch_id: null, association_id: null, alliance_id: null };
  }
  if (typeof window.localStorage?.getItem !== "function") {
    return { recipient_type: null, branch_id: null, association_id: null, alliance_id: null };
  }
  try {
    const raw = window.localStorage.getItem(RECIPIENT_CONTEXT_STORAGE_KEY);
    if (!raw) return { recipient_type: null, branch_id: null, association_id: null, alliance_id: null };
    const parsed = JSON.parse(raw) as Partial<RecipientContext>;
    const recipient_type =
      parsed.recipient_type === "Administrator" || parsed.recipient_type === "Branch"
        ? parsed.recipient_type
        : null;
    return {
      recipient_type,
      branch_id: typeof parsed.branch_id === "string" ? parsed.branch_id : null,
      association_id: typeof parsed.association_id === "string" ? parsed.association_id : null,
      alliance_id: typeof parsed.alliance_id === "string" ? parsed.alliance_id : null,
    };
  } catch {
    return { recipient_type: null, branch_id: null, association_id: null, alliance_id: null };
  }
}

type AuthContextType = {
  user: User | null;
  session: Session | null;
  recipientContext: RecipientContext;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  devSignIn: (email?: string) => void; // Dev bypass sign-in with optional email
  isDevMode: boolean; // Flag to indicate dev bypass mode
  setRecipientContext: (ctx: RecipientContext) => void;
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
  const [recipientContext, setRecipientContextState] = useState<RecipientContext>(() =>
    readStoredRecipientContext()
  );

  const setRecipientContext = useCallback((ctx: RecipientContext) => {
    setRecipientContextState(ctx);
    if (typeof window === "undefined") return;
    if (typeof window.localStorage?.setItem !== "function") return;
    try {
      window.localStorage.setItem(RECIPIENT_CONTEXT_STORAGE_KEY, JSON.stringify(ctx));
    } catch {
      // ignore
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (DEV_AUTH_BYPASS) return; // Skip Supabase in dev mode

    const auth = (supabase as any)?.auth;
    if (!auth) {
      // Avoid hard crash if env vars are missing / Supabase client is not configured.
      // This can happen if NEXT_PUBLIC_SUPABASE_* vars are missing at runtime.
      console.error(
        "[AuthProvider] Supabase client not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
      );
      setSession(null);
      setUser(null);
      setLoading(false);
      return;
    }

    const { data } = await auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
  }, []);

  useEffect(() => {
    // Dev bypass: skip all Supabase auth
    if (DEV_AUTH_BYPASS) {
      return;
    }

    const auth = (supabase as any)?.auth;
    if (!auth) {
      console.error(
        "[AuthProvider] Supabase client not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
      );
      setLoading(false);
      return;
    }

    // Get initial session
    const initSession = async () => {
      const { data } = await auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    initSession();

    // Listen for auth changes
    const { data: { subscription } } = auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
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
    if (typeof window !== "undefined" && typeof window.localStorage?.removeItem === "function") {
      try {
        window.localStorage.removeItem(RECIPIENT_CONTEXT_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
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


