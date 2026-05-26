/**
 * Tests for TakeHomePromptEditor — the editor renders only for take-home
 * stages (self-gating). For other stage kinds it returns null without
 * even hitting the API.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import { TakeHomePromptEditor } from "../TakeHomePromptEditor";

vi.mock("@/lib/services/scorecards-service", () => ({
  scorecardsService: {
    getTakeHome: vi.fn(),
    upsertTakeHome: vi.fn(),
  },
}));

import { scorecardsService } from "@/lib/services/scorecards-service";

describe("TakeHomePromptEditor", () => {
  beforeEach(() => {
    vi.mocked(scorecardsService.getTakeHome).mockReset();
  });

  it("renders nothing when stageKind is 'interview' (no API call)", () => {
    const { container } = render(
      <TakeHomePromptEditor stageId="s1" stageKind="interview" />,
    );
    expect(container.firstChild).toBeNull();
    expect(scorecardsService.getTakeHome).not.toHaveBeenCalled();
  });

  it("renders nothing when stageKind is undefined (legacy stages)", () => {
    const { container } = render(
      <TakeHomePromptEditor stageId="s1" stageKind={undefined as any} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the form when stageKind is 'take_home' and loads existing prompt", async () => {
    vi.mocked(scorecardsService.getTakeHome).mockResolvedValue({
      id: "th1",
      kitStageId: "s1",
      prompt: "Existing prompt",
      deliveryFormat: "github_url",
      dueInHours: 48,
      createdAt: "2026-05-25T00:00:00Z",
      updatedAt: "2026-05-25T00:00:00Z",
    });
    render(<TakeHomePromptEditor stageId="s1" stageKind="take_home" />);
    await waitFor(() => {
      expect(screen.getByText(/Take-home prompt/)).toBeInTheDocument();
      expect(screen.getByDisplayValue("Existing prompt")).toBeInTheDocument();
    });
  });
});
