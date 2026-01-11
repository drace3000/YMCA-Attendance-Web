import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const USING_SERVICE_ROLE = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL for Supabase client");
}

if (!SUPABASE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) for Supabase client"
  );
}

// Warn if using anon key - RLS will be enforced and admin queries may fail
if (!USING_SERVICE_ROLE && process.env.NODE_ENV === "development") {
  console.warn(
    "[supabaseServer] WARNING: Using ANON key instead of SERVICE_ROLE key. " +
    "RLS policies will be enforced. Set SUPABASE_SERVICE_ROLE_KEY in .env.local for admin access."
  );
}

// Server-side Supabase client (no session persistence needed for API routes).
export function createSupabaseServerClient(): SupabaseClient {
  // Non-null assertions are safe due to the module-level invariant checks above.
  return createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "ymca-web-api",
      },
    },
  });
}

