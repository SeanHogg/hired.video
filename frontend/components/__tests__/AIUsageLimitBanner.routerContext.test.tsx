/**
 * Regression guard for gap #1200 — the `Cannot destructure property
 * 'basename' of useContext(...) as it is null` crash that fired on the
 * first `AI_USAGE_LIMIT_REACHED` event after the free-tier token quota
 * was exhausted.
 *
 * Root cause was that `<GlobalAIUsageBanner>` was mounted in
 * [App.tsx](../../App.tsx) **above** `<BrowserRouter>`, and
 * `<AIUsageLimitErrorBanner>` (the thing it conditionally renders) uses
 * `<Link>` from `react-router-dom`. `<Link>` calls
 * `useContext(NavigationContext)` which returns null outside a router →
 * destructure of `basename` throws → critical ErrorBoundary catches it.
 *
 * This file owns two complementary guards:
 *   1. **Behavioural** — render `<GlobalAIUsageBanner>` inside a router,
 *      dispatch the API_ERROR_EVENT, and assert the banner mounts with a
 *      resolved `<Link>`. Catches a regression in either the banner
 *      component or its `<Link>` usage.
 *   2. **Structural** — parse [App.tsx](../../App.tsx) source and assert
 *      `<BrowserRouter>` opens before `<GlobalAIUsageBanner>` and closes
 *      after it. Catches a regression where a future edit moves the
 *      banner (or any other `<Link>`-using chrome) back outside the
 *      router, even before any runtime path exercises it.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GlobalAIUsageBanner from "../GlobalAIUsageBanner";
import { AIUsageLimitErrorBanner } from "../AIUsageLimitBanner";
import {
  API_ERROR_EVENT,
  type ApiErrorEvent,
} from "@shared/errors/apiErrorEvent";


// The chat surfaces read the live token budget; stub it as a free account
// with headroom so these tests don"t need the persona-preview provider.
vi.mock("@/hooks/use-token-budget", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-token-budget")>("@/hooks/use-token-budget");
  return {
    ...actual,
    useTokenBudget: vi.fn(() => ({
      planId: "free",
      isPro: false,
      isUnlimited: false,
      monthlyUsed: 0,
      monthlyLimit: 50_000,
      monthlyRemaining: 50_000,
      packBalance: 0,
      totalAvailable: 50_000,
      resetAt: "2026-11-01T00:00:00.000Z",
      percentUsed: 0,
      isWarning: false,
      isExhausted: false,
      isLoading: false,
      refresh: vi.fn(() => Promise.resolve()),
    })),
  };
});

const __dirname = dirname(fileURLToPath(import.meta.url));
// The provider stack + global chrome moved out of App.tsx into AppProviders.
const APP_TSX_PATH = resolve(__dirname, "../../providers/AppProviders.tsx");

function dispatchAIUsageLimitEvent(detail: Partial<ApiErrorEvent> = {}): void {
  const full: ApiErrorEvent = {
    timestamp: new Date().toISOString(),
    method: "POST",
    url: "/api/ai/chat",
    status: 429,
    code: "AI_USAGE_LIMIT_REACHED",
    message: "Monthly AI limit reached",
    details: { used: 10, limit: 10, upgradeUrl: "/pricing" },
    ...detail,
  };
  act(() => {
    window.dispatchEvent(
      new CustomEvent<ApiErrorEvent>(API_ERROR_EVENT, { detail: full }),
    );
  });
}

describe("AIUsageLimitErrorBanner — router context", () => {
  it("renders the upgrade <Link> when wrapped in a router", () => {
    // Direct render of the leaf component — sanity-check that the link
    // resolves to its target href without a router-context error.
    render(
      <MemoryRouter>
        <AIUsageLimitErrorBanner
          message="Monthly AI limit reached"
          used={10}
          limit={10}
          upgradeUrl="/pricing"
        />
      </MemoryRouter>,
    );

    const upgradeLink = screen.getByRole("link", { name: /upgrade to pro/i });
    expect(upgradeLink).toBeInTheDocument();
    expect(upgradeLink).toHaveAttribute("href", "/pricing");
  });
});

describe("GlobalAIUsageBanner — AI_USAGE_LIMIT_REACHED flow", () => {
  it("mounts the error banner with a working <Link> when the API event fires", async () => {
    // Reproduces the exact runtime path that crashed before #1200:
    //   1. <GlobalAIUsageBanner> is mounted under the router.
    //   2. The api-client dispatches API_ERROR_EVENT with
    //      code=AI_USAGE_LIMIT_REACHED.
    //   3. The banner upgrades to an AIUsageLimitErrorBanner which
    //      renders a <Link to={upgradeUrl}>.
    //
    // Pre-fix this threw `Cannot destructure property 'basename' of
    // useContext(...) as it is null` because the banner was above
    // <BrowserRouter> in App.tsx. Inside MemoryRouter it must just work.
    render(
      <MemoryRouter>
        <GlobalAIUsageBanner />
      </MemoryRouter>,
    );

    // Idle state: nothing rendered.
    expect(screen.queryByRole("link", { name: /upgrade to pro/i })).toBeNull();

    dispatchAIUsageLimitEvent();

    const upgradeLink = await waitFor(() =>
      screen.getByRole("link", { name: /upgrade to pro/i }),
    );
    expect(upgradeLink).toHaveAttribute("href", "/pricing");
  });

  it("ignores unrelated API errors", () => {
    // GlobalErrorHandler owns the red-toast queue for everything that
    // isn't AI_USAGE_LIMIT_REACHED; the banner must stay silent so the
    // user sees exactly one surface per error.
    render(
      <MemoryRouter>
        <GlobalAIUsageBanner />
      </MemoryRouter>,
    );

    dispatchAIUsageLimitEvent({
      code: "VALIDATION_ERROR",
      message: "Something else broke",
      status: 400,
    });

    expect(screen.queryByRole("link", { name: /upgrade to pro/i })).toBeNull();
  });
});

describe("AppProviders — global chrome lives inside <BrowserRouter>", () => {
  // Structural guard. The behavioural tests above prove the banner
  // works when mounted inside a router; this test proves App.tsx
  // actually mounts it inside one. Catches a regression where someone
  // hoists chrome back above <BrowserRouter> without exercising the
  // AI-limit path locally.
  const appSource = readFileSync(APP_TSX_PATH, "utf8");

  function indexOfTag(tag: string): number {
    const idx = appSource.indexOf(tag);
    expect(idx, `expected to find ${tag} in AppProviders.tsx`).toBeGreaterThan(-1);
    return idx;
  }

  it("opens <BrowserRouter> before <GlobalAIUsageBanner>", () => {
    const routerOpen = indexOfTag("<BrowserRouter>");
    const banner = indexOfTag("<GlobalAIUsageBanner");
    expect(banner).toBeGreaterThan(routerOpen);
  });

  it("closes </BrowserRouter> after <GlobalAIUsageBanner>", () => {
    const routerClose = indexOfTag("</BrowserRouter>");
    const banner = indexOfTag("<GlobalAIUsageBanner");
    expect(routerClose).toBeGreaterThan(banner);
  });

  it.each([
    "<Toaster",
    "<Sonner",
    "<GlobalErrorHandler",
    "<GlobalAIUsageBanner",
    "<BadgeUnlockToaster",
    "<CookieConsentBanner",
    "<PWAUpdatePrompt",
    "<PWAInstallPrompt",
  ])("mounts %s inside <BrowserRouter>", (tag) => {
    // Every globally-mounted chrome surface must live inside the
    // router. If a future addition skips this, it'll silently crash on
    // its first <Link> / useNavigate (gap #1200's exact failure mode).
    const routerOpen = indexOfTag("<BrowserRouter>");
    const routerClose = indexOfTag("</BrowserRouter>");
    const chrome = indexOfTag(tag);
    expect(chrome).toBeGreaterThan(routerOpen);
    expect(chrome).toBeLessThan(routerClose);
  });
});
