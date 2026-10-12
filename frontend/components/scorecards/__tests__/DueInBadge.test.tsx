/**
 * Tests for DueInBadge — verifies the three SLA states (on-track,
 * approaching, overdue) plus the self-gating rules (null when no
 * dueAt, null when already submitted).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DueInBadge } from "../DueInBadge";
import type { ScorecardSubmission } from "@/lib/services/scorecards-service";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-05-25T12:00:00Z");

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
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }) as ScorecardSubmission;

describe("DueInBadge", () => {
  it("renders nothing when there is no dueAt", () => {
    const { container } = render(<DueInBadge submission={sub()} now={NOW} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when status is already submitted", () => {
    const { container } = render(
      <DueInBadge
        submission={sub({
          status: "submitted",
          dueAt: new Date(NOW.getTime() + HOUR_MS).toISOString(),
        })}
        now={NOW}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an on-track outline badge when dueAt is more than 4h away", () => {
    render(
      <DueInBadge
        submission={sub({ dueAt: new Date(NOW.getTime() + 6 * HOUR_MS).toISOString() })}
        now={NOW}
      />,
    );
    expect(screen.getByText(/Due in 6h/)).toBeInTheDocument();
  });

  it("renders an approaching amber badge when within 4h", () => {
    render(
      <DueInBadge
        submission={sub({ dueAt: new Date(NOW.getTime() + 3 * HOUR_MS).toISOString() })}
        now={NOW}
      />,
    );
    expect(screen.getByText(/Due in 3h/)).toBeInTheDocument();
  });

  it("renders an overdue badge when dueAt is in the past", () => {
    render(
      <DueInBadge
        submission={sub({ dueAt: new Date(NOW.getTime() - 12 * HOUR_MS).toISOString() })}
        now={NOW}
      />,
    );
    expect(screen.getByText(/Overdue by 12h/)).toBeInTheDocument();
  });
});
