/**
 * Tests for InterviewerReliabilityPanel — self-gates when the user has
 * no SLA-bound history AND no overdue drafts AND no 30-day activity.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { InterviewerReliabilityPanel } from "../InterviewerReliabilityPanel";

vi.mock("@/lib/services/scorecards-service", () => ({
  scorecardsService: {
    getReliability: vi.fn(),
  },
}));

import { scorecardsService } from "@/lib/services/scorecards-service";

describe("InterviewerReliabilityPanel", () => {
  beforeEach(() => {
    vi.mocked(scorecardsService.getReliability).mockReset();
  });

  it("renders nothing when user has zero SLA history + zero recent activity", async () => {
    vi.mocked(scorecardsService.getReliability).mockResolvedValue({
      evaluatorUserId: "u1",
      totalWithSla: 0,
      onTimeCount: 0,
      lateCount: 0,
      overdueDraftCount: 0,
      avgLagMs: null,
      last30dCount: 0,
    });
    const { container } = render(<InterviewerReliabilityPanel userId="u1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders the panel with computed on-time %", async () => {
    vi.mocked(scorecardsService.getReliability).mockResolvedValue({
      evaluatorUserId: "u1",
      totalWithSla: 10,
      onTimeCount: 8,
      lateCount: 2,
      overdueDraftCount: 0,
      avgLagMs: -3_600_000,
      last30dCount: 5,
    });
    render(<InterviewerReliabilityPanel userId="u1" />);
    await waitFor(() => {
      expect(screen.getByText("80%")).toBeInTheDocument();
      expect(screen.getByText(/1h early/)).toBeInTheDocument();
    });
  });

  it("renders even with no SLA submissions but with overdue drafts (signal to fix now)", async () => {
    vi.mocked(scorecardsService.getReliability).mockResolvedValue({
      evaluatorUserId: "u1",
      totalWithSla: 0,
      onTimeCount: 0,
      lateCount: 0,
      overdueDraftCount: 3,
      avgLagMs: null,
      last30dCount: 0,
    });
    render(<InterviewerReliabilityPanel userId="u1" />);
    await waitFor(() => {
      expect(screen.getByText(/3 overdue/)).toBeInTheDocument();
    });
  });

  it("renders nothing when the API call fails", async () => {
    vi.mocked(scorecardsService.getReliability).mockRejectedValue(new Error("boom"));
    const { container } = render(<InterviewerReliabilityPanel userId="u1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
