import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdSetEditor from "../AdSetEditor";
import { advertisingService } from "@/lib/services/advertising-service";

vi.mock("@/lib/services/advertising-service", () => ({
  advertisingService: {
    createAdSet: vi.fn(),
    updateAdSet: vi.fn(),
  },
}));

vi.mock("../AdTargetingPanel", () => ({
  default: ({ value }: { value: unknown }) => (
    <div data-testid="ad-targeting-panel">{JSON.stringify(value)}</div>
  ),
}));

describe("AdSetEditor", () => {
  beforeEach(() => {
    vi.mocked(advertisingService.createAdSet).mockReset().mockResolvedValue({ id: "as1" } as never);
    vi.mocked(advertisingService.updateAdSet).mockReset().mockResolvedValue({ id: "as1" } as never);
  });

  it("mounts AdTargetingPanel and creates an ad set", async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    render(
      <AdSetEditor
        campaignId="camp-1"
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByTestId("ad-targeting-panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New ad set" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "First set" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(advertisingService.createAdSet).toHaveBeenCalledWith(
        "camp-1",
        expect.objectContaining({
          name: "First set",
          placementType: "search_top",
          pricingModel: "cpc",
          bidStrategy: "manual",
        }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it("updates an existing ad set", async () => {
    render(
      <AdSetEditor
        campaignId="camp-1"
        open
        onOpenChange={vi.fn()}
        adSet={{
          id: "as-9",
          campaignId: "camp-1",
          name: "Existing",
          placementType: "email",
          pricingModel: "cpm",
          bidStrategy: "maximize_clicks",
          bidAmountCents: 150,
          budgetCents: 10000,
          spentCents: 0,
          targetingJson: {},
          frequencyCapCount: 3,
          frequencyCapHours: 12,
          status: "draft",
          impressions: 0,
          clicks: 0,
          applications: 0,
          startAt: null,
          endAt: null,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Edit ad set" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(advertisingService.updateAdSet).toHaveBeenCalledWith(
        "as-9",
        expect.objectContaining({ name: "Existing", placementType: "email" }),
      );
    });
    expect(advertisingService.createAdSet).not.toHaveBeenCalled();
  });
});
