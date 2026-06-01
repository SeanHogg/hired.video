/**
 * Component tests for AIResumeScorer.
 *
 * Regression: the file-upload path used to call `apiClient.requestRaw` for
 * `/api/resume/parse`, which doesn't unwrap the standard `{ data: ... }`
 * envelope. The page then read `parseResult.result` (undefined on the
 * envelope) and the `||` fallback fed the whole envelope object into
 * `scoreResume`, where `content.trim()` blew up with "e.trim is not a
 * function". The fix uses `apiClient.post` (envelope-unwrapping) so
 * `parseResult.result` actually resolves. These tests pin the contract:
 * the score endpoint must always receive a string `resumeText`.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders, mockAuthValue } from "../test-render";
import AIResumeScorer from "../../pages/tools/AIResumeScorer";
import { useAuth } from "../../lib/auth";
import { apiClient } from "../../lib/api-client";
import { extractTextFromFile } from "../../lib/extract-text";
import { resumeService } from "../../lib/services/resume-service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../lib/auth");
vi.mock("../../lib/api-client", () => ({
  apiClient: { post: vi.fn(), requestRaw: vi.fn() },
}));
vi.mock("../../lib/extract-text", () => ({
  extractTextFromFile: vi.fn(),
}));
vi.mock("../../lib/services/resume-service", () => ({
  resumeService: {
    getUserResumes: vi.fn(),
    getResumeById: vi.fn(),
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
vi.mock("../../lib/tools/use-tool-entity-params", () => ({
  useToolEntityParams: () => ({ resumeId: undefined }),
}));

// Chrome — stubbed so the test focuses on AIResumeScorer's own wiring.
vi.mock("../../components/Navigation", () => ({ default: () => <div data-testid="nav" /> }));
vi.mock("../../components/Sidebar", () => ({ default: () => <div data-testid="side" /> }));
vi.mock("../../components/Footer", () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("../../components/ToolFooterSEO", () => ({ default: () => <div data-testid="tool-footer-seo" /> }));
vi.mock("../../components/AuthOverlay", () => ({
  default: ({ title }: { title: string }) => <div data-testid="auth-overlay">{title}</div>,
}));
vi.mock("../../components/tools/ToolPageHeader", () => ({
  ToolPageHeader: ({ title }: { title: React.ReactNode }) => (
    <h1 data-testid="tool-header">{title}</h1>
  ),
}));

// Radix Tabs don't switch on `fireEvent.click` in jsdom (they hook
// pointerdown/keydown). Replace with a minimal click-switchable Tabs so
// tests can drive tab navigation without pulling in @testing-library/user-event.
vi.mock("@/components/ui/tabs", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{ value: string; setValue: (v: string) => void } | null>(null);
  return {
    Tabs: ({ defaultValue, children }: { defaultValue?: string; children: React.ReactNode }) => {
      const [value, setValue] = React.useState(defaultValue ?? "");
      return <Ctx.Provider value={{ value, setValue }}>{children}</Ctx.Provider>;
    },
    TabsList: ({ children }: { children: React.ReactNode }) => (
      <div role="tablist">{children}</div>
    ),
    TabsTrigger: ({
      children,
      value,
      disabled,
    }: {
      children: React.ReactNode;
      value: string;
      disabled?: boolean;
    }) => {
      const ctx = React.useContext(Ctx);
      return (
        <button role="tab" disabled={disabled} onClick={() => ctx?.setValue(value)}>
          {children}
        </button>
      );
    },
    TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const ctx = React.useContext(Ctx);
      if (ctx?.value !== value) return null;
      return <div role="tabpanel">{children}</div>;
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_SCORE = {
  overallScore: 74,
  atsScore: 78,
  contentScore: 72,
  keywordScore: 70,
  formatScore: 76,
  impactScore: 71,
  grade: "B",
  strengths: ["Clear structure"],
  weaknesses: ["Could add more measurable outcomes"],
  recommendations: [
    {
      severity: "important" as const,
      category: "impact",
      title: "Add quantified achievements",
      description: "Include metrics.",
      impact: 8,
    },
  ],
};

function envelope<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function renderPage() {
  return renderWithProviders(<AIResumeScorer />);
}

function setAuth(isAuthenticated: boolean) {
  (useAuth as unknown as Mock).mockReturnValue(mockAuthValue(isAuthenticated));
}

/** Route `apiClient.post` by URL so each test only declares what it needs. */
function routePost(handlers: Record<string, (body: unknown) => unknown>) {
  (apiClient.post as Mock).mockImplementation((url: string, body: unknown) => {
    const match = Object.keys(handlers).find((k) => url.toLowerCase().includes(k));
    if (!match) {
      return Promise.reject(new Error(`Unmocked POST: ${url}`));
    }
    return Promise.resolve(envelope(handlers[match](body)));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth(true);
  (resumeService.getUserResumes as Mock).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe("AIResumeScorer — auth gate", () => {
  it("anonymous + paste text + click Score → AuthOverlay, no API call", async () => {
    setAuth(false);
    renderPage();
    const textarea = await screen.findByPlaceholderText(/Paste your resume text/i);
    fireEvent.change(textarea, { target: { value: "Some resume body" } });
    fireEvent.click(await screen.findByRole("button", { name: /Score My Resume/i }));

    expect(await screen.findByTestId("auth-overlay")).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("AIResumeScorer — validation", () => {
  it("empty text keeps the Score button disabled", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Paste Text/i }));
    const btn = await screen.findByRole("button", { name: /Score My Resume/i });
    expect(btn).toBeDisabled();
  });

  it("rejects an unsupported file type with an inline error and no API call", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Upload File/i }));
    const input = document.getElementById("resume-upload") as HTMLInputElement;
    const badFile = new File(["binary"], "resume.exe", { type: "application/x-msdownload" });
    fireEvent.change(input, { target: { files: [badFile] } });

    expect(await screen.findByText(/Please upload a PDF, Word, Markdown, JSON, or text file/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// File upload — regression for the envelope-unwrapping bug
// ---------------------------------------------------------------------------

describe("AIResumeScorer — file upload (regression: e.trim is not a function)", () => {
  it("passes the parsed-resume STRING (not the envelope object) to the score endpoint", async () => {
    (extractTextFromFile as Mock).mockResolvedValue("Sean Hogg\nSenior Engineer\n");
    const parsedJsonString = JSON.stringify({
      basics: { name: "Sean Hogg" },
      work: [{ name: "Acme", position: "Senior Engineer" }],
    });
    routePost({
      "/resume/parse": () => ({ result: parsedJsonString }),
      "/resumescorer/score": () => SAMPLE_SCORE,
    });

    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Upload File/i }));
    const input = document.getElementById("resume-upload") as HTMLInputElement;
    const file = new File(["Sean Hogg\nSenior Engineer"], "sean-hogg.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(await screen.findByRole("button", { name: /Score My Resume/i }));

    // Score eventually rendered — proves the flow didn't blow up mid-pipeline.
    await waitFor(() => expect(screen.getByText("74")).toBeInTheDocument());
    expect(screen.getByText("B")).toBeInTheDocument();

    // Both endpoints were called.
    const calls = (apiClient.post as Mock).mock.calls;
    const parseCall = calls.find(([url]) => /\/resume\/parse$/i.test(url as string));
    const scoreCall = calls.find(([url]) => /\/resumescorer\/score$/i.test(url as string));
    expect(parseCall).toBeDefined();
    expect(scoreCall).toBeDefined();

    // The bug: the score endpoint was being handed an OBJECT, not a string,
    // because the envelope was never unwrapped. Pin the contract here.
    const scoreBody = scoreCall![1] as { resumeText: unknown };
    expect(typeof scoreBody.resumeText).toBe("string");
    expect(scoreBody.resumeText).toBe(parsedJsonString);
  });

  it("falls back to the extracted text when /resume/parse returns no `result` field", async () => {
    // Defensive case — even if the parse endpoint shape regresses, the
    // score endpoint must still receive a string (not an object).
    (extractTextFromFile as Mock).mockResolvedValue("raw extracted resume text");
    routePost({
      "/resume/parse": () => ({}), // no `result` — simulate shape drift
      "/resumescorer/score": () => SAMPLE_SCORE,
    });

    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Upload File/i }));
    const input = document.getElementById("resume-upload") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "r.txt", { type: "text/plain" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Score My Resume/i }));

    await waitFor(() => expect(screen.getByText("74")).toBeInTheDocument());
    const scoreCall = (apiClient.post as Mock).mock.calls.find(([url]) =>
      /\/resumescorer\/score$/i.test(url as string),
    );
    expect(scoreCall![1]).toEqual({ resumeText: "raw extracted resume text" });
  });

  it("shows an inline error and skips the score call when extraction yields nothing", async () => {
    (extractTextFromFile as Mock).mockResolvedValue("   ");
    (apiClient.post as Mock).mockResolvedValue(envelope(SAMPLE_SCORE));

    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Upload File/i }));
    const input = document.getElementById("resume-upload") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([""], "r.txt", { type: "text/plain" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Score My Resume/i }));

    expect(await screen.findByText(/Could not extract text from this file/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Paste-text happy path
// ---------------------------------------------------------------------------

describe("AIResumeScorer — paste text", () => {
  it("submits the pasted text directly and renders the score", async () => {
    routePost({ "/resumescorer/score": () => SAMPLE_SCORE });

    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Paste Text/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Paste your resume text/i), {
      target: { value: "Resume body goes here" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Score My Resume/i }));

    await waitFor(() => expect(screen.getByText("74")).toBeInTheDocument());
    const [url, body] = (apiClient.post as Mock).mock.calls[0];
    expect(url).toMatch(/\/resumescorer\/score$/i);
    expect(body).toEqual({ resumeText: "Resume body goes here" });
    // /resume/parse must NOT be called for the paste-text flow — it's only
    // for files that need AI parsing.
    expect(
      (apiClient.post as Mock).mock.calls.some(([u]) => /\/resume\/parse$/i.test(u as string)),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("AIResumeScorer — error paths", () => {
  it("score-endpoint rejection surfaces an inline error and no result", async () => {
    (apiClient.post as Mock).mockRejectedValueOnce(new Error("LLM down"));

    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Paste Text/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Paste your resume text/i), {
      target: { value: "Resume body" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Score My Resume/i }));

    expect(await screen.findByText(/LLM down/i)).toBeInTheDocument();
    expect(screen.queryByText(/Your Resume Score/i)).not.toBeInTheDocument();
  });
});
