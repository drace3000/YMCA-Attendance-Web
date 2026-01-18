import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookiePair = { name: string; value: string };

function parseCookieHeader(header: string | null): CookiePair[] {
  if (!header) return [];

  // Very small cookie parser (sufficient for Supabase auth cookies).
  // Example header: "a=b; sb-access-token=...; sb-refresh-token=..."
  const parts = header.split(";").map((p) => p.trim()).filter(Boolean);
  const cookies: CookiePair[] = [];

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (!name) continue;
    cookies.push({ name, value });
  }

  return cookies;
}

function getCookies(req: Request): CookiePair[] {
  // In Next.js Route Handlers, `req` is typically a NextRequest at runtime which
  // exposes `cookies.getAll()`. But many handlers type the parameter as `Request`.
  // Support both by falling back to parsing the Cookie header.
  const maybe = req as unknown as { cookies?: { getAll?: () => CookiePair[] } };
  const getAll = maybe.cookies?.getAll;
  if (typeof getAll === "function") return getAll.call(maybe.cookies);

  return parseCookieHeader(req.headers.get("cookie"));
}

/**
 * Route handler auth client (cookie-aware).
 *
 * Use this ONLY for reading the current user/session within a Route Handler.
 * For DB queries that should bypass RLS, keep using `createSupabaseServerClient`.
 */
export function createSupabaseAuthRouteClient(req: Request): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }
  if (!publicKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) environment variable."
    );
  }

  return createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return getCookies(req);
      },
      // Route handlers in this app only need to read auth; cookie refresh is handled elsewhere.
      // Keeping a no-op setter avoids Next.js cookie write constraints in this context.
      setAll() {},
    },
  });
}

