import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { useVerificationBlocked } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * AppShell — single owner of every page-level chrome composition.
 *
 * The shell is responsible for one decision: which chrome wraps the page
 * content. Three variants encode the three product surfaces:
 *
 *   - `app` (default) — Sidebar + Navigation + Footer. The full authed-user
 *     experience. Auto-collapses to chrome-free when the user is in
 *     verification limbo (`useVerificationBlocked()`), preventing the
 *     data-fetching hooks owned by chrome (CommunicationHub → /api/inbox,
 *     AITokenPill → /api/Billing/token-budget, AccountSwitcher →
 *     /api/account/available, etc.) from firing for blocked users.
 *
 *   - `public` — Footer only. For unauthenticated viewers landing on shared
 *     surfaces (recruiter share links, candidate pitch decks). The Footer
 *     doubles as a hired.video signup CTA — viral loop on every shared
 *     resume / deck. No Sidebar / Navigation — those are private app chrome.
 *
 *   - `bare` — no chrome at all. For embedded / iframe / portal contexts
 *     where the host page or token-bearer owns the framing entirely.
 *
 * Pages render content as children. Variant is the only knob the caller
 * needs; AppShell internally owns all chrome decisions including the
 * verification gate. Replaces the per-page boilerplate that 90+ pages used
 * to repeat.
 */
export type AppShellVariant = "app" | "public" | "bare";

export interface AppShellProps {
  children: ReactNode;
  /** Chrome posture. Default is the full authed-app shell. */
  variant?: AppShellVariant;
  /** Override the outer wrapper bg classes. Defaults to the brand gradient. */
  bgClassName?: string;
}

const DEFAULT_BG = "bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5";

export function AppShell({
  children,
  variant = "app",
  bgClassName,
}: AppShellProps): JSX.Element {
  const blocked = useVerificationBlocked();
  // Always call useSidebar so hook order stays stable across variant flips.
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const bg = bgClassName ?? DEFAULT_BG;

  // Bare or verification-blocked → no chrome. Blocked wins for `app`/`public`
  // because a blocked user can't service any chrome-level fetches anyway.
  if (variant === "bare" || (variant === "app" && blocked)) {
    return <div className={cn("min-h-screen", bg)}>{children}</div>;
  }

  if (variant === "public") {
    return (
      <div className={cn("min-h-screen flex flex-col", bg)}>
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen", bg)}>
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="pt-16 min-h-screen">{children}</div>
        <Footer />
      </div>
    </div>
  );
}
