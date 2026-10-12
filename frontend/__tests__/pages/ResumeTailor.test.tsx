/**
 * Component tests for ResumeTailor — now an entry point into the kit workspace.
 *
 * The page collects the job (paste / text file / tracked job) and the
 * résumé to start from (the ★ master unless another is picked), then hands
 * off: the kit workspace tailors it in preview and reviews every change on the page.
 * Nothing is tailored or saved from this page.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders, mockAuthValue } from "../test-render";
import ResumeTailor from "../../pages/tools/ResumeTailor";
import { useAuth } from "../../lib/auth";
import { resumeService } from "../../lib/services/resume-service";
import { ToolEmbedProvider } from "../../lib/tools/tool-embed";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));
vi.mock("../../lib/auth");
vi.mock("../../lib/services/resume-service", () => ({
  resumeService: { getUserResumes: vi.fn() },
}));
vi.mock("../../lib/services/job-service", () => ({
  jobService: { getSavedJobs: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../hooks/use-sidebar", () => ({
  useSidebar: () => ({ sidebarOpen: false, sidebarCollapsed: false, openSidebar: vi.fn(), closeSidebar: vi.fn(), toggleSidebar: vi.fn() }),
}));
vi.mock("../../lib/seo", () => ({ useSEO: vi.fn(), useBreadcrumbs: vi.fn() }));
const snapshotMock = vi.fn();
vi.mock("../../hooks/use-pending-tool-input", () => ({
  usePendingToolInput: () => ({ restored: null, snapshot: snapshotMock, clear: vi.fn() }),
}));
vi.mock("../../components/Navigation", () => ({ default: () => <div data-testid="nav" /> }));
vi.mock("../../components/Sidebar", () => ({ default: () => <div data-testid="side" /> }));
vi.mock("../../components/Footer", () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("../../components/ToolFooterSEO", () => ({ default: () => <div data-testid="tool-footer-seo" /> }));
vi.mock("../../components/ToolTierBadge", () => ({ ToolTierBadge: () => <span data-testid="tier-badge" /> }));
vi.mock("../../components/ToolHistoryButton", () => ({ ToolHistoryButton: () => <button data-testid="history-btn" /> }));
vi.mock("../../components/AuthOverlay", () => ({
  default: ({ title }: { title: string }) => <div data-testid="auth-overlay">{title}</div>,
}));

function setAuth(isAuthenticated: boolean) {
  (useAuth as unknown as Mock).mockReturnValue(mockAuthValue(isAuthenticated));
}

const JD = "Senior Frontend Engineer\nRequirements: 5+ years of React and TypeScript.";

function pasteJob() {
  fireEvent.change(screen.getByLabelText(/Paste Job Description or URL/i), { target: { value: JD } });
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth(true);
  (resumeService.getUserResumes as Mock).mockResolvedValue([
    { id: "r-1", title: "Frontend Resume", isMaster: false },
    { id: "m-1", title: "Master Resume", isMaster: true },
  ]);
});

describe("ResumeTailor — hand-off to the kit workspace", () => {
  it("tailors the MASTER by default, carrying the pasted job in router state", async () => {
    renderWithProviders(<ResumeTailor />);
    await waitFor(() => expect(resumeService.getUserResumes).toHaveBeenCalled());
    pasteJob();
    await waitFor(() => expect(screen.getByRole("button", { name: /Tailor my résumé for this job/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Tailor my résumé for this job/i }));
    expect(navigateMock).toHaveBeenCalledWith("/studio/resume/m-1", {
      state: expect.objectContaining({ jobText: JD, createForJob: false }),
    });
  });

  it("'Create a new one' hands off with createForJob", async () => {
    renderWithProviders(<ResumeTailor />);
    await waitFor(() => expect(resumeService.getUserResumes).toHaveBeenCalled());
    pasteJob();
    await waitFor(() => expect(screen.getByRole("button", { name: /Create a new one for this job/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Create a new one for this job/i }));
    expect(navigateMock).toHaveBeenCalledWith("/studio/resume/m-1", {
      state: expect.objectContaining({ createForJob: true }),
    });
  });

  it("is disabled until a job is supplied", async () => {
    renderWithProviders(<ResumeTailor />);
    expect(screen.getByRole("button", { name: /Tailor my résumé for this job/i })).toBeDisabled();
  });
});

describe("ResumeTailor — embedded in the kit workspace", () => {
  it("tailors the résumé open on the page and opens the review there, without navigating", async () => {
    const openReview = vi.fn();
    renderWithProviders(
      <ToolEmbedProvider value={{ resumeId: "r-1", projectId: null, ask: vi.fn(), openReview, report: vi.fn() }}>
        <ResumeTailor />
      </ToolEmbedProvider>,
    );
    await waitFor(() => expect(resumeService.getUserResumes).toHaveBeenCalled());
    pasteJob();
    await waitFor(() => expect(screen.getByRole("button", { name: /Tailor my résumé for this job/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Tailor my résumé for this job/i }));
    expect(openReview).toHaveBeenCalledWith({
      kind: "job",
      create: false,
      job: expect.objectContaining({ jobHtml: JD }),
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe("ResumeTailor — auth gate", () => {
  it("anonymous: shows the sign-in overlay, snapshots the job, does not navigate", async () => {
    setAuth(false);
    renderWithProviders(<ResumeTailor />);
    pasteJob();
    fireEvent.click(screen.getByRole("button", { name: /Tailor my résumé for this job/i }));
    await waitFor(() => expect(screen.getByTestId("auth-overlay")).toBeInTheDocument());
    expect(snapshotMock).toHaveBeenCalledWith(expect.objectContaining({ jobDescription: JD }));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
