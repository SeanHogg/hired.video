import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { useVerificationBlocked } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * AppShell — single owner of the page chrome layout (Sidebar + Navigation +
 * Footer + content margin/padding wrappers).
 *
 * The bounded context is "verified-or-anonymous user using the app." When the
 * user is in verification limbo (logged in but email unconfirmed) the shell
 * collapses to a chrome-free layout — Sidebar/Navigation never mount, so the
 * data-fetching hooks they own (CommunicationHub → /api/inbox, AITokenPill →
 * /api/Billing/token-budget, AccountSwitcher → /api/account/available) never
 * fire. Replaces the per-page boilerplate that 90+ pages used to repeat.
 *
 * Pages render content directly as children — AppShell handles outer
 * background, sidebar margin shift, the 64px Navigation top-padding, and
 * the Footer. The optional `bgClassName` overrides the default gradient for
 * marketing pages that want a flat background.
 */
export interface AppShellProps {
  children: ReactNode;
  /** Override the outer wrapper bg classes. Defaults to the brand gradient. */
  bgClassName?: string;
}

const DEFAULT_BG = "bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5";

export function AppShell({ children, bgClassName }: AppShellProps): JSX.Element {
  const blocked = useVerificationBlocked();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const bg = bgClassName ?? DEFAULT_BG;

  if (blocked) {
    return <div className={cn("min-h-screen", bg)}>{children}</div>;
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
