/**
 * #1658 — the homepage `/` must render its body for a SIGNED-IN visitor, not
 * just for an anonymous one. AppShell takes a different branch for each
 * auth state (full chrome with the docked rail once auth has settled; the
 * minimal branded shell while it bootstraps), so each branch is pinned:
 * the hero, the drop zone, the FAQ and the closing CTA are all in the page.
 *
 * Chrome (Navigation / Sidebar / Footer / banners) and the public data hooks
 * are stubbed — they're covered by their own tests; what's under test is that
 * nothing between AppShell and the landing body hides it for a signed-in user.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, mockAuthValue } from "../test-render";
import Index from "../../pages/Index";
import { useAuth, useVerificationBlocked } from "../../lib/auth";

vi.mock("../../lib/auth");
vi.mock("../../lib/seo", () => ({ useSEO: vi.fn(), useDefaultBreadcrumbs: vi.fn() }));
vi.mock("../../hooks/use-sidebar", () => ({
  useSidebar: () => ({
    sidebarOpen: false,
    sidebarCollapsed: false,
    openSidebar: vi.fn(),
    closeSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
  }),
}));
vi.mock("../../hooks/use-usage-tracker", () => ({ useUsageTracker: vi.fn() }));
vi.mock("../../components/Navigation", () => ({ default: () => <div data-testid="navigation" /> }));
vi.mock("../../components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("../../components/Footer", () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("../../components/BrandHeader", () => ({ BrandHeader: () => <div data-testid="brand-header" /> }));
vi.mock("../../components/auth/EmailVerificationBanner", () => ({ EmailVerificationBanner: () => null }));
vi.mock("../../components/i18n/GeoLocaleSuggestionBanner", () => ({ GeoLocaleSuggestionBanner: () => null }));
vi.mock("../../components/MarketingPageVideo", () => ({ MarketingPageVideo: () => null }));
vi.mock("../../components/audio/TextNarrator", () => ({ default: () => null }));
// Public data: a brand-new platform with no posted videos yet and no season
// running — the hero falls back to its illustration, the rails self-hide.
vi.mock("../../hooks/use-public-video-feed", () => ({
  usePublicVideoFeed: () => ({ videos: [], isLoading: false }),
}));
vi.mock("../../hooks/use-in-season", () => ({
  useInSeason: () => ({ themeIds: [], themeSet: new Set<string>(), names: [], seasonName: null, seasonThemeId: null }),
}));
vi.mock("../../hooks/use-marketing-proof", () => ({ useResumeBuilderFigure: () => 1200 }));

const SIGNED_IN_USER = {
  id: "0b6c2f4e-8a1d-4c3b-9e7f-5a2d1c0b9e8f",
  email: "ana.ruiz@example.com",
  name: "Ana Ruiz",
  role: "job_seeker",
  roles: ["job_seeker"],
  emailConfirmed: true,
};

function expectLandingBody() {
  expect(screen.getByText("Get hired as yourself")).toBeInTheDocument();
  expect(
    screen.getByText("Drop your photo, résumé, cover letter or the job you want"),
  ).toBeInTheDocument();
  expect(screen.getByText("Questions")).toBeInTheDocument();
  expect(screen.getByText("The next interview goes to someone. Make it you.")).toBeInTheDocument();
}

describe("Index (/) — signed-in render (#1658)", () => {
  beforeEach(() => {
    (useVerificationBlocked as Mock).mockReturnValue(false);
  });

  it("a signed-in, verified user gets the full app chrome AND the landing body", () => {
    (useAuth as Mock).mockReturnValue(mockAuthValue(true, { user: SIGNED_IN_USER }));
    renderWithProviders(<Index />);
    expect(screen.getByTestId("navigation")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expectLandingBody();
  });

  it("while a signed-in session is still bootstrapping, the minimal shell still shows the body", () => {
    (useAuth as Mock).mockReturnValue(mockAuthValue(true, { user: SIGNED_IN_USER, isLoading: true }));
    renderWithProviders(<Index />);
    expect(screen.getByTestId("brand-header")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expectLandingBody();
  });

  it("an anonymous visitor sees the same body (control)", () => {
    (useAuth as Mock).mockReturnValue(mockAuthValue(false));
    renderWithProviders(<Index />);
    expectLandingBody();
  });
});
