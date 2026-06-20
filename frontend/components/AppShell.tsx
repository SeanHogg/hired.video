import type { ReactNode } from "react";
import { BrandHeader } from "@/components/BrandHeader";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import { GeoLocaleSuggestionBanner } from "@/components/i18n/GeoLocaleSuggestionBanner";
import { MarketingPageVideo } from "@/components/MarketingPageVideo";
import { HelpDrawer } from "@/components/help/HelpDrawer";
import { useSidebar } from "@/hooks/use-sidebar";
import { useUsageTracker } from "@/hooks/use-usage-tracker";
import { useAuth, useVerificationBlocked } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * AppShell — single owner of every page-level chrome composition.
 *
 * Inverted-default architecture: the heavy chrome (Sidebar + full
 * Navigation with CommunicationHub / search / cart) renders only after
 * auth has bootstrapped AND the user is not in verification limbo. While
 * auth resolves OR the user is blocked, we render a *minimal branded*
 * layout — `<BrandHeader>` (just the logo + Sign Out when authed) plus
 * `<Footer>` — so the visitor always knows what product they're on. No
 * data hooks fire from BrandHeader / Footer.
 *
 * This kills the chrome-flicker that would otherwise show full chrome
 * while auth resolves, then yank it away when the gate trips. Variants:
 *
 *   - `app` (default) — Sidebar + Navigation + Footer when ready,
 *     BrandHeader + Footer otherwise.
 *
 *   - `public` — BrandHeader + Footer. For unauthenticated viewers
 *     landing on shared surfaces (recruiter share links, candidate pitch
 *     decks). The Footer doubles as a hired.video signup CTA — viral
 *     loop on every shared resume / deck. No auth dependency.
 *
 *   - `bare` — no chrome at all. For embedded / iframe / portal contexts
 *     where the host page or token-bearer owns the framing entirely.
 *
 * The chrome's data-fetching hooks (CommunicationHub, AITokenPill,
 * AccountSwitcher, ...) all inherit the same api-ready gate via
 * `useGatedResource`, so they never fire even if the chrome did briefly
 * mount. AppShell hides the *visual* chrome; `useApiReady` gates the
 * fetches. Same primitive, two complementary layers.
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

/**
 * Predicate consumed by AppShell + GlobalChrome. Returns true only when
 * we're certain the user is in a state where rendering full app chrome is
 * correct — auth bootstrap settled, verification not in limbo. Anonymous
 * users (settled, not blocked) qualify so marketing/login chrome still
 * renders. Authed-during-bootstrap returns false → minimal branded shell
 * → no flicker.
 */
export function useShouldRenderAppChrome(): boolean {
  const { isLoading } = useAuth();
  const blocked = useVerificationBlocked();
  if (isLoading) return false;
  return !blocked;
}

/** Internal: minimal branded shell. Used by `app` (when not ready) and
 *  `public`. BrandHeader is fixed-position + 64px tall so we add the
 *  matching `pt-16` padding to keep content below the strip. */
function MinimalShell({
  children,
  bgClassName,
}: {
  children: ReactNode;
  bgClassName: string;
}): JSX.Element {
  return (
    <div className={cn("min-h-screen flex flex-col overflow-x-clip", bgClassName)}>
      <BrandHeader />
      <div className="pt-16 flex-1">
        <GeoLocaleSuggestionBanner />
        <EmailVerificationBanner />
        <MarketingPageVideo />
        {children}
      </div>
      <Footer />
      <HelpDrawer />
    </div>
  );
}

export function AppShell({
  children,
  variant = "app",
  bgClassName,
}: AppShellProps): JSX.Element {
  const showAppChrome = useShouldRenderAppChrome();
  // Always call useSidebar so hook order stays stable across variant flips.
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  // Usage tracking (#2044) — every page (marketing + authed) through one seam;
  // self-gates on analytics consent. Called unconditionally to keep hook order
  // stable across the variant branches below.
  useUsageTracker();
  const bg = bgClassName ?? DEFAULT_BG;

  if (variant === "bare") {
    return <div className={cn("min-h-screen overflow-x-clip", bg)}>{children}</div>;
  }

  if (variant === "public" || (variant === "app" && !showAppChrome)) {
    return <MinimalShell bgClassName={bg}>{children}</MinimalShell>;
  }

  return (
    <div className={cn("min-h-screen overflow-x-clip", bg)}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={cn("min-w-0", sidebarCollapsed ? "lg:ml-16" : "lg:ml-80")}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="pt-16 min-h-screen">
          <GeoLocaleSuggestionBanner />
          <EmailVerificationBanner />
          <MarketingPageVideo />
          {children}
        </div>
        <Footer />
      </div>
      <HelpDrawer />
    </div>
  );
}
