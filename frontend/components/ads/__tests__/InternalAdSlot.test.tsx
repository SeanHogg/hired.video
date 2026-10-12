import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import InternalAdSlot from "../InternalAdSlot";
import { advertisingService } from "@/lib/services/advertising-service";

vi.mock("@/lib/services/advertising-service", () => ({
  advertisingService: {
    getServedAd: vi.fn(),
  },
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("InternalAdSlot", () => {
  it("renders nothing when the slot is empty", async () => {
    vi.mocked(advertisingService.getServedAd).mockResolvedValue(null);
    const { container } = wrap(<InternalAdSlot slot="dashboard-banner" />);
    await waitFor(() => {
      expect(advertisingService.getServedAd).toHaveBeenCalledWith("dashboard-banner");
    });
    expect(container.querySelector("[data-slot]")).toBeNull();
  });

  it("shows headline, description, image, and CTA", async () => {
    vi.mocked(advertisingService.getServedAd).mockResolvedValue({
      id: "ad-1",
      headline: "Hire faster",
      description: "Post a job today",
      imageUrl: "https://cdn.example/ad.png",
      ctaText: "Get started",
      ctaUrl: "https://hired.video/jobs",
      destinationUrl: null,
    });
    wrap(<InternalAdSlot slot="dashboard-banner" />);
    expect(await screen.findByText("Hire faster")).toBeInTheDocument();
    expect(screen.getByText("Post a job today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "https://hired.video/jobs",
    );
    expect(document.querySelector('img[src="https://cdn.example/ad.png"]')).toBeTruthy();
  });
});
