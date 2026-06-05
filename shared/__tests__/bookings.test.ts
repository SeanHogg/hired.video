/**
 * Tests for shared/bookings.ts — the pure slot-grid resolver + fee math
 * + magic-link token encoder. Pure functions, no DB.
 *
 * Real-fixture style (per feedback_tests_with_real_fixtures): exercises
 * timezone-bound rules, override interactions, busy-window collisions,
 * and the boundary conditions of the duration tier enum.
 *
 * Run: node --import tsx --test shared/__tests__/bookings.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BOOKING_DURATIONS_MINUTES,
  computeNetPayoutCents,
  computePlatformFeeCents,
  encodeMagicLinkToken,
  resolveAvailableSlots,
  MAX_AVAILABILITY_WINDOW_DAYS,
} from "../bookings.js";

describe("BOOKING_DURATIONS_MINUTES", () => {
  it("locks the four launch tiers", () => {
    assert.deepEqual([...BOOKING_DURATIONS_MINUTES], [30, 60, 90, 120]);
  });
});

describe("computePlatformFeeCents", () => {
  it("returns 0 for zero-cost sessions", () => {
    assert.equal(computePlatformFeeCents(0, 500), 0);
  });
  it("computes 5% on a $10 session", () => {
    assert.equal(computePlatformFeeCents(1000, 500), 50);
  });
  it("floors the partial cent", () => {
    assert.equal(computePlatformFeeCents(7, 500), 0);
  });
  it("clamps to 100%", () => {
    assert.equal(computePlatformFeeCents(1000, 999_999), 1000);
  });
  it("clamps to 0%", () => {
    assert.equal(computePlatformFeeCents(1000, -100), 0);
  });
});

describe("computeNetPayoutCents", () => {
  it("subtracts the platform fee", () => {
    assert.equal(computeNetPayoutCents(1000, 500), 950);
  });
  it("never returns a negative", () => {
    assert.equal(computeNetPayoutCents(0, 500), 0);
  });
});

describe("encodeMagicLinkToken", () => {
  it("is URL-safe (no +, /, =)", () => {
    const tok = encodeMagicLinkToken(new Uint8Array(32).fill(0xff));
    assert.equal(/[+/=]/.test(tok), false);
  });
  it("rejects short inputs", () => {
    assert.throws(() => encodeMagicLinkToken(new Uint8Array(16)));
  });
  it("is at most 64 chars", () => {
    const tok = encodeMagicLinkToken(new Uint8Array(64).fill(0xab));
    assert.ok(tok.length <= 64);
  });
});

describe("resolveAvailableSlots", () => {
  const tz = "America/Los_Angeles";

  it("returns empty for an empty rule set", () => {
    const slots = resolveAvailableSlots({
      timezone: tz,
      rules: [],
      overrides: [],
      busyWindows: [],
      fromUtc: "2026-06-08T00:00:00Z",
      toUtc: "2026-06-09T00:00:00Z",
      slotMinutes: 30,
    });
    assert.deepEqual(slots, []);
  });

  it("projects a 9–17 weekday rule into 16 thirty-min slots on a Monday", () => {
    // 2026-06-08 = Monday (weekday=1). 09:00–17:00 PT during DST = 16:00–00:00 UTC.
    const slots = resolveAvailableSlots({
      timezone: tz,
      rules: [{ weekday: 1, startTimeLocal: "09:00", endTimeLocal: "17:00" }],
      overrides: [],
      busyWindows: [],
      fromUtc: "2026-06-08T00:00:00Z",
      toUtc: "2026-06-09T12:00:00Z",
      slotMinutes: 30,
    });
    assert.equal(slots.length, 16);
    assert.equal(slots[0].slotStartUtc, "2026-06-08T16:00:00.000Z");
    assert.equal(slots[slots.length - 1].slotStartUtc, "2026-06-08T23:30:00.000Z");
  });

  it("respects a busy window that overlaps two slot boundaries", () => {
    const slots = resolveAvailableSlots({
      timezone: tz,
      rules: [{ weekday: 1, startTimeLocal: "09:00", endTimeLocal: "17:00" }],
      overrides: [],
      busyWindows: [
        { startUtc: "2026-06-08T17:00:00Z", endUtc: "2026-06-08T18:30:00Z" },
      ],
      fromUtc: "2026-06-08T00:00:00Z",
      toUtc: "2026-06-09T12:00:00Z",
      slotMinutes: 30,
    });
    const starts = slots.map((s) => s.slotStartUtc);
    assert.equal(starts.includes("2026-06-08T17:00:00.000Z"), false);
    assert.equal(starts.includes("2026-06-08T17:30:00.000Z"), false);
    assert.equal(starts.includes("2026-06-08T18:00:00.000Z"), false);
    assert.equal(starts.includes("2026-06-08T18:30:00.000Z"), true);
  });

  it("applies an override `block` to subtract a window", () => {
    const slots = resolveAvailableSlots({
      timezone: tz,
      rules: [{ weekday: 1, startTimeLocal: "09:00", endTimeLocal: "17:00" }],
      overrides: [
        {
          dateLocal: "2026-06-08",
          startTimeLocal: "12:00",
          endTimeLocal: "13:00",
          kind: "block",
        },
      ],
      busyWindows: [],
      fromUtc: "2026-06-08T00:00:00Z",
      toUtc: "2026-06-09T12:00:00Z",
      slotMinutes: 30,
    });
    const starts = slots.map((s) => s.slotStartUtc);
    assert.equal(starts.includes("2026-06-08T19:00:00.000Z"), false);
    assert.equal(starts.includes("2026-06-08T19:30:00.000Z"), false);
    assert.equal(starts.includes("2026-06-08T20:00:00.000Z"), true);
  });

  it("applies an override `add` outside the recurring rule window", () => {
    const slots = resolveAvailableSlots({
      timezone: tz,
      rules: [],
      overrides: [
        {
          dateLocal: "2026-06-13",
          startTimeLocal: "10:00",
          endTimeLocal: "11:00",
          kind: "add",
        },
      ],
      busyWindows: [],
      fromUtc: "2026-06-13T00:00:00Z",
      toUtc: "2026-06-14T00:00:00Z",
      slotMinutes: 60,
    });
    assert.equal(slots.length, 1);
    assert.equal(slots[0].slotStartUtc, "2026-06-13T17:00:00.000Z");
  });

  it("only emits slots that FIT entirely within an availability window", () => {
    const slots = resolveAvailableSlots({
      timezone: tz,
      rules: [{ weekday: 1, startTimeLocal: "09:00", endTimeLocal: "10:00" }],
      overrides: [],
      busyWindows: [],
      fromUtc: "2026-06-08T00:00:00Z",
      toUtc: "2026-06-09T00:00:00Z",
      slotMinutes: 60,
    });
    assert.equal(slots.length, 1);
  });

  it("honours effectiveFromDate on rules", () => {
    const slots = resolveAvailableSlots({
      timezone: tz,
      rules: [
        {
          weekday: 1,
          startTimeLocal: "09:00",
          endTimeLocal: "10:00",
          effectiveFromDate: "2026-06-15",
        },
      ],
      overrides: [],
      busyWindows: [],
      fromUtc: "2026-06-08T00:00:00Z",
      toUtc: "2026-06-09T00:00:00Z",
      slotMinutes: 60,
    });
    assert.deepEqual(slots, []);
  });

  it("throws when the window exceeds MAX_AVAILABILITY_WINDOW_DAYS", () => {
    const fromUtc = new Date(Date.UTC(2026, 5, 1)).toISOString();
    const toUtc = new Date(
      Date.parse(fromUtc) + (MAX_AVAILABILITY_WINDOW_DAYS + 1) * 86_400_000,
    ).toISOString();
    assert.throws(() =>
      resolveAvailableSlots({
        timezone: tz,
        rules: [],
        overrides: [],
        busyWindows: [],
        fromUtc,
        toUtc,
        slotMinutes: 30,
      }),
    );
  });
});
