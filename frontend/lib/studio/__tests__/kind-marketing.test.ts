/**
 * Kind-marketing exhaustiveness tests.
 *
 * `KIND_MARKETING` is a `Record<MediaKind, …>` — TypeScript already
 * fails the build if a new entry in `MEDIA_KINDS` lacks a matching
 * pitch. These tests pin the OTHER half of the contract: every pitch
 * is non-empty + structurally complete, and the shippable filter
 * mirrors what the `/studio` Landing's "What you can make" grid will
 * actually render.
 *
 * Without this guard, a new mediaKind could land in the catalog with a
 * placeholder pitch ("TODO") that silently makes it onto the marketing
 * surface.
 *
 * Run: vitest run lib/studio/__tests__/kind-marketing.test.ts
 */

import { describe, it, expect } from "vitest";
import { MEDIA_KINDS } from "@shared/media-kinds";
import {
  KIND_MARKETING,
  listShippableKindPitches,
} from "@/lib/studio/kind-marketing";

describe("KIND_MARKETING", () => {
  it("has an entry for every MediaKind (TypeScript exhaustiveness check)", () => {
    // Record<MediaKind, …> already enforces this at compile time; the
    // runtime check guards against a `Partial<>` regression.
    for (const kind of MEDIA_KINDS) {
      expect(KIND_MARKETING[kind]).toBeTruthy();
    }
  });

  it("every pitch ships a non-empty titleKey + blurbKey + icon + accentClass", () => {
    for (const kind of MEDIA_KINDS) {
      const p = KIND_MARKETING[kind];
      // Pure module exposes i18n keys, not literals (#2245). Pin the
      // convention so a regression to a hardcoded string is caught.
      expect(p.titleKey, `${kind} titleKey wrong`).toBe(`studioKind.${kind}.title`);
      expect(p.blurbKey, `${kind} blurbKey wrong`).toBe(`studioKind.${kind}.blurb`);
      expect(p.icon, `${kind} icon missing`).toBeTruthy();
      expect(p.accentClass.trim().length, `${kind} accent class empty`).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("listShippableKindPitches()", () => {
  it("returns only kinds whose `isShippable` is true", () => {
    const shippable = listShippableKindPitches();
    for (const p of shippable) {
      expect(KIND_MARKETING[p.kind].isShippable).toBe(true);
    }
    // Image is the canonical roadmap-only kind today; if it ever
    // becomes shippable this test gets updated alongside the flag.
    const shippableKinds = new Set(shippable.map((p) => p.kind));
    expect(shippableKinds.has("image")).toBe(false);
  });

  it("returns kinds in MEDIA_KINDS declaration order so the grid renders predictably", () => {
    const shippable = listShippableKindPitches().map((p) => p.kind);
    const expectedOrder = MEDIA_KINDS.filter((k) => KIND_MARKETING[k].isShippable);
    expect(shippable).toEqual(expectedOrder);
  });

  it("includes comic + game (the new kinds the marketing landing must surface)", () => {
    // Regression guard: the landing's "What you can make" grid maps
    // over this list, so dropping comic or game from the shippable
    // set would silently shrink the marketing surface back to a
    // video-only product.
    const kinds = listShippableKindPitches().map((p) => p.kind);
    expect(kinds).toContain("comic");
    expect(kinds).toContain("game");
  });
});
