/**
 * Linked-content CTA typography resolver — single seam the DOM
 * `<CtaPill>` AND the canvas-2D `canvas-v2:linked-content` applier
 * both consume. Pinning the contract here keeps the two renderers
 * from drifting on what the pill says or how big it is.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/linked-content-cta.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  getLinkedContentMeta,
  resolveLinkedContentCtaTypography,
} from "@/lib/studio/editor-v2/linked-content";

describe("resolveLinkedContentCtaTypography", () => {
  it("falls back to the kind-default label when no override is set", () => {
    const r = resolveLinkedContentCtaTypography("resume", null);
    expect(r.label).toBe(getLinkedContentMeta("resume").ctaLabel);
  });

  it("uses the per-widget override label when set", () => {
    const r = resolveLinkedContentCtaTypography("resume", {
      ctaText: "Hire me →",
    });
    expect(r.label).toBe("Hire me →");
  });

  it("treats whitespace-only overrides as unset (no invisible labels)", () => {
    const r = resolveLinkedContentCtaTypography("profile", {
      ctaText: "   ",
    });
    expect(r.label).toBe(getLinkedContentMeta("profile").ctaLabel);
  });

  it("returns fontPx=null when no override is set so renderers fall back", () => {
    const r = resolveLinkedContentCtaTypography("resume", null);
    expect(r.fontPx).toBeNull();
  });

  it("honours an explicit positive ctaFontPx", () => {
    const r = resolveLinkedContentCtaTypography("resume", { ctaFontPx: 24 });
    expect(r.fontPx).toBe(24);
  });

  it("ignores non-positive or non-finite font sizes", () => {
    expect(resolveLinkedContentCtaTypography("resume", { ctaFontPx: 0 }).fontPx).toBeNull();
    expect(resolveLinkedContentCtaTypography("resume", { ctaFontPx: -5 }).fontPx).toBeNull();
    expect(
      resolveLinkedContentCtaTypography("resume", { ctaFontPx: NaN }).fontPx,
    ).toBeNull();
  });

  it("defaults font weight to bold and honours `normal` override", () => {
    expect(resolveLinkedContentCtaTypography("resume", null).fontWeight).toBe("bold");
    expect(
      resolveLinkedContentCtaTypography("resume", { ctaFontWeight: "normal" }).fontWeight,
    ).toBe("normal");
  });

  it("defaults font family to sans-serif", () => {
    expect(resolveLinkedContentCtaTypography("resume", null).fontFamily).toBe("sans-serif");
  });

  it("trims and honours an explicit ctaFontFamily", () => {
    expect(
      resolveLinkedContentCtaTypography("resume", {
        ctaFontFamily: "  Inter, system-ui  ",
      }).fontFamily,
    ).toBe("Inter, system-ui");
  });
});
