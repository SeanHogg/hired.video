/**
 * Pure-function tests for the live-screening scheduler.
 *
 * Covers windowCapacity, buildBackToBackSchedule, and generateInviteToken.
 * No DB, no HTTP — every input is a plain JS value. The route layer
 * (routes/live-screen.ts) is thin glue around these functions; testing
 * the pure scheduler is high-leverage because the slot-allocation math
 * is the only place edge cases live (off-by-one, partial-slot capacity,
 * candidate-over-capacity, zero/negative windows).
 *
 * Run: node --import tsx --test src/services/recruiter/__tests__/live-screen-scheduler.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildBackToBackSchedule,
  generateInviteToken,
  windowCapacity,
  type ScheduleCandidate,
} from "../live-screen-scheduler.js";

function isoDate(s: string): Date {
  return new Date(s);
}

function candidates(n: number): ScheduleCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    candidateId: null,
    candidateName: `Candidate ${i + 1}`,
  }));
}

// ───────────────────────────────────────────────────────────────────────────
// windowCapacity
// ───────────────────────────────────────────────────────────────────────────

describe("windowCapacity", () => {
  it("computes whole-slot capacity for a 2-hour window at 8-min slots", () => {
    const cap = windowCapacity(
      isoDate("2026-06-01T13:00:00Z"),
      isoDate("2026-06-01T15:00:00Z"),
      8,
    );
    // 120 minutes / 8 = 15 slots exactly
    assert.equal(cap, 15);
  });

  it("truncates partial trailing slots", () => {
    const cap = windowCapacity(
      isoDate("2026-06-01T13:00:00Z"),
      isoDate("2026-06-01T13:25:00Z"), // 25 min window
      10,
    );
    // 25 / 10 = 2.5 → 2 full slots
    assert.equal(cap, 2);
  });

  it("returns 0 for end <= start", () => {
    assert.equal(windowCapacity(isoDate("2026-06-01T13:00:00Z"), isoDate("2026-06-01T13:00:00Z"), 5), 0);
    assert.equal(windowCapacity(isoDate("2026-06-01T13:00:00Z"), isoDate("2026-06-01T12:00:00Z"), 5), 0);
  });

  it("returns 0 for non-positive slotMinutes", () => {
    assert.equal(windowCapacity(isoDate("2026-06-01T13:00:00Z"), isoDate("2026-06-01T14:00:00Z"), 0), 0);
    assert.equal(windowCapacity(isoDate("2026-06-01T13:00:00Z"), isoDate("2026-06-01T14:00:00Z"), -5), 0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// buildBackToBackSchedule
// ───────────────────────────────────────────────────────────────────────────

describe("buildBackToBackSchedule", () => {
  it("pairs candidates with contiguous slots", () => {
    const result = buildBackToBackSchedule(
      isoDate("2026-06-01T13:00:00Z"),
      isoDate("2026-06-01T14:00:00Z"),
      15,
      candidates(3),
    );
    assert.equal(result.capacity, 4);
    assert.equal(result.scheduled, 3);
    assert.equal(result.slots.length, 3);
    assert.equal(result.slots[0].slotStart.toISOString(), "2026-06-01T13:00:00.000Z");
    assert.equal(result.slots[0].slotEnd.toISOString(), "2026-06-01T13:15:00.000Z");
    assert.equal(result.slots[1].slotStart.toISOString(), "2026-06-01T13:15:00.000Z");
    assert.equal(result.slots[2].slotStart.toISOString(), "2026-06-01T13:30:00.000Z");
    assert.equal(result.unscheduled.length, 0);
  });

  it("caps at window capacity when more candidates than slots", () => {
    const result = buildBackToBackSchedule(
      isoDate("2026-06-01T13:00:00Z"),
      isoDate("2026-06-01T13:30:00Z"), // 30 min window
      10,
      candidates(5),
    );
    assert.equal(result.capacity, 3);
    assert.equal(result.scheduled, 3);
    assert.equal(result.slots.length, 3);
    assert.equal(result.unscheduled.length, 2);
    assert.equal(result.unscheduled[0].candidateName, "Candidate 4");
  });

  it("returns no slots when there are zero candidates", () => {
    const result = buildBackToBackSchedule(
      isoDate("2026-06-01T13:00:00Z"),
      isoDate("2026-06-01T14:00:00Z"),
      15,
      [],
    );
    assert.equal(result.capacity, 4);
    assert.equal(result.scheduled, 0);
    assert.equal(result.slots.length, 0);
  });

  it("throws when endTime <= startTime", () => {
    assert.throws(
      () =>
        buildBackToBackSchedule(
          isoDate("2026-06-01T13:00:00Z"),
          isoDate("2026-06-01T12:00:00Z"),
          10,
          candidates(1),
        ),
      /endTime must be after startTime/,
    );
  });

  it("throws on non-positive slotMinutes", () => {
    assert.throws(
      () =>
        buildBackToBackSchedule(
          isoDate("2026-06-01T13:00:00Z"),
          isoDate("2026-06-01T14:00:00Z"),
          0,
          candidates(1),
        ),
      /slotMinutes must be a positive integer/,
    );
    assert.throws(
      () =>
        buildBackToBackSchedule(
          isoDate("2026-06-01T13:00:00Z"),
          isoDate("2026-06-01T14:00:00Z"),
          1.5 as any,
          candidates(1),
        ),
      /slotMinutes must be a positive integer/,
    );
  });

  it("preserves candidate ordering — first-in, first-slot", () => {
    const cands: ScheduleCandidate[] = [
      { candidateId: "a", candidateName: "Alice" },
      { candidateId: "b", candidateName: "Bob" },
      { candidateId: "c", candidateName: "Carol" },
    ];
    const result = buildBackToBackSchedule(
      isoDate("2026-06-01T13:00:00Z"),
      isoDate("2026-06-01T14:00:00Z"),
      15,
      cands,
    );
    assert.equal(result.slots[0].candidate.candidateName, "Alice");
    assert.equal(result.slots[1].candidate.candidateName, "Bob");
    assert.equal(result.slots[2].candidate.candidateName, "Carol");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// generateInviteToken
// ───────────────────────────────────────────────────────────────────────────

describe("generateInviteToken", () => {
  it("returns a non-empty URL-safe string", () => {
    const t = generateInviteToken();
    assert.equal(typeof t, "string");
    assert.ok(t.length > 0);
    // Only base64url characters.
    assert.ok(/^[A-Za-z0-9_-]+$/.test(t), `expected base64url chars, got "${t}"`);
  });

  it("does not collide across 100 successive calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateInviteToken());
    assert.equal(seen.size, 100);
  });

  it("respects the byte-length argument", () => {
    // 16-byte input ⇒ ceil(16*4/3) = 22 chars (base64url, no padding)
    const t = generateInviteToken(16);
    assert.ok(t.length >= 20 && t.length <= 24, `unexpected length ${t.length}`);
  });
});
