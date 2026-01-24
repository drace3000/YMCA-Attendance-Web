"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword, signOut } from "@/lib/supabaseClient";

const EASTSIDE_BRANCH_ID = "26d6acb8-5acf-4a32-ac24-343f30b1442c";
const EASTSIDE_BRANCH_NAME = "Eastside Family YMCA";

type RecipientAccessResponse = {
  recipient: {
    recipient_type: "Administrator" | "Branch";
    branch_id: string;
  };
  branch: { id: string; name: string } | null;
};

export default function SplashPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const { error: signInError } = await signInWithPassword(email.trim(), password);
        if (signInError) {
          setError(signInError.message ?? "Unable to sign in.");
          return;
        }

        const res = await fetch("/api/auth/recipient-access");
        if (!res.ok) {
          setError("Unable to verify access. Please try again.");
          await signOut();
          return;
        }
        const data = (await res.json()) as RecipientAccessResponse;
        const branchName = data.branch?.name?.trim();
        const branchId = data.branch?.id;
        const isAdmin = data.recipient.recipient_type === "Administrator";
        const isEastside =
          (branchId && branchId === EASTSIDE_BRANCH_ID) ||
          (branchName && branchName.toLowerCase() === EASTSIDE_BRANCH_NAME.toLowerCase());

        // Admin is restricted to Eastside; Branch users are allowed.
        if (isAdmin && !isEastside) {
          setError("Admin access restricted to Eastside Family YMCA.");
          await signOut();
          return;
        }

        router.replace("/");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [email, password, router],
  );

  return (
    <div
      className="relative min-h-screen w-full bg-slate-900 text-foreground"
      style={{
        backgroundImage: "url('/EZ-Attendance.Splash.AWD.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground/80">
              EZ-ATTENDANCE
            </p>
            <h1 className="text-2xl font-bold text-white">Sign in</h1>
            <p className="mt-1 text-sm text-foreground/70">
              Admin access is restricted to Eastside Family YMCA.
            </p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-medium text-foreground/80">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-foreground shadow-inner focus:border-[var(--cta)] focus:outline-none"
                placeholder="you@example.com"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-foreground/80">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-foreground shadow-inner focus:border-[var(--cta)] focus:outline-none"
                placeholder="••••••••"
              />
            </label>
            {error ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
