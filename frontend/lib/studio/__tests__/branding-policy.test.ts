/**
 * Branding-policy unit tests. The rule is small but load-bearing: every
 * surface that decides whether to show the hired.video end cap or corner
 * watermark calls shouldShowBranding(), so a regression here lets a Pro
 * user see branding in preview but not in the export (or vice versa).
 *
 * Run: vitest run lib/studio/__tests__/branding-policy.test.ts
 */

import { describe, it, expect } from "vitest";
import { shouldShowBranding } from "@/lib/studio/branding-policy";

describe("shouldShowBranding", () => {
  it("shows branding for free users regardless of toggle state", () => {
    expect(shouldShowBranding({ isPro: false, removeBrandingFlag: false })).toBe(true);
    expect(shouldShowBranding({ isPro: false, removeBrandingFlag: true })).toBe(true);
  });

  it("shows branding for Pro users who haven't opted out", () => {
    expect(shouldShowBranding({ isPro: true, removeBrandingFlag: false })).toBe(true);
  });

  it("hides branding only when Pro AND opted out", () => {
    expect(shouldShowBranding({ isPro: true, removeBrandingFlag: true })).toBe(false);
  });
});
