/**
 * Tests for the live-screening date/time formatters (#1239) used by both
 * the recruiter session list and the candidate invite page.
 *
 * Locale + timezone behaviour is environment-sensitive, so we assert the
 * shape (separator + ordering + non-empty) rather than the literal string.
 * The actual locale-specific output is whatever the test runner's Intl
 * defaults produce — we just need to know the helper doesn't crash on a
 * mismatched-date pair and that it composes the day + time the way the UI
 * expects.
 */

import { describe, it, expect } from "vitest";
import { formatSlot } from "../LiveScreenInvite";
import { formatSessionWindow, formatTime } from "../recruit/LiveScreens";

describe("formatSlot", () => {
  it("composes 'day · start – end'", () => {
    const start = "2026-06-02T13:00:00Z";
    const end = "2026-06-02T13:08:00Z";
    const out = formatSlot(start, end);
    expect(out).toContain("·");
    expect(out).toContain("–");
    expect(out.length).toBeGreaterThan(0);
  });

  it("works across midnight in the runner's timezone (no crash)", () => {
    // Pick a UTC slot that very plausibly straddles midnight in some
    // timezones; the helper should still return a non-empty string.
    expect(() => formatSlot("2026-06-02T23:55:00Z", "2026-06-03T00:05:00Z")).not.toThrow();
    expect(formatSlot("2026-06-02T23:55:00Z", "2026-06-03T00:05:00Z").length).toBeGreaterThan(4);
  });
});

describe("formatTime", () => {
  it("renders without throwing for ISO string input", () => {
    expect(formatTime("2026-06-02T13:00:00Z")).toMatch(/\d/);
  });

  it("renders without throwing for Date input", () => {
    expect(formatTime(new Date("2026-06-02T13:00:00Z"))).toMatch(/\d/);
  });
});

describe("formatSessionWindow", () => {
  it("composes 'day · start – end' like the slot variant", () => {
    const out = formatSessionWindow("2026-06-02T13:00:00Z", "2026-06-02T15:00:00Z");
    expect(out).toContain("·");
    expect(out).toContain("–");
  });
});
