/**
 * Tests for DashboardFeed — the SuperAdmin-curated feed that fills the
 * empty dashboard. Verifies it renders curated cards, shows the friendly
 * empty state only when asked, and stays silent (renders nothing) otherwise.
 *
 * The heterogeneous card renderer + the analytics/auth trees it pulls in are
 * stubbed via the useFeedCardRenderer mock — this test owns the feed
 * container's fetch + empty-state logic, not the card factory.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test-render";
import { DashboardFeed } from "@/components/dashboard/DashboardFeed";
import { feedFeaturesService } from "@/lib/services/feed-features-service";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock("@/lib/services/feed-features-service", () => ({
  feedFeaturesService: { getForRole: vi.fn() },
}));
vi.mock("@/lib/feed-card-renderer", () => ({
  useFeedCardRenderer: () => (item: any) => (
    <div data-testid="feed-card">{item.title}</div>
  ),
  feedEntityHref: () => null,
}));

beforeEach(() => vi.clearAllMocks());

describe("DashboardFeed", () => {
  it("renders curated cards for the role", async () => {
    (feedFeaturesService.getForRole as Mock).mockResolvedValue([
      { featureId: "f1", type: "tool", id: "career-360", title: "Career 360", rank: 0 },
    ]);
    renderWithProviders(<DashboardFeed />);
    expect(await screen.findByText("Career 360")).toBeTruthy();
  });

  it("shows the empty state when nothing is curated and showEmptyState is set", async () => {
    (feedFeaturesService.getForRole as Mock).mockResolvedValue([]);
    renderWithProviders(<DashboardFeed showEmptyState />);
    expect(await screen.findByText(/Fresh picks and resources/i)).toBeTruthy();
  });

  it("renders nothing when empty and showEmptyState is false", async () => {
    (feedFeaturesService.getForRole as Mock).mockResolvedValue([]);
    renderWithProviders(<DashboardFeed />);
    await waitFor(() =>
      expect(feedFeaturesService.getForRole).toHaveBeenCalled(),
    );
    expect(screen.queryByText(/Featured for you/i)).toBeNull();
  });
});
