import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase SSR session bridge (cookies).
 *
 * Why this exists:
 * - Client-side Supabase auth can sign users in successfully, but many route handlers in this app
 *   read auth from cookies (`createSupabaseAuthRouteClient(req)` + `auth.getUser()`).
 * - Without a cookie-refresh proxy, Vercel/API requests can return 401 even though the UI shows "logged in".
 *
 * This middleware keeps the session cookies refreshed and ensures updated cookies are returned to the browser.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // If env vars are not configured, do not crash middleware; allow app to surface its own errors.
  if (!url || !publicKey) return response;

  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Make cookies available to downstream handlers within the same request.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // And persist them back to the browser.
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Triggers refresh/validation if a session cookie exists; no-op for anonymous users.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimizer)
     * - favicon.ico
     * - common image assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

