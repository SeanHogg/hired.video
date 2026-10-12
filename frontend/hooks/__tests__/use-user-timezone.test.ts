/**
 * Tests for the user-timezone helpers used by every date display in the app.
 *
 * Regression context: before these helpers existed, each screen called
 * `new Date(value).toLocaleDateString()`, which formatted in the browser's
 * zone rather than the zone the user picked on /settings. A Tokyo-based
 * user viewing the app from a laptop whose clock was still in Pacific Time
 * could see the wrong day. `formatInUserTimezone` applies the saved zone via
 * `Intl.DateTimeFormat`, and `isValidTimezone` gates out bad IDs from older
 * data (the Appearance tab used to store "UTC-8", which is not IANA).
 *
 * Run: vitest run hooks/__tests__/use-user-timezone.test.ts
 */

import { describe, it, expect } from "vitest";

import {
  detectBrowserTimezone,
  formatInUserTimezone,
  isValidTimezone,
} from "@/hooks/use-user-timezone";

describe("isValidTimezone", () => {
  it("accepts common IANA zones", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/Los_Angeles")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
  });

  it("rejects the pre-fix UTC±N labels that used to leak in from the DB", () => {
    // These were the select values before the IANA migration. Any row still
    // holding them should fall through to the browser zone, not crash Intl.
    expect(isValidTimezone("UTC-8")).toBe(false);
    expect(isValidTimezone("UTC-5")).toBe(false);
    expect(isValidTimezone("utc+0")).toBe(false);
  });

  it("rejects null, undefined, and empty string", () => {
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("detectBrowserTimezone", () => {
  it("returns a non-empty IANA zone", () => {
    const tz = detectBrowserTimezone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
    expect(isValidTimezone(tz)).toBe(true);
  });
});

describe("formatInUserTimezone", () => {
  // A single instant — 2026-06-15T18:00:00Z — is 2026-06-15 11:00 PT and
  // 2026-06-16 03:00 JST. Different zones must produce different outputs.
  const instant = new Date("2026-06-15T18:00:00Z");

  it("renders the same instant differently in different zones", () => {
    const ny = formatInUserTimezone(instant, "America/New_York", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const tokyo = formatInUserTimezone(instant, "Asia/Tokyo", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // Date boundary flips between the two (Jun 15 in NY, Jun 16 in Tokyo).
    expect(ny).not.toEqual(tokyo);
  });

  it("uses the picked zone's clock time, not the runtime's", () => {
    const ny = formatInUserTimezone(instant, "America/New_York", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });
    // 18:00Z in New York is 14:00 EDT in summer. Assert the hour component
    // matches rather than the full string (locale varies across runtimes).
    expect(ny).toMatch(/\b14:00\b/);
  });

  it("returns an empty string for null/undefined/invalid dates", () => {
    expect(formatInUserTimezone(null, "UTC")).toBe("");
    expect(formatInUserTimezone(undefined, "UTC")).toBe("");
    expect(formatInUserTimezone("not-a-date", "UTC")).toBe("");
  });

  it("falls back to UTC when the saved timezone is invalid", () => {
    // A row still holding the legacy "UTC-8" string must not crash the app —
    // it silently falls back to UTC rather than throwing from Intl.
    expect(() =>
      formatInUserTimezone(instant, "UTC-8"),
    ).not.toThrow();
    const utc = formatInUserTimezone(instant, "UTC", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const fallback = formatInUserTimezone(instant, "UTC-8", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(fallback).toEqual(utc);
  });

  it("accepts ISO strings and numeric timestamps", () => {
    const iso = formatInUserTimezone(instant.toISOString(), "UTC", {
      year: "numeric",
    });
    const ts = formatInUserTimezone(instant.getTime(), "UTC", {
      year: "numeric",
    });
    expect(iso).toEqual("2026");
    expect(ts).toEqual("2026");
  });
});
