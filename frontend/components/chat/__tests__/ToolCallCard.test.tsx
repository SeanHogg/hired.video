/**
 * Tests for the inline tool-call card in the AI coach.
 *
 * The card is the *only* surface that gates Apply behaviour for AI-driven
 * resume / profile mutations, so its self-gating is load-bearing:
 *
 *   • Read-only tool result → render summary, NO Apply button.
 *   • Pending mutation + autoApply OFF → render Apply + Discard, click
 *     Apply triggers `commitMutation`, the bubble flips to Applied.
 *   • Pending mutation + autoApply ON → call `commitMutation` on mount
 *     without waiting for a click.
 *   • Discard sets a failed badge without persisting.
 *   • Unknown tool id (e.g. registry was edited mid-session) → render
 *     null instead of crashing the chat.
 *
 * Mocks `commitMutation` and `useAIAutoApply` so the component under test
 * is exercised in isolation.
 *
 * Run: vitest run components/chat/__tests__/ToolCallCard.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/tools/registry", async () => {
  const actual: any = await vi.importActual("@/lib/tools/registry");
  return {
    ...actual,
    commitMutation: vi.fn(),
  };
});

vi.mock("@/lib/hooks/use-ai-auto-apply", () => ({
  useAIAutoApply: vi.fn(() => false),
}));

import { ToolCallCard } from "../ToolCallCard";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import { commitMutation } from "@/lib/tools/registry";
import { useAIAutoApply } from "@/lib/hooks/use-ai-auto-apply";

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderCard(props: {
  toolId: string;
  result: NormalizedToolRunResult;
  onResultChange?: (next: NormalizedToolRunResult) => void;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToolCallCard {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (useAIAutoApply as any).mockReturnValue(false);
});

// ═══════════════════════════════════════════════════════════════════════════
// Read-only tools — render summary, no Apply UX
// ═══════════════════════════════════════════════════════════════════════════

describe("ToolCallCard — read-only tools", () => {
  it("renders the tool's label, summary, and score without an Apply button", () => {
    renderCard({
      toolId: "ai-resume-scorer",
      result: { overallScore: 82, grade: "B+", summary: "Strong overall." },
    });
    expect(screen.getByText(/AI Resume Scorer/i)).toBeInTheDocument();
    expect(screen.getByText("Strong overall.")).toBeInTheDocument();
    expect(screen.getByText(/82\/100/)).toBeInTheDocument();
    expect(screen.getByText(/B\+/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
  });

  it("renders top recommendations when present", () => {
    renderCard({
      toolId: "ai-resume-scorer",
      result: {
        recommendations: [
          { title: "Tighten the summary" },
          { title: "Quantify shipping wins", description: "use %" },
        ],
      },
    });
    expect(screen.getByText("Tighten the summary")).toBeInTheDocument();
    expect(screen.getByText(/Quantify shipping wins/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mutating tools — pending state shows Apply + Discard
// ═══════════════════════════════════════════════════════════════════════════

describe("ToolCallCard — pending mutation, autoApply off", () => {
  it("renders Apply + Discard buttons and the preview text", () => {
    renderCard({
      toolId: "update_resume_summary",
      result: {
        summary: "New resume summary proposed.",
        previewText: "A crisp new summary.",
        mutation: { status: "pending", location: "basics.summary" },
        raw: { kind: "update_resume_summary", resumeId: "r1", summary: "A crisp new summary." },
      },
    });
    expect(screen.getByText("A crisp new summary.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^apply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });

  it("does NOT auto-fire commitMutation when autoApply is off", () => {
    renderCard({
      toolId: "update_resume_summary",
      result: {
        previewText: "x",
        mutation: { status: "pending" },
        raw: { kind: "update_resume_summary", resumeId: "r1", summary: "x" },
      },
    });
    expect(commitMutation).not.toHaveBeenCalled();
  });

  it("calls commitMutation, flips to Applied, and notifies the parent on Apply click", async () => {
    (commitMutation as any).mockResolvedValue({
      summary: "ok",
      mutation: { status: "applied", location: "basics.summary" },
    });
    const onResultChange = vi.fn();

    renderCard({
      toolId: "update_resume_summary",
      result: {
        previewText: "preview",
        mutation: { status: "pending" },
        raw: { kind: "update_resume_summary", resumeId: "r1", summary: "preview" },
      },
      onResultChange,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^apply/i }));
    });

    expect(commitMutation).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText(/Applied/i)).toBeInTheDocument();
    });
    expect(onResultChange).toHaveBeenCalledWith(
      expect.objectContaining({ mutation: { status: "applied", location: "basics.summary" } }),
    );
    // Apply / Discard buttons are gone once the mutation has applied.
    expect(screen.queryByRole("button", { name: /^apply/i })).not.toBeInTheDocument();
  });

  it("Discard flips to a failed badge without calling commitMutation", () => {
    const onResultChange = vi.fn();
    renderCard({
      toolId: "update_resume_summary",
      result: {
        previewText: "preview",
        mutation: { status: "pending" },
        raw: { kind: "update_resume_summary", resumeId: "r1", summary: "preview" },
      },
      onResultChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(commitMutation).not.toHaveBeenCalled();
    // Two nodes mention discard after the click — the "Discarded" badge
    // and the "Edit discarded." summary. We want to confirm both.
    expect(screen.getByText("Discarded")).toBeInTheDocument();
    expect(screen.getByText("Edit discarded.")).toBeInTheDocument();
    expect(onResultChange).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Edit discarded." }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Auto-apply — fires on mount when the user opted in
// ═══════════════════════════════════════════════════════════════════════════

describe("ToolCallCard — autoApply on", () => {
  it("calls commitMutation on mount without waiting for a click", async () => {
    (useAIAutoApply as any).mockReturnValue(true);
    (commitMutation as any).mockResolvedValue({
      mutation: { status: "applied", location: "basics.summary" },
    });

    renderCard({
      toolId: "update_resume_summary",
      result: {
        previewText: "auto",
        mutation: { status: "pending" },
        raw: { kind: "update_resume_summary", resumeId: "r1", summary: "auto" },
      },
    });

    await waitFor(() => {
      expect(commitMutation).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText(/Applied/i)).toBeInTheDocument();
    });
  });

  it("surfaces an 'Auto-apply on' hint while a pending mutation is committing", () => {
    (useAIAutoApply as any).mockReturnValue(true);
    // Leave commitMutation pending so the card stays in the "pending"
    // visual state long enough to assert the hint label.
    (commitMutation as any).mockReturnValue(new Promise(() => {}));

    renderCard({
      toolId: "update_resume_summary",
      result: {
        previewText: "auto",
        mutation: { status: "pending" },
        raw: { kind: "update_resume_summary", resumeId: "r1", summary: "auto" },
      },
    });
    expect(screen.getByText(/Auto-apply on/i)).toBeInTheDocument();
  });

  it("does NOT auto-apply read-only tool results", async () => {
    // Auto-apply is a mutation-only opt-in; non-mutating results should
    // never trigger commitMutation regardless of the setting.
    (useAIAutoApply as any).mockReturnValue(true);
    renderCard({
      toolId: "ai-resume-scorer",
      result: { overallScore: 80 },
    });
    // Wait a microtask + tick so any errant effect would have fired.
    await Promise.resolve();
    expect(commitMutation).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("ToolCallCard — edge cases", () => {
  it("renders nothing for an unknown tool id (registry edited mid-session)", () => {
    const { container } = renderCard({
      toolId: "definitely-not-a-tool",
      result: { summary: "irrelevant" },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a Failed badge when the result already came back failed", () => {
    renderCard({
      toolId: "update_resume_summary",
      result: {
        summary: "503",
        mutation: { status: "failed" },
        raw: { kind: "update_resume_summary", resumeId: "r1", summary: "x" },
      },
    });
    expect(screen.getByText(/Failed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^apply/i })).not.toBeInTheDocument();
  });
});
