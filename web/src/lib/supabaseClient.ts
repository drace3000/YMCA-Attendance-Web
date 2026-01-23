"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Dev bypass - skip Supabase entirely.
// Set NEXT_PUBLIC_DEV_AUTH_BYPASS=true in web/.env.local ONLY if you explicitly want to bypass auth.
const DEV_AUTH_BYPASS =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Support both legacy anon key and newer publishable keys.
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Client-side Supabase client.
//
// Note: We do NOT construct a real client if env vars are missing (common in tests).
export const supabase: SupabaseClient =
  !DEV_AUTH_BYPASS && supabaseUrl && supabasePublicKey
    ? createClient(supabaseUrl, supabasePublicKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : (null as unknown as SupabaseClient);

export function isSupabaseConfigured(): boolean {
  return !DEV_AUTH_BYPASS && !!supabaseUrl && !!supabasePublicKey;
}

function assertSupabaseConfigured(): void {
  if (DEV_AUTH_BYPASS) return;
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  if (!supabasePublicKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) environment variable."
    );
  }
}

// Auth helper functions - all return early if dev bypass is enabled

// Sign in with email and password
export async function signInWithPassword(email: string, password: string) {
  if (DEV_AUTH_BYPASS) return { data: null, error: null };
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

// Sign up with email and password
export async function signUpWithPassword(email: string, password: string) {
  if (DEV_AUTH_BYPASS) return { data: null, error: null };
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
}

// Send OTP for email verification
export async function signInWithOtp(email: string) {
  if (DEV_AUTH_BYPASS) return { error: null };
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // Don't create user, just send OTP
    },
  });
  return { error };
}

// Verify OTP code
export async function verifyOtp(email: string, token: string) {
  if (DEV_AUTH_BYPASS) return { data: null, error: null };
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  return { data, error };
}

export async function signOut() {
  if (DEV_AUTH_BYPASS) return { error: null };
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getSession() {
  if (DEV_AUTH_BYPASS) return { session: null, error: null };
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

export async function getUser() {
  if (DEV_AUTH_BYPASS) return { user: null, error: null };
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
}

export async function updateUserPassword(password: string) {
  if (DEV_AUTH_BYPASS) return { data: null, error: null };
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.updateUser({ password });
  return { data, error };
}