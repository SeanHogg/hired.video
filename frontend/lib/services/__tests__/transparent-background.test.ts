/**
 * Tests for the transparent-intent detector. The regex is the only
 * thing worth pinning — the `removeBackground` wrapper is a thin
 * passthrough to `generateHeadshot` (already covered indirectly by the
 * headshot pipeline + the AI-prompt-panel integration). Locking the
 * keyword set here makes future copy tweaks safe.
 *
 * Run: vitest run lib/services/__tests__/transparent-background.test.ts
 */

import { describe, it, expect } from "vitest";
import { detectTransparentIntent } from "@/lib/services/transparent-background";

describe("detectTransparentIntent — true cases", () => {
  it.each([
    "A bird on a transparent background",
    "Cat with no background",
    "isolated subject on white",
    "logo, cut-out style",
    "PNG with alpha channel",
    "Bird on transparent",
    "Person, isolated on white background",
  ])("matches %j", (prompt) => {
    expect(detectTransparentIntent(prompt)).toBe(true);
  });
});

describe("detectTransparentIntent — false cases", () => {
  it.each([
    "A bird on a sandy beach",
    "Sunset over the ocean",
    "Modern app UI screenshot",
    "Watercolor painting of mountains",
    "",
  ])("does not match %j", (prompt) => {
    expect(detectTransparentIntent(prompt)).toBe(false);
  });

  it("is case-insensitive on the negative side too", () => {
    expect(detectTransparentIntent("Bird sitting on a branch")).toBe(false);
  });
});
