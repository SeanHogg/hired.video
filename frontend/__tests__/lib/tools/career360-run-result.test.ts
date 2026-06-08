/**
 * Unit tests for the Career 360 → tool-run mapper.
 *
 * Career 360 records each plan build as a "career-360" tool run so the
 * header's "View History" sheet has something to show (the bug: it never
 * recorded, so history was permanently empty). These tests pin the
 * readiness math and the persisted result shape so the sparkline keeps
 * trending the right direction as gaps close.
 */

import { describe, it, expect } from "vitest";
import {
  computeTargetReadiness,
  buildCareer360RunRecord,
} from "@/lib/tools/career360-run-result";
import type { Gap, SelectedTarget } from "@shared/career360-types";

function gap(overrides: Partial<Gap> = {}): Gap {
  return {
    id: "g1",
    category: "skills",
    severity: "high",
    label: "No Kubernetes experience",
    currentValue: "Docker only",
    targetValue: "Production K8s",
    suggestedActions: ["Ship a service to a managed K8s cluster"],
    toolId: undefined,
    ...overrides,
  };
}

function target(gaps: Gap[]): SelectedTarget {
  return {
    id: "t1",
    title: "Staff Platform Engineer",
    seniority: "Staff",
    description: "Lead platform reliability.",
    why: "Builds on your SRE background.",
    timelineMonths: 12,
    chosenAt: "2026-06-07T00:00:00.000Z",
    rubric: {
      mustHaveSkills: [],
      niceToHaveSkills: [],
      expectedCertifications: [],
    },
    gaps,
    roadmap: [],
    lastRefreshedAt: "2026-06-07T00:00:00.000Z",
  };
}

describe("computeTargetReadiness", () => {
  it("returns 100 when there are no open gaps", () => {
    expect(computeTargetReadiness([])).toBe(100);
  });

  it("subtracts per-gap penalties by severity", () => {
    // high(20) + medium(10) + low(4) = 34 → 66
    const gaps = [
      gap({ severity: "high" }),
      gap({ id: "g2", severity: "medium" }),
      gap({ id: "g3", severity: "low" }),
    ];
    expect(computeTargetReadiness(gaps)).toBe(66);
  });

  it("floors at 0 instead of going negative", () => {
    const gaps = Array.from({ length: 10 }, (_, i) =>
      gap({ id: `g${i}`, severity: "high" }),
    );
    expect(computeTargetReadiness(gaps)).toBe(0);
  });

  it("trends up as gaps are closed (boundary case)", () => {
    const before = computeTargetReadiness([
      gap({ severity: "high" }),
      gap({ id: "g2", severity: "medium" }),
    ]);
    const after = computeTargetReadiness([gap({ id: "g2", severity: "medium" })]);
    expect(after).toBeGreaterThan(before);
  });
});

describe("buildCareer360RunRecord", () => {
  it("maps score, summary, and a renderable result", () => {
    const record = buildCareer360RunRecord(
      target([gap({ severity: "high" }), gap({ id: "g2", severity: "low" })]),
    );

    // 100 - (20 + 4) = 76
    expect(record.score).toBe(76);
    expect(record.summary).toBe(
      "Staff Platform Engineer (Staff) — 76/100 readiness, 2 open gaps",
    );
    expect(record.result.overallScore).toBe(76);
    // Gaps surface as weaknesses + tier-coded recommendations.
    expect(record.result.weaknesses).toHaveLength(2);
    expect(record.result.recommendations?.[0]).toMatchObject({
      category: "critical",
      title: "No Kubernetes experience",
    });
    expect(record.result.extras).toEqual(
      expect.arrayContaining([
        { label: "Open gaps", value: "2" },
        { label: "Timeline", value: "12 months" },
      ]),
    );
  });

  it("orders recommendations worst-first regardless of input order", () => {
    const record = buildCareer360RunRecord(
      target([
        gap({ id: "low", severity: "low", label: "low gap" }),
        gap({ id: "high", severity: "high", label: "high gap" }),
      ]),
    );
    expect(record.result.recommendations?.map((r) => r.category)).toEqual([
      "critical",
      "minor",
    ]);
  });

  it("singularises the open-gap count", () => {
    const record = buildCareer360RunRecord(target([gap()]));
    expect(record.summary).toContain("1 open gap");
    expect(record.summary).not.toContain("1 open gaps");
  });
});
