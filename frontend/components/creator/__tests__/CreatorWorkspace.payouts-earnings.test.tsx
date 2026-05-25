/**
 * Structural regression tests for the Payouts & Earnings tab consolidation
 * (gap #1185 partner — see README Consolidated Gap Register).
 *
 * The 2026-05-24 sweep collapsed two adjacent tabs (Marketplace Earnings +
 * Payouts) into a single "Payouts & Earnings" tab, so that the
 * `CreatorTemplateEarnings` card (read-only, self-gates to null when there
 * are no published templates) renders above the `PayoutProfileForm` (tax /
 * rail config + balance ledger) on the same surface.
 *
 * These tests pin the contract: the legacy `"earnings"` tab value is gone,
 * the renamed tab is labelled "Payouts & Earnings", and both child
 * components mount under the payouts tab content. All heavy / self-fetching
 * children are stubbed to keep this a pure structural test.
 *
 * Run: vitest run components/creator/__tests__/CreatorWorkspace.payouts-earnings.test.tsx
 */

import { describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreatorWorkspace from "@/components/creator/CreatorWorkspace";

// Flush microtasks so the portfolio apiClient.get().then(setState) resolves
// inside an act() scope — silences the "update was not wrapped in act"
// warnings without changing what's being asserted.
const flushPromises = () => act(async () => { await Promise.resolve(); });

// Stub every child component so the render is structure-only — no
// self-fetches, no provider plumbing, no styling surprises.
vi.mock("@/components/ads/UpgradePrompt", () => ({
  UpgradePrompt: () => <div data-testid="stub-upgrade-prompt" />,
}));
vi.mock("@/components/creator/PayoutProfileForm", () => ({
  default: () => <div data-testid="stub-payout-form" />,
}));
vi.mock("@/components/creator/CreatorProfileForm", () => ({
  default: () => <div data-testid="stub-creator-profile-form" />,
}));
vi.mock("@/components/studio/shared/CreatorTemplateEarnings", () => ({
  default: () => <div data-testid="stub-creator-template-earnings" />,
}));
vi.mock("@/components/creator/LeaveCreatorProgramCard", () => ({
  default: () => <div data-testid="stub-leave-program-card" />,
}));
vi.mock("@/components/settings/PromoteWithoutAuthToggle", () => ({
  default: () => <div data-testid="stub-promote-toggle" />,
}));
vi.mock("@/components/creator/CoursesManagerPanel", () => ({
  default: () => <div data-testid="stub-courses-panel" />,
}));
vi.mock("@/components/creator/ArticlesManagerPanel", () => ({
  default: () => <div data-testid="stub-articles-panel" />,
}));
vi.mock("@/components/services/OfferingsPanel", () => ({
  default: () => <div data-testid="stub-offerings-panel" />,
}));

// Toast hook is fire-and-forget in CreatorWorkspace; stub it so test setup
// doesn't need the real provider.
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => {} }),
}));

// Portfolio tab self-fetches via apiClient on mount. Stub get/post/delete
// to no-ops so the component renders without network noise.
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: null }),
    delete: vi.fn().mockResolvedValue({ data: null }),
  },
}));

function mount(initialPath = "/services/creator/payouts") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CreatorWorkspace basePath="/services/creator" />
    </MemoryRouter>,
  );
}

describe("CreatorWorkspace — Payouts & Earnings tab consolidation", () => {
  it("renders a single combined 'Payouts & Earnings' tab trigger", async () => {
    mount();
    await flushPromises();
    expect(
      screen.getByRole("tab", { name: /Payouts & Earnings/i }),
    ).toBeInTheDocument();
  });

  it("does NOT render the legacy 'Marketplace Earnings' tab trigger", async () => {
    mount();
    await flushPromises();
    expect(
      screen.queryByRole("tab", { name: /Marketplace Earnings/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT render a separate standalone 'Earnings' tab trigger", async () => {
    mount();
    await flushPromises();
    // Guard against a future regression that re-splits the surface under a
    // shorter "Earnings" label. The combined trigger contains the word
    // "Earnings" but is matched above by its full label.
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent ?? "");
    const standaloneEarnings = tabs.filter(
      (label) => /^\s*Earnings\s*$/i.test(label),
    );
    expect(standaloneEarnings).toHaveLength(0);
  });

  it("mounts BOTH the template-earnings card and the payout form inside the payouts tab content", async () => {
    mount();
    await flushPromises();
    // Radix Tabs renders the active panel only — landing on
    // /services/creator/payouts makes the payouts panel active.
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByTestId("stub-creator-template-earnings")).toBeInTheDocument();
    expect(within(panel).getByTestId("stub-payout-form")).toBeInTheDocument();
  });

  it("renders the earnings card ABOVE the payout form (daily-value before set-once setup)", async () => {
    mount();
    await flushPromises();
    const panel = screen.getByRole("tabpanel");
    const earnings = within(panel).getByTestId("stub-creator-template-earnings");
    const payout = within(panel).getByTestId("stub-payout-form");
    // DOCUMENT_POSITION_FOLLOWING (4) means `payout` comes after `earnings`.
    // Use a bitmask check to stay robust across nested DOM shapes.
    expect(earnings.compareDocumentPosition(payout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("treats the legacy /services/creator/earnings URL as an unknown tab — no crash, falls back to a visible tab", async () => {
    // The earlier tab block was at /services/creator/earnings. After the
    // consolidation the URL routes through TAB_VALUES validation and falls
    // back to the resolved default tab. The page must still render a panel.
    mount("/services/creator/earnings");
    await flushPromises();
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    // And the legacy tab must not have been re-introduced.
    expect(
      screen.queryByRole("tab", { name: /Marketplace Earnings/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the rest of the tab list intact (Profile / Portfolio / Account, plus Offerings when wired)", async () => {
    render(
      <MemoryRouter initialEntries={["/services/creator/profile"]}>
        <CreatorWorkspace
          basePath="/services/creator"
          // Wire offerings in by passing setServices — matches the /services hub.
          services={[]}
          setServices={() => {}}
        />
      </MemoryRouter>,
    );
    await flushPromises();
    expect(screen.getByRole("tab", { name: /Offerings/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Profile$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Payouts & Earnings/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Portfolio/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Account/i })).toBeInTheDocument();
  });
});
