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

  const pathname = request.nextUrl.pathname;
  const otpMode = request.nextUrl.searchParams.get("mode");
  const otpEmail = request.nextUrl.searchParams.get("email");
  const isOtpDeepLink = pathname === "/" && otpMode === "otp" && !!otpEmail;

  // Dev bypass should not force routing.
  const devAuthBypass =
    process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // If env vars are not configured, do not crash middleware; allow app to surface its own errors.
  if (!url || !publicKey || devAuthBypass) return response;

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // IMPORTANT: Never redirect API routes to HTML pages (breaks fetch JSON callers).
  if (pathname.startsWith("/api")) return response;

  // Server-side routing gate to avoid a flash-of-app on initial load:
  // - Unauthenticated UI requests redirect to /splash
  // - Authenticated users visiting /splash redirect to /
  if (pathname === "/splash") {
    if (user) {
      const target = request.nextUrl.clone();
      target.pathname = "/";
      const redirect = NextResponse.redirect(target);
      // Preserve any refreshed Set-Cookie headers.
      const setCookies =
        typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
          ? (response.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
          : [];
      for (const sc of setCookies) redirect.headers.append("set-cookie", sc);
      return redirect;
    }
    return response;
  }

  if (!user) {
    if (isOtpDeepLink) {
      return response;
    }
    const target = request.nextUrl.clone();
    target.pathname = "/splash";
    const redirect = NextResponse.redirect(target);
    const setCookies =
      typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
        ? (response.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [];
    for (const sc of setCookies) redirect.headers.append("set-cookie", sc);
    return redirect;
  }

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

