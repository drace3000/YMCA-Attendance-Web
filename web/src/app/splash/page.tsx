"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signInWithPassword, signOut } from "@/lib/supabaseClient";
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const EASTSIDE_BRANCH_ID = "26d6acb8-5acf-4a32-ac24-343f30b1442c";
const EASTSIDE_BRANCH_NAME = "Eastside Family YMCA";
const SPLASH_IMAGE_ASPECT = 1.5; // 1536 / 1024

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
  const [loginOpen, setLoginOpen] = useState(false);
  const [signInHintOpen, setSignInHintOpen] = useState(false);
  const [footerTooltipOpen, setFooterTooltipOpen] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startDx: number;
    startDy: number;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const clampDrag = useCallback((dx: number, dy: number): { dx: number; dy: number } => {
    const el = dialogRef.current;
    if (!el) return { dx, dy };
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const margin = 16;
    const maxDx = Math.max(0, window.innerWidth / 2 - width / 2 - margin);
    const maxDy = Math.max(0, window.innerHeight / 2 - height / 2 - margin);
    return {
      dx: Math.min(maxDx, Math.max(-maxDx, dx)),
      dy: Math.min(maxDy, Math.max(-maxDy, dy)),
    };
  }, []);

  useEffect(() => {
    if (!loginOpen) return;
    const onResize = () => {
      setDragOffset((prev) => clampDrag(prev.dx, prev.dy));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampDrag, loginOpen]);

  useEffect(() => {
    if (!loginOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLoginOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loginOpen]);

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
          setError("Not authorized.");
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

  const openLogin = useCallback(() => {
    setError(null);
    setLoading(false);
    setDragOffset({ dx: 0, dy: 0 });
    setLoginOpen(true);
  }, []);

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!loginOpen) return;
      draggingRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startDx: dragOffset.dx,
        startDy: dragOffset.dy,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [dragOffset.dx, dragOffset.dy, loginOpen],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = draggingRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      const next = clampDrag(
        state.startDx + (e.clientX - state.startX),
        state.startDy + (e.clientY - state.startY),
      );
      setDragOffset(next);
    },
    [clampDrag],
  );

  const handleDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = draggingRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    draggingRef.current = null;
  }, []);

  return (
    <div className="relative min-h-[100svh] w-full overflow-hidden bg-black text-foreground">
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/50 via-black/25 to-black/55" />

      {/* Splash image stage (maintains image aspect ratio) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative"
          style={{
            width: `min(100vw, calc(100svh * ${SPLASH_IMAGE_ASPECT}))`,
            height: `min(100svh, calc(100vw / ${SPLASH_IMAGE_ASPECT}))`,
          }}
        >
          <Image
            src="/EZ-Attendance.Splash.AWD.png"
            alt=""
            fill
            priority
            aria-hidden="true"
            className="object-contain"
          />

          {/* Main graphic hotspot (click to sign in) */}
          {!loginOpen ? (
            <Popover modal={false} open={signInHintOpen} onOpenChange={setSignInHintOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Click to sign in"
                  onClick={openLogin}
                  onMouseEnter={() => setSignInHintOpen(true)}
                  onMouseLeave={() => setSignInHintOpen(false)}
                  onFocus={() => setSignInHintOpen(true)}
                  onBlur={() => setSignInHintOpen(false)}
                  className="absolute inset-x-0 top-0 bottom-[12%] z-10 -translate-y-[5px] cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cta)]/60"
                />
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={10}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="w-auto rounded-xl border border-border bg-popover px-3 py-2 text-sm font-semibold text-foreground shadow-xl"
              >
                <span className="text-[var(--cta)] text-base">click now to signin</span>
              </PopoverContent>
            </Popover>
          ) : null}

          {/* Footer hotspot (image contains text) */}
          <Popover open={!loginOpen && footerTooltipOpen} onOpenChange={() => {}}>
            <PopoverTrigger asChild>
              <a
                href="https://www.affordablewebdesigns.co"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open Affordable Web Designs website"
                onMouseEnter={() => setFooterTooltipOpen(true)}
                onMouseLeave={() => setFooterTooltipOpen(false)}
                onFocus={() => setFooterTooltipOpen(true)}
                onBlur={() => setFooterTooltipOpen(false)}
                className="absolute left-1/2 bottom-[3.5%] z-20 h-[4%] min-h-[26px] w-[37%] -translate-x-1/2 rounded-full bg-white/0 ring-1 ring-white/0 transition hover:bg-white/10 hover:ring-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cta)]/60"
              />
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
            >
              <PopoverArrow
                width={12}
                height={8}
                className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
              />
              Open Affordable Web Designs
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {loginOpen ? (
        <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl items-center justify-center px-4 py-8 sm:py-10">
          <div
            ref={dialogRef}
            className="w-[min(92vw,420px)] rounded-2xl border border-white/15 bg-black/55 shadow-2xl backdrop-blur-md"
            style={{
              transform: `translate(${dragOffset.dx}px, ${dragOffset.dy}px)`,
            }}
          >
            <div
              className="grid cursor-move select-none touch-none grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-t-2xl border-b border-white/10 px-4 py-3"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              aria-label="Drag sign in panel"
              role="button"
              tabIndex={0}
            >
              <div aria-hidden="true" />
              <div className="min-w-0 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground/70">
                  EZ-ATTENDANCE
                </p>
                <h1 className="text-lg font-bold text-white sm:text-xl">Client Sign in</h1>
              </div>
              <button
                type="button"
                onClick={() => setLoginOpen(false)}
                onPointerDown={(e) => e.stopPropagation()}
                className="justify-self-end rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold text-foreground/80 hover:bg-black/30"
              >
                Close
              </button>
            </div>

            <div className="p-5 sm:p-7">
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
                  className="w-full rounded-lg bg-[var(--cta)] px-4 py-2.5 text-sm font-semibold text-[var(--cta-foreground)] shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
