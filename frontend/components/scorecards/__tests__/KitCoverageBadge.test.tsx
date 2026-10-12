/**
 * Tests for KitCoverageBadge — verifies the self-gating rule (returns
 * null when fully covered or coverage API errors) and the rendered
 * label when uncovered competencies exist.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { KitCoverageBadge } from "../KitCoverageBadge";

vi.mock("@/lib/services/scorecards-service", () => ({
  scorecardsService: {
    getKitCoverage: vi.fn(),
  },
}));

import { scorecardsService } from "@/lib/services/scorecards-service";

describe("KitCoverageBadge", () => {
  beforeEach(() => {
    vi.mocked(scorecardsService.getKitCoverage).mockReset();
  });

  it("renders the warning when at least one competency has no questions", async () => {
    vi.mocked(scorecardsService.getKitCoverage).mockResolvedValue([
      { competencyId: "c1", competencyName: "Tech", hasQuestions: true },
      { competencyId: "c2", competencyName: "Leadership", hasQuestions: false },
    ]);
    render(<KitCoverageBadge kitId="kit-1" />);
    await waitFor(() => {
      expect(screen.getByText(/Leadership/)).toBeInTheDocument();
    });
  });

  it("renders nothing when every competency has at least one question", async () => {
    vi.mocked(scorecardsService.getKitCoverage).mockResolvedValue([
      { competencyId: "c1", competencyName: "Tech", hasQuestions: true },
    ]);
    const { container } = render(<KitCoverageBadge kitId="kit-1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders nothing when the kit uses no competencies (empty list)", async () => {
    vi.mocked(scorecardsService.getKitCoverage).mockResolvedValue([]);
    const { container } = render(<KitCoverageBadge kitId="kit-1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders nothing when the API errors (gracefully degraded)", async () => {
    vi.mocked(scorecardsService.getKitCoverage).mockRejectedValue(new Error("boom"));
    const { container } = render(<KitCoverageBadge kitId="kit-1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
