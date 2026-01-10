import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Route handler auth client (cookie-aware).
 *
 * Use this ONLY for reading the current user/session within a Route Handler.
 * For DB queries that should bypass RLS, keep using `createSupabaseServerClient`.
 */
export function createSupabaseAuthRouteClient(req: NextRequest): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      // Route handlers in this app only need to read auth; cookie refresh is handled elsewhere.
      // Keeping a no-op setter avoids Next.js cookie write constraints in this context.
      setAll() {},
    },
  });
}

