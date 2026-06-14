/**
 * Unit coverage for the Career 360 inner-ring outcome math (gap #421).
 *
 * `computeOutcomes` is the pure mapping from a `saved_jobs` funnel
 * aggregate + the active-target gaps onto the four inner-ring signals
 * (Callbacks / Interviews / Offers / Goal Fit). The DB read that feeds
 * `FunnelCounts` is exercised separately; here we pin the parts that are
 * easy to silently break: the sample-size floors (so a couple of
 * applications can't paint the ring), the good/moderate/poor band
 * cut-offs, and the goal-fit severity inversion.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeOutcomes,
  type FunnelCounts,
} from "../Career360Service.js";
import {
  OUTCOME_SEGMENT_IDS,
  type CareerTargetDoc,
  type Gap,
  type OutcomeSegmentId,
  type OutcomeSignal,
} from "../../../../../shared/career360-types.js";

const NO_FUNNEL: FunnelCounts = { applied: 0, interviewed: 0, offered: 0 };

function signal(outcomes: OutcomeSignal[], id: OutcomeSegmentId): OutcomeSignal {
  const found = outcomes.find((o) => o.id === id);
  assert.ok(found, `missing outcome ${id}`);
  return found;
}

/** Minimal active-target doc carrying just the gaps goal-fit reads. */
function docWithGaps(severities: Gap["severity"][]): CareerTargetDoc {
  const gaps: Gap[] = severities.map((severity, i) => ({
    id: `gap_${i}`,
    category: "skills",
    severity,
    label: `gap ${i}`,
    currentValue: "x",
    targetValue: "y",
    suggestedActions: ["do z"],
  }));
  return {
    selected: {
      id: "t1",
      title: "Staff Engineer",
      description: "d",
      why: "w",
      timelineMonths: 12,
      chosenAt: "2026-01-01T00:00:00.000Z",
      rubric: { mustHaveSkills: [], niceToHaveSkills: [], expectedCertifications: [] },
      gaps,
      roadmap: [],
      lastRefreshedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("computeOutcomes — shape + ordering", () => {
  it("always returns the four segments in blueprint order", () => {
    const out = computeOutcomes(NO_FUNNEL, null);
    assert.deepEqual(
      out.map((o) => o.id),
      [...OUTCOME_SEGMENT_IDS],
    );
  });

  it("reports 'unknown' for every signal when there is no data at all", () => {
    const out = computeOutcomes(NO_FUNNEL, null);
    for (const o of out) {
      assert.equal(o.health, "unknown", `${o.id} should be unknown`);
      assert.equal(o.rate, null);
    }
  });
});

describe("computeOutcomes — sample-size floors", () => {
  it("keeps callbacks/offers 'unknown' below the 3-application floor", () => {
    // 2 applied, both reached interview — a perfect ratio, but too few to trust.
    const out = computeOutcomes({ applied: 2, interviewed: 2, offered: 1 }, null);
    assert.equal(signal(out, "callback-rate").health, "unknown");
    assert.equal(signal(out, "offer-rate").health, "unknown");
    assert.equal(signal(out, "callback-rate").sampleSize, 2);
  });

  it("keeps interview-conversion 'unknown' below the 2-interview floor", () => {
    const out = computeOutcomes({ applied: 10, interviewed: 1, offered: 1 }, null);
    assert.equal(signal(out, "interview-conversion").health, "unknown");
  });
});

describe("computeOutcomes — funnel banding", () => {
  it("bands callback rate good/moderate/poor at the documented cut-offs", () => {
    // good: 4/10 = 0.40 ≥ 0.30
    assert.equal(
      signal(computeOutcomes({ applied: 10, interviewed: 4, offered: 0 }, null), "callback-rate")
        .health,
      "good",
    );
    // moderate: 2/10 = 0.20, between 0.12 and 0.30
    assert.equal(
      signal(computeOutcomes({ applied: 10, interviewed: 2, offered: 0 }, null), "callback-rate")
        .health,
      "moderate",
    );
    // poor: 1/20 = 0.05 < 0.12
    assert.equal(
      signal(computeOutcomes({ applied: 20, interviewed: 1, offered: 0 }, null), "callback-rate")
        .health,
      "poor",
    );
  });

  it("computes the offer rate over applications, not interviews", () => {
    // 2 offers / 20 applied = 0.10 (moderate band: ≥0.04, <0.12)
    const offer = signal(
      computeOutcomes({ applied: 20, interviewed: 5, offered: 2 }, null),
      "offer-rate",
    );
    assert.equal(offer.sampleSize, 20);
    assert.ok(Math.abs((offer.rate ?? 0) - 0.1) < 1e-9);
    assert.equal(offer.health, "moderate");
  });
});

describe("computeOutcomes — goal fit", () => {
  it("is 'unknown' with no active target", () => {
    assert.equal(signal(computeOutcomes(NO_FUNNEL, null), "goal-fit").health, "unknown");
  });

  it("scores all-low-severity gaps as 'good' (fit ≈ 1)", () => {
    const out = signal(computeOutcomes(NO_FUNNEL, docWithGaps(["low", "low"])), "goal-fit");
    assert.equal(out.health, "good");
    assert.equal(out.rate, 1);
    assert.equal(out.sampleSize, 2);
  });

  it("scores all-high-severity gaps as 'poor' (fit = 0)", () => {
    const out = signal(computeOutcomes(NO_FUNNEL, docWithGaps(["high", "high"])), "goal-fit");
    assert.equal(out.health, "poor");
    assert.equal(out.rate, 0);
  });

  it("scores a mixed bag in the moderate band", () => {
    // mean severity = (2 + 1 + 0)/3 = 1 → fit = 0.5 → moderate (≥0.34, <0.7)
    const out = signal(
      computeOutcomes(NO_FUNNEL, docWithGaps(["high", "medium", "low"])),
      "goal-fit",
    );
    assert.ok(Math.abs((out.rate ?? 0) - 0.5) < 1e-9);
    assert.equal(out.health, "moderate");
  });
});
