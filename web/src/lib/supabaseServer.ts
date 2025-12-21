import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// #region agent log
fetch('http://127.0.0.1:7242/ingest/507bda22-2ab8-4c67-b245-8738a4525e56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseServer.ts:module-init',message:'Module loading - checking env vars',data:{hasUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL,hasAnonKey:!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,hasServiceKey:!!process.env.SUPABASE_SERVICE_ROLE_KEY,urlValue:process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0,30)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const USING_SERVICE_ROLE = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL for Supabase client");
}

if (!SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) for Supabase client");
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

