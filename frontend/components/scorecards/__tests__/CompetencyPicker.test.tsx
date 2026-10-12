/**
 * Tests for CompetencyPicker — self-gates when the company has no
 * competencies yet (returns null so the template editor doesn't show
 * an empty dropdown).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CompetencyPicker } from "../CompetencyPicker";

vi.mock("@/lib/services/scorecards-service", () => ({
  scorecardsService: {
    listCompetencies: vi.fn(),
  },
}));

import { scorecardsService } from "@/lib/services/scorecards-service";

describe("CompetencyPicker", () => {
  beforeEach(() => {
    vi.mocked(scorecardsService.listCompetencies).mockReset();
  });

  it("renders nothing when the company has no competencies yet", async () => {
    vi.mocked(scorecardsService.listCompetencies).mockResolvedValue([]);
    const { container } = render(
      <CompetencyPicker
        companyId="company-1"
        value={null}
        onChange={() => {}}
      />,
    );
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders the dropdown when at least one competency exists", async () => {
    vi.mocked(scorecardsService.listCompetencies).mockResolvedValue([
      {
        id: "c1",
        companyId: "company-1",
        name: "Tech Depth",
        description: null,
        taxonomy: "technical",
        isArchived: false,
        createdAt: "2026-05-25T00:00:00Z",
        updatedAt: "2026-05-25T00:00:00Z",
      },
    ]);
    render(
      <CompetencyPicker
        companyId="company-1"
        value={null}
        onChange={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Competency")).toBeInTheDocument();
    });
  });
});
