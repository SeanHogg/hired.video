import type { ReactNode } from "react";
import { BrandHeader } from "@/components/BrandHeader";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import { GeoLocaleSuggestionBanner } from "@/components/i18n/GeoLocaleSuggestionBanner";
import { MarketingPageVideo } from "@/components/MarketingPageVideo";
import { HeaderActionsProvider } from "@/components/chrome/HeaderActions";
import { useSidebar } from "@/hooks/use-sidebar";
import { useUsageTracker } from "@/hooks/use-usage-tracker";
import { useAuth, useVerificationBlocked } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useWorkspaceViewportLock } from "@/lib/dom/use-workspace-viewport-lock";

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
 *   - `workspace` — the SAME Sidebar + Navigation as `app`, but no Footer and
 *     the content box is exactly the viewport minus the 64px bar. For
 *     full-height editing surfaces (the kit workspace) that scroll their own columns:
 *     they get the real app chrome (and therefore the signed-in avatar menu)
 *     instead of hand-rolling a second header.
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
export type AppShellVariant = "app" | "public" | "workspace" | "bare";

export interface AppShellProps {
  children: ReactNode;
  /** Chrome posture. Default is the full authed-app shell. */
  variant?: AppShellVariant;
  /** Override the outer wrapper bg classes. Defaults to the brand gradient. */
  bgClassName?: string;
}

const DEFAULT_BG = "bg-background";

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
    </div>
  );
}

export function AppShell({
  children,
  variant = "app",
  bgClassName,
}: AppShellProps): JSX.Element {
  const showAppChrome = useShouldRenderAppChrome();
  // Signed-in users get the docked rail; signed-out visitors get the full
  // marketing column (sidebar only as a phone drawer), matching the mockups.
  const { isAuthenticated } = useAuth();
  const docked = isAuthenticated;
  // Always call useSidebar so hook order stays stable across variant flips.
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  // Usage tracking (#2044) — every page (marketing + authed) through one seam;
  // self-gates on analytics consent. Called unconditionally to keep hook order
  // stable across the variant branches below.
  useUsageTracker();
  // The workspace owns the viewport from lg: the document never scrolls.
  useWorkspaceViewportLock(variant === "workspace" && showAppChrome);
  const bg = bgClassName ?? DEFAULT_BG;

  if (variant === "bare") {
    return <div className={cn("min-h-screen overflow-x-clip", bg)}>{children}</div>;
  }

  if (variant === "public" || !showAppChrome) {
    return <MinimalShell bgClassName={bg}>{children}</MinimalShell>;
  }

  // Workspace surfaces own their own scrolling, so the shell gives them a box
  // sized to the viewport INCLUDING the 64px bar (border-box, hence pt-16
  // inside the height) and no footer to push them past the fold. From `lg`
  // the box is a FIXED height, so the page itself never scrolls and each
  // column scrolls on its own; below `lg` the columns stack and the page
  // scrolls. Below `md` it also leaves the MobileBottomNav's 4rem, which is
  // fixed over the page — without that the bar covers the workspace's footer
  // row (on the kit workspace, the composer).
  const workspace = variant === "workspace";

  return (
    <HeaderActionsProvider>
      {/* The workspace owns the viewport from lg: the document itself never
          scrolls (its columns do), so nothing can shift the shell up. */}
      <div
        className={cn("min-h-screen overflow-x-clip", workspace && "lg:relative lg:h-[100dvh] lg:overflow-hidden", bg)}
      >
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
          docked={docked}
        />
        <div className={cn("min-w-0", docked && (sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"))}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={docked ? toggleSidebar : undefined}
            sidebarCollapsed={sidebarCollapsed}
            workspace={workspace}
          />
          <div
            className={cn(
              "pt-16",
              workspace
                ? "flex min-h-[calc(100dvh-4rem)] flex-col md:min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden"
                : "min-h-screen",
            )}
          >
            <GeoLocaleSuggestionBanner />
            <EmailVerificationBanner />
            <MarketingPageVideo />
            {workspace ? (
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            ) : (
              children
            )}
          </div>
          {!workspace && <Footer />}
        </div>
      </div>
    </HeaderActionsProvider>
  );
}
