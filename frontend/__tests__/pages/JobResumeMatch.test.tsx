/**
 * Component tests for JobResumeMatch.
 *
 * The component is a 3-step wizard (job → resume → results). Each step
 * is its own child component with its own sub-flow (URL, paste, file).
 * Rather than replicate all that state here, we MOCK the step children
 * and drive the wizard via the callbacks they invoke. That keeps these
 * tests focused on:
 *   - the wizard state machine (currentStep transitions)
 *   - the service call wiring (matchJobWithResume called with the right
 *     params, result set on success, error banner on failure)
 *   - the auth soft-gate (anonymous users hit the AuthOverlay without
 *     firing a billable API call)
 *   - results rendering
 *
 * These are the corners that kept breaking — the inner JobInputStep /
 * ResumeSelectionStep / MatchResultsStep each have their own test file
 * (or should) and aren't exercised here.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders, mockAuthValue } from "../test-render";
import JobResumeMatch from "../../pages/tools/JobResumeMatch";
import { useAuth } from "../../lib/auth";
import { matchService } from "../../lib/services/match-service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../lib/auth");
vi.mock("../../lib/services/match-service", () => ({
  matchService: {
    matchJobWithResume: vi.fn(),
  },
}));
vi.mock("../../hooks/use-sidebar", () => ({
  useSidebar: () => ({
    sidebarOpen: false,
    sidebarCollapsed: false,
    openSidebar: vi.fn(),
    closeSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
  }),
}));
vi.mock("../../lib/seo", () => ({
  useSEO: vi.fn(),
  useBreadcrumbs: vi.fn(),
}));
vi.mock("../../hooks/use-pending-tool-input", () => ({
  usePendingToolInput: () => ({
    restored: null,
    snapshot: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock("../../lib/tools/use-tool-run-recorder", () => ({
  useToolRunRecorder: () => ({ recordRun: vi.fn().mockResolvedValue(undefined) }),
}));

// Chrome-heavy descendants — render as stubs so we assert on wizard wiring.
vi.mock("../../components/Navigation", () => ({ default: () => <div data-testid="nav" /> }));
vi.mock("../../components/Sidebar", () => ({ default: () => <div data-testid="side" /> }));
vi.mock("../../components/Footer", () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("../../components/ToolFooterSEO", () => ({ default: () => <div data-testid="tool-footer-seo" /> }));
vi.mock("../../components/ToolTierBadge", () => ({ ToolTierBadge: () => <span data-testid="tier-badge" /> }));
vi.mock("../../components/ToolHistoryButton", () => ({ ToolHistoryButton: () => <button data-testid="history-btn" /> }));
vi.mock("../../components/AuthOverlay", () => ({
  default: ({ title }: { title: string }) => <div data-testid="auth-overlay">{title}</div>,
}));

// Mock the three step components — their `onJobSelected` /
// `onResumeSelected` callbacks are what drive the wizard. We expose
// buttons the tests click to trigger those callbacks deterministically.
vi.mock("../../components/tools/JobInputStep", () => ({
  default: ({ onJobSelected }: { onJobSelected: (d: any) => void }) => (
    <div data-testid="step-job">
      <button
        data-testid="pick-job-from-existing"
        onClick={() => onJobSelected({ jobId: "job-uuid-1", source: "existing" })}
      >
        Pick existing
      </button>
      <button
        data-testid="pick-job-from-paste"
        onClick={() =>
          onJobSelected({ jobContent: "Senior Engineer, React, TS", source: "paste" })
        }
      >
        Paste job
      </button>
    </div>
  ),
}));

vi.mock("../../components/tools/ResumeSelectionStep", () => ({
  default: ({ onResumeSelected }: { onResumeSelected: (d: any) => void }) => (
    <div data-testid="step-resume">
      <button
        data-testid="pick-resume-existing"
        onClick={() => onResumeSelected({ resumeId: "resume-uuid-1", source: "existing" })}
      >
        Pick resume
      </button>
      <button
        data-testid="pick-resume-paste"
        onClick={() =>
          onResumeSelected({ resumeContent: "My resume content here", source: "paste" })
        }
      >
        Paste resume
      </button>
    </div>
  ),
}));

vi.mock("../../components/tools/MatchResultsStep", () => ({
  default: ({ matchResult }: { matchResult: any }) => (
    <div data-testid="step-results">
      <div data-testid="score">{matchResult.score}</div>
      <div data-testid="recs">{matchResult.summaryRecommendations}</div>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return renderWithProviders(<JobResumeMatch />);
}

function setAuth(isAuthenticated: boolean) {
  (useAuth as unknown as Mock).mockReturnValue(mockAuthValue(isAuthenticated));
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth(true);
  (matchService.matchJobWithResume as Mock).mockResolvedValue({
    score: 82,
    summaryRecommendations: "- Highlight React depth.\n- Lead with Next.js metrics.",
    resumeId: "resume-uuid-1",
    sourceUrl: "https://example.com/jobs/1",
  });
});

// ---------------------------------------------------------------------------
// Wizard state machine
// ---------------------------------------------------------------------------

describe("JobResumeMatch — wizard state machine", () => {
  it("starts on the job step", () => {
    renderPage();
    expect(screen.getByTestId("step-job")).toBeInTheDocument();
    expect(screen.queryByTestId("step-resume")).not.toBeInTheDocument();
    expect(screen.queryByTestId("step-results")).not.toBeInTheDocument();
  });

  it("advances to the resume step after a job is selected", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("pick-job-from-existing"));
    await waitFor(() => expect(screen.getByTestId("step-resume")).toBeInTheDocument());
    expect(screen.queryByTestId("step-job")).not.toBeInTheDocument();
  });

  it("advances to results after a resume is selected (authenticated path)", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("pick-job-from-existing"));
    fireEvent.click(await screen.findByTestId("pick-resume-existing"));
    const score = await screen.findByTestId("score");
    expect(score.textContent).toBe("82");
  });
});

// ---------------------------------------------------------------------------
// Service wiring — the right endpoint gets called with the right payload
// ---------------------------------------------------------------------------

describe("JobResumeMatch — service call wiring", () => {
  it("passes jobId + resumeId when both come from existing records", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("pick-job-from-existing"));
    fireEvent.click(await screen.findByTestId("pick-resume-existing"));
    await waitFor(() =>
      expect(matchService.matchJobWithResume).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: "job-uuid-1", resumeId: "resume-uuid-1" }),
      ),
    );
  });

  it("passes jobContent when the user pastes a job description", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("pick-job-from-paste"));
    fireEvent.click(await screen.findByTestId("pick-resume-existing"));
    await waitFor(() =>
      expect(matchService.matchJobWithResume).toHaveBeenCalledWith(
        expect.objectContaining({
          jobContent: "Senior Engineer, React, TS",
          resumeId: "resume-uuid-1",
        }),
      ),
    );
  });

  it("passes resumeContent when the user pastes a resume", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("pick-job-from-existing"));
    fireEvent.click(await screen.findByTestId("pick-resume-paste"));
    await waitFor(() =>
      expect(matchService.matchJobWithResume).toHaveBeenCalledWith(
        expect.objectContaining({ resumeContent: "My resume content here" }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Auth soft-gate — anonymous users can see the steps but NOT hit the API
// ---------------------------------------------------------------------------

describe("JobResumeMatch — auth soft-gate", () => {
  it("shows AuthOverlay on resume submission when anonymous — no API call", async () => {
    setAuth(false);
    renderPage();
    fireEvent.click(screen.getByTestId("pick-job-from-existing"));
    fireEvent.click(await screen.findByTestId("pick-resume-existing"));
    expect(await screen.findByTestId("auth-overlay")).toBeInTheDocument();
    expect(matchService.matchJobWithResume).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error paths — API failure surfaces an inline error, no crash, stays on
// the resume step so the user can retry.
// ---------------------------------------------------------------------------

describe("JobResumeMatch — error paths", () => {
  it("shows an error banner when the match service throws", async () => {
    (matchService.matchJobWithResume as Mock).mockRejectedValueOnce(
      new Error("Network down"),
    );
    renderPage();
    fireEvent.click(screen.getByTestId("pick-job-from-existing"));
    fireEvent.click(await screen.findByTestId("pick-resume-existing"));
    // Error message surfaces; results step never renders.
    await waitFor(() => {
      expect(screen.queryByTestId("step-results")).not.toBeInTheDocument();
    });
    expect(
      await screen.findByText(/Failed to analyze the job and resume/i),
    ).toBeInTheDocument();
  });

  it("does NOT advance to results when the API returns a rejection", async () => {
    (matchService.matchJobWithResume as Mock).mockRejectedValueOnce(
      new Error("Rate limited"),
    );
    renderPage();
    fireEvent.click(screen.getByTestId("pick-job-from-existing"));
    fireEvent.click(await screen.findByTestId("pick-resume-existing"));
    await waitFor(() =>
      expect(screen.queryByTestId("score")).not.toBeInTheDocument(),
    );
  });
});
