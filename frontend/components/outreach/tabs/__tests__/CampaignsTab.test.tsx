/** Outreach CampaignsTab — List / By size grouping (#1133). */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CampaignsTab } from "../CampaignsTab";
import type { VideoCampaign } from "@/lib/services/studio-service";
import type { CampaignDTO } from "@shared/campaigns";

const videoCampaign: VideoCampaign = {
  id: "vc-1",
  userId: "u1",
  name: "Fall Launch",
  description: "Landscape reel",
  utmSource: "linkedin",
  utmMedium: "video",
  utmCampaign: "fall",
  status: "active",
  projectIds: ["p-wide"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const emptyFiltered = { video: [] as VideoCampaign[], email: [] as CampaignDTO[] };
const videoFiltered = { video: [videoCampaign], email: [] as CampaignDTO[] };

const noop = {
  search: "",
  onSearchChange: vi.fn(),
  viewMode: "grid" as const,
  onViewModeChange: vi.fn(),
  pagination: {
    currentPage: 1,
    itemsPerPage: 20,
    setCurrentPage: vi.fn(),
    handleItemsPerPageChange: vi.fn(),
  },
  onCreateVideoCampaign: vi.fn(),
  onDeleteVideoCampaign: vi.fn(async () => {}),
  onNavigateTo: vi.fn(),
};

function renderTab(
  overrides: Partial<React.ComponentProps<typeof CampaignsTab>> = {},
) {
  return render(
    <MemoryRouter>
      <CampaignsTab
        videoCampaigns={overrides.videoCampaigns ?? [videoCampaign]}
        emailCampaigns={overrides.emailCampaigns ?? []}
        filteredCampaigns={overrides.filteredCampaigns ?? videoFiltered}
        totalCampaigns={overrides.totalCampaigns ?? 1}
        studioProjects={
          overrides.studioProjects ?? [
            { id: "p-wide", timelineSpec: { width: 1920, height: 1080 } },
          ]
        }
        {...noop}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("CampaignsTab size grouping", () => {
  it("shows List / By size toggle", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "List" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "By size" })).toBeTruthy();
  });

  it("groups studio campaigns under Landscape when By size is pressed", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole("button", { name: "By size" }));
    expect(screen.getByRole("heading", { name: /Landscape/ })).toBeTruthy();
    expect(screen.getByText("Fall Launch")).toBeTruthy();
  });

  it("renders a creative-size matrix with Broadcast for a 16:9 project", () => {
    renderTab();
    expect(screen.getByText("Broadcast")).toBeTruthy();
  });

  it("shows the empty state when there are no campaigns", () => {
    renderTab({
      videoCampaigns: [],
      emailCampaigns: [],
      filteredCampaigns: emptyFiltered,
      totalCampaigns: 0,
      studioProjects: [],
    });
    expect(screen.getByText("No campaigns yet")).toBeTruthy();
  });
});
