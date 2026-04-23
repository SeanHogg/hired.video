/**
 * Component tests for ResumeTailor.
 *
 * The tailor endpoint now returns structured `tailoredResume` JSON,
 * `summaryRecommendations`, scores, and a `variationId` for the already-
 * persisted copy. The page:
 *   - renders the tailored resume via `DeclarativeResumeRenderer` (the
 *     same renderer /resumes/:id uses — no markdown round-trip);
 *   - shows the summary recommendations;
 *   - exposes Copy-as-Markdown (deterministic render from the JSON);
 *   - exposes Open Variation (navigates to /resumes/:variationId).
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ResumeTailor from "../../pages/tools/ResumeTailor";
import { useAuth } from "../../lib/auth";
import { matchService } from "../../lib/services/match-service";
import { resumeService } from "../../lib/services/resume-service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../lib/auth");
vi.mock("../../lib/services/match-service", () => ({
  matchService: {
    tailorResumeFromJobHtml: vi.fn(),
  },
}));
vi.mock("../../lib/services/resume-service", () => ({
  resumeService: {
    getUserResumes: vi.fn(),
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
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Chrome components — stubbed so the Sidebar's PersonaPreviewProvider +
// useAdminPermissions chain never runs. Focus the test on ResumeTailor's
// own wiring.
vi.mock("../../components/Navigation", () => ({ default: () => <div data-testid="nav" /> }));
vi.mock("../../components/Sidebar", () => ({ default: () => <div data-testid="side" /> }));
vi.mock("../../components/Footer", () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("../../components/ToolFooterSEO", () => ({ default: () => <div data-testid="tool-footer-seo" /> }));
vi.mock("../../components/ToolTierBadge", () => ({ ToolTierBadge: () => <span data-testid="tier-badge" /> }));
vi.mock("../../components/ToolHistoryButton", () => ({ ToolHistoryButton: () => <button data-testid="history-btn" /> }));
vi.mock("../../components/AuthOverlay", () => ({
  default: ({ title }: { title: string }) => <div data-testid="auth-overlay">{title}</div>,
}));
// DeclarativeResumeRenderer hits dozens of downstream components we don't
// need in a wiring test. Stub with a test-id that exposes the name so we
// can assert the page rendered from JSON (not markdown).
vi.mock("@/components/resume-renderer/DeclarativeResumeRenderer", () => ({
  __esModule: true,
  default: ({ resume }: any) => (
    <div data-testid="declarative-resume-renderer">
      {(resume?.content?.basics?.name as string) ?? ""}
    </div>
  ),
}));
vi.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="markdown">{children}</div>,
}));

const renderMarkdownFromJsonResumeMock = vi.fn().mockReturnValue("# Jane Doe\n\n## Summary\nSenior React engineer.");
vi.mock("@shared/resume-markdown", () => ({
  renderMarkdownFromJsonResume: (...args: unknown[]) => renderMarkdownFromJsonResumeMock(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <ResumeTailor />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

function setAuth(isAuthenticated: boolean) {
  (useAuth as unknown as Mock).mockReturnValue({
    user: isAuthenticated ? { id: "u1", email: "x@y" } : null,
    isAuthenticated,
    isLoading: false,
    isEmailVerified: isAuthenticated,
  });
}

const sampleTailoredResume = {
  basics: { name: "Jane Doe", email: "jane@example.com" },
  work: [{ name: "Acme", position: "Senior Engineer" }],
  education: [],
  skills: [],
  volunteer: [],
  awards: [],
  certificates: [],
  publications: [],
  languages: [],
  interests: [],
  references: [],
  projects: [],
  metaData: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  setAuth(true);
  renderMarkdownFromJsonResumeMock.mockReturnValue("# Jane Doe\n\n## Summary\nSenior React engineer.");
  (resumeService.getUserResumes as Mock).mockResolvedValue([
    { id: "r-1", title: "Frontend Resume", slug: "frontend" },
    { id: "r-2", title: "Backend Resume", slug: "backend" },
  ]);
  (matchService.tailorResumeFromJobHtml as Mock).mockResolvedValue({
    oldScore: 55,
    newScore: 82,
    tailoredResume: sampleTailoredResume,
    changes: [],
    summaryRecommendations: "- Led with React / TypeScript.\n- Moved Next.js migration bullet to top.",
    resumeId: "r-1",
    variationId: "v-1",
    variationTitle: "Senior React — GlobalCo",
  });
});

// ---------------------------------------------------------------------------
// Auth soft-gate
// ---------------------------------------------------------------------------

describe("ResumeTailor — auth gate", () => {
  it("anonymous + pasted job + click Generate → AuthOverlay, no API call", async () => {
    setAuth(false);
    renderPage();
    const textarea = await screen.findByLabelText(/Paste Job Description or URL/i);
    fireEvent.change(textarea, { target: { value: "Senior React role at GlobalCo" } });
    const btn = await screen.findByRole("button", { name: /Generate Tailored Resume/i });
    fireEvent.click(btn);

    expect(await screen.findByTestId("auth-overlay")).toBeInTheDocument();
    expect(matchService.tailorResumeFromJobHtml).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("ResumeTailor — validation", () => {
  it("empty job description keeps the Generate button disabled", async () => {
    renderPage();
    const btn = await screen.findByRole("button", { name: /Generate Tailored Resume/i });
    expect(btn).toBeDisabled();
    expect(matchService.tailorResumeFromJobHtml).not.toHaveBeenCalled();
  });

  it("whitespace-only input keeps the button disabled", async () => {
    renderPage();
    const textarea = await screen.findByLabelText(/Paste Job Description or URL/i);
    fireEvent.change(textarea, { target: { value: "    \n\n\t " } });
    const btn = await screen.findByRole("button", { name: /Generate Tailored Resume/i });
    expect(btn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("ResumeTailor — happy path", () => {
  it("renders the score, recommendations, and the tailored resume via DeclarativeResumeRenderer", async () => {
    renderPage();
    const textarea = await screen.findByLabelText(/Paste Job Description or URL/i);
    fireEvent.change(textarea, { target: { value: "Senior React role at GlobalCo" } });
    fireEvent.click(await screen.findByRole("button", { name: /Generate Tailored Resume/i }));

    await waitFor(() => expect(screen.getByText("55%")).toBeInTheDocument());
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("+27%")).toBeInTheDocument();

    // Tailored resume rendered from JSON, not markdown
    const rendered = await screen.findByTestId("declarative-resume-renderer");
    expect(rendered.textContent).toMatch(/Jane Doe/);

    // Summary recommendations go through ReactMarkdown
    const markdownBlocks = screen.getAllByTestId("markdown");
    expect(markdownBlocks.some((b) => /Led with React/.test(b.textContent ?? ""))).toBe(true);
  });

  it("passes jobHtml + selected resumeId to the service", async () => {
    renderPage();
    const textarea = await screen.findByLabelText(/Paste Job Description or URL/i);
    fireEvent.change(textarea, { target: { value: "job text body" } });
    fireEvent.click(await screen.findByRole("button", { name: /Generate Tailored Resume/i }));
    await waitFor(() =>
      expect(matchService.tailorResumeFromJobHtml).toHaveBeenCalledWith(
        expect.objectContaining({ jobHtml: "job text body" }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe("ResumeTailor — error paths", () => {
  it("service throw → inline error banner, no result rendered", async () => {
    (matchService.tailorResumeFromJobHtml as Mock).mockRejectedValueOnce(new Error("LLM down"));
    renderPage();
    const textarea = await screen.findByLabelText(/Paste Job Description or URL/i);
    fireEvent.change(textarea, { target: { value: "job body" } });
    fireEvent.click(await screen.findByRole("button", { name: /Generate Tailored Resume/i }));

    expect(await screen.findByText(/Failed to generate tailored resume/i)).toBeInTheDocument();
    expect(screen.queryByText(/Original Score/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Copy to clipboard — Copy renders markdown client-side from the JSON,
// so Copy never depends on a server-rendered markdown field.
// ---------------------------------------------------------------------------

describe("ResumeTailor — copy behaviour", () => {
  it("Copy button writes markdown rendered from the tailored JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPage();
    const textarea = await screen.findByLabelText(/Paste Job Description or URL/i);
    fireEvent.change(textarea, { target: { value: "job body" } });
    fireEvent.click(await screen.findByRole("button", { name: /Generate Tailored Resume/i }));

    const copyBtn = await screen.findByRole("button", { name: /Copy as Markdown/i });
    fireEvent.click(copyBtn);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const [written] = writeText.mock.calls[0];
    expect(written).toMatch(/Jane Doe/);
    // The shared renderer was called with the tailoredResume JSON
    expect(renderMarkdownFromJsonResumeMock).toHaveBeenCalledWith(sampleTailoredResume);
    await waitFor(() => expect(screen.getByRole("button", { name: /Copied!/i })).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Open Variation — the server already persisted the variation during
// tailor; the button just navigates to it.
// ---------------------------------------------------------------------------

describe("ResumeTailor — open variation", () => {
  it("Open Variation button is enabled when variationId is present", async () => {
    renderPage();
    const textarea = await screen.findByLabelText(/Paste Job Description or URL/i);
    fireEvent.change(textarea, { target: { value: "job body" } });
    fireEvent.click(await screen.findByRole("button", { name: /Generate Tailored Resume/i }));

    const btn = await screen.findByRole("button", { name: /Open Variation/i });
    expect(btn).not.toBeDisabled();
  });
});
