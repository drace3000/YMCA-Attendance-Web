"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Dev bypass - skip Supabase entirely
// TODO: Set to false for production
const DEV_AUTH_BYPASS = true;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Client-side Supabase client - only create if not in dev bypass mode
export const supabase: SupabaseClient = DEV_AUTH_BYPASS
  ? (null as unknown as SupabaseClient) // Dummy for dev bypass
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });

// Auth helper functions - all return early if dev bypass is enabled

// Sign in with email and password
export async function signInWithPassword(email: string, password: string) {
  if (DEV_AUTH_BYPASS) return { data: null, error: null };
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

// Sign up with email and password
export async function signUpWithPassword(email: string, password: string) {
  if (DEV_AUTH_BYPASS) return { data: null, error: null };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
}

// Send OTP for email verification
export async function signInWithOtp(email: string) {
  if (DEV_AUTH_BYPASS) return { error: null };
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
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  return { data, error };
}

export async function signOut() {
  if (DEV_AUTH_BYPASS) return { error: null };
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getSession() {
  if (DEV_AUTH_BYPASS) return { session: null, error: null };
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

export async function getUser() {
  if (DEV_AUTH_BYPASS) return { user: null, error: null };
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
}

export async function updateUserPassword(password: string) {
  if (DEV_AUTH_BYPASS) return { data: null, error: null };
  const { data, error } = await supabase.auth.updateUser({ password });
  return { data, error };
}