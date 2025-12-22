"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ChartPie,
  Home,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
  TrendingUp,
  User,
  Wrench,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useThemeSettings } from "./theme-settings-provider";
import { useAuth } from "./auth-provider";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  { label: "Welcome", href: "/", icon: <Home className="h-4 w-4" /> },
  { label: "Reports", href: "/reports", icon: <ChartPie className="h-4 w-4" /> },
  { label: "Trends", href: "/trends", icon: <TrendingUp className="h-4 w-4" /> },
  { label: "Smart Scheduler", href: "/scheduling", icon: <Calendar className="h-4 w-4" /> },
  { label: "Maintenance", href: "/maintenance", icon: <Wrench className="h-4 w-4" /> },
  { label: "Data Mining", href: "/data-mining", icon: <Sparkles className="h-4 w-4" /> },
  { label: "Settings", href: "/settings", icon: <Settings className="h-4 w-4" /> },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    sidebarPosition,
    toggleMode,
    mode,
    branch,
    setSidebarPosition,
  } = useThemeSettings();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const placementClass =
    sidebarPosition === "left" ? "md:flex-row" : "md:flex-row-reverse";

  return (
    <div className={`min-h-screen bg-background text-foreground md:flex ${placementClass}`}>
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } fixed z-30 w-64 border-r border-sidebar-border bg-sidebar/90 shadow-lg transition md:static`}
      >
        <div className="bg-nav-gradient ymca-nav-header flex h-16 items-center gap-4 border-b border-sidebar-border px-4 py-0">
          <div className="flex h-11 w-11 items-center justify-center">
            <Image
              src="/assets/images/ymca-logo.v2.png"
              alt="YMCA logo"
              width={40}
              height={40}
              className="select-none"
              priority
            />
          </div>
          <div className="h-10 w-px bg-white/20" />
          <div className="flex flex-col leading-tight">
            <p className="w-full pt-0.5 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/85">
              Manager
            </p>
            <p className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Attendance Tracker
            </p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-2 py-3">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const isWelcome = item.href === "/";
            const isDisabled = !user && !isWelcome;
            
            if (isDisabled) {
              return (
                <span
                  key={item.href}
                  className="btn-pill flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-not-allowed opacity-40 text-foreground/50"
                  title="Sign in to access this feature"
                >
                  {item.icon}
                  {item.label}
                </span>
              );
            }
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`btn-pill flex items-center gap-2 px-3 py-2 text-sm font-medium transition
                  active:translate-y-px active:scale-[0.98]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cta)]/70
                  ${
                    active
                      ? "bg-[var(--cta)] text-[var(--cta-foreground)] shadow-sm ring-1 ring-black/10"
                      : "text-foreground/90 ring-1 ring-transparent hover:bg-white/15 hover:text-foreground hover:ring-white/15"
                  }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="mt-auto hidden px-4 pb-4 md:block">
            <div className="rounded-2xl border border-sidebar-border bg-panel-gradient p-3 text-sm shadow-sm ring-1 ring-white/10">
              <div className="flex items-center justify-between">
                <span>Sidebar side</span>
                <button
                  className="btn-pill border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold text-foreground shadow-sm hover:bg-black/30"
                  onClick={() =>
                    setSidebarPosition(sidebarPosition === "left" ? "right" : "left")
                  }
                >
                  {sidebarPosition === "left" ? "Left" : "Right"}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header
          className="ymca-nav-header sticky top-0 z-20 flex h-16 border-b border-border bg-nav-gradient"
        >
          <div className="flex w-full items-center justify-between px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl border border-white/15 bg-black/20 p-2 text-foreground shadow-sm md:hidden"
                onClick={() => setSidebarOpen((s) => !s)}
              >
                <Menu className="h-5 w-5" />
              </button>
              {user && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="hidden sm:inline">Branch:</span>
                  <span className="btn-pill border border-white/10 bg-black/20 px-3 py-1 text-foreground">
                    {branch.name}
                  </span>
                </div>
              )}
              {user && (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="hidden h-4 w-4 sm:block" />
                    <span className="btn-pill border border-white/10 bg-black/20 px-3 py-1 text-foreground">
                      {user.email}
                    </span>
                  </div>
                  <button
                    onClick={signOut}
                    className="btn-pill flex items-center gap-1.5 border border-red-500/30 bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-300 shadow-sm hover:bg-red-500/30"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </>
              )}
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <button
                  onClick={toggleMode}
                  className="btn-pill flex items-center gap-2 border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold text-foreground shadow-sm hover:bg-black/30"
                >
                  {mode === "light" ? (
                    <>
                      <Sun className="h-4 w-4" /> Light
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4" /> Dark
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground/85">
              <LiveDateTime />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-10 pt-6 sm:px-8">
          <div className="bg-app-gradient px-4 pt-6 sm:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function LiveDateTime() {
  const nowMs = useSyncExternalStore(subscribeNow, getNowSnapshot, getNowSnapshot);
  if (!nowMs) return <span className="opacity-70">�</span>;
  const now = new Date(nowMs);

  const datePart = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(now);

  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <span className="whitespace-nowrap">
      {datePart} @ {timePart}
    </span>
  );
}

let NOW_MS = 0;
function getNowSnapshot() {
  return NOW_MS;
}
function subscribeNow(onStoreChange: () => void) {
  const tick = () => {
    NOW_MS = Date.now();
    onStoreChange();
  };
  tick();
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
