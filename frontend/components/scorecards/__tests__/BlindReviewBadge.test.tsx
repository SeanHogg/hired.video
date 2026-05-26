/**
 * Tests for BlindReviewBadge — verifies the badge self-gates correctly
 * based on the `_anonymized` flag the API stamps on masked submissions.
 *
 * Run: vitest run components/scorecards/__tests__/BlindReviewBadge.test.tsx
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlindReviewBadge } from "../BlindReviewBadge";
import type { ScorecardSubmission } from "@/lib/services/scorecards-service";

const sub = (overrides: Partial<ScorecardSubmission> = {}): ScorecardSubmission =>
  ({
    id: "s",
    templateId: "t",
    interviewId: null,
    kitStageId: null,
    applicationId: "a",
    candidateUserId: null,
    evaluatorUserId: "e",
    overallRecommendation: null,
    overallScore: null,
    summary: null,
    strengths: null,
    concerns: null,
    status: "draft",
    submittedAt: null,
    dueAt: null,
    remindedAt: null,
    escalatedAt: null,
    createdAt: "2026-05-25T00:00:00Z",
    updatedAt: "2026-05-25T00:00:00Z",
    ...overrides,
  }) as ScorecardSubmission;

describe("BlindReviewBadge", () => {
  it("renders the badge when submission._anonymized is true", () => {
    render(<BlindReviewBadge submission={sub({ _anonymized: true })} />);
    expect(screen.getByText("Identity hidden")).toBeInTheDocument();
  });

  it("renders nothing when submission is null", () => {
    const { container } = render(<BlindReviewBadge submission={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when _anonymized is missing", () => {
    const { container } = render(<BlindReviewBadge submission={sub()} />);
    expect(container.firstChild).toBeNull();
  });
});
