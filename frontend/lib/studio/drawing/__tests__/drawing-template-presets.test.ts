/**
 * Tests for the drawing-template preset SoT (Gap Register #945 +
 * follow-up to the "/studio template click crashes" regression).
 * These pin two contracts:
 *
 *   1. Every drawing template id (declared in `ContentTemplate`) has
 *      a matching preset entry — drift between the union and the
 *      registry would silently leave the editor seeding at the
 *      default dimensions while the catalog card still claims the
 *      template's intended canvas shape.
 *
 *   2. `seedImageFromTemplate` reads through the same registry —
 *      DRY enforcement so a future "I'll just add the dimensions
 *      here too" hand-edit gets caught by the test.
 *
 * Run: vitest run lib/studio/drawing/__tests__/drawing-template-presets.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  DRAWING_TEMPLATE_PRESETS,
  getDrawingTemplatePreset,
} from "@/lib/studio/drawing/drawing-template-presets";
import { seedImageFromTemplate } from "@/lib/studio/image/image-seeds";

describe("DRAWING_TEMPLATE_PRESETS — registry", () => {
  it("covers every shipping drawing template id", () => {
    const expected = ["drawing_blank", "drawing_social_square", "drawing_og_card"];
    for (const id of expected) {
      expect(DRAWING_TEMPLATE_PRESETS[id as keyof typeof DRAWING_TEMPLATE_PRESETS]).toBeDefined();
    }
  });

  it("every entry carries non-zero positive dimensions + a non-empty label + a non-empty accent", () => {
    for (const [id, preset] of Object.entries(DRAWING_TEMPLATE_PRESETS)) {
      expect(preset, `preset for ${id}`).toBeDefined();
      if (!preset) continue;
      expect(preset.width, `width for ${id}`).toBeGreaterThan(0);
      expect(preset.height, `height for ${id}`).toBeGreaterThan(0);
      expect(preset.dimensionLabel.length, `dimensionLabel for ${id}`).toBeGreaterThan(0);
      expect(preset.accent, `accent for ${id}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("getDrawingTemplatePreset — resolver", () => {
  it("returns the preset for a known id", () => {
    const preset = getDrawingTemplatePreset("drawing_social_square");
    expect(preset?.width).toBe(1080);
    expect(preset?.height).toBe(1080);
  });
  it("returns null for null / undefined", () => {
    expect(getDrawingTemplatePreset(null)).toBeNull();
    expect(getDrawingTemplatePreset(undefined)).toBeNull();
  });
  it("returns null for unknown ids (caller falls back to defaults)", () => {
    expect(getDrawingTemplatePreset("video_template_42")).toBeNull();
  });
});

describe("seedImageFromTemplate — DRY anchor", () => {
  it("uses the registry's dimensions for known drawing ids (no duplicate hardcoded numbers)", () => {
    const square = seedImageFromTemplate("drawing_social_square");
    expect(square.width).toBe(DRAWING_TEMPLATE_PRESETS.drawing_social_square!.width);
    expect(square.height).toBe(DRAWING_TEMPLATE_PRESETS.drawing_social_square!.height);

    const og = seedImageFromTemplate("drawing_og_card");
    expect(og.width).toBe(DRAWING_TEMPLATE_PRESETS.drawing_og_card!.width);
    expect(og.height).toBe(DRAWING_TEMPLATE_PRESETS.drawing_og_card!.height);
  });

  it("falls back to a blank canvas at default dimensions when the id is unknown", () => {
    const fallback = seedImageFromTemplate("not_a_real_template");
    expect(fallback.width).toBeGreaterThan(0);
    expect(fallback.layers).toHaveLength(1);
    expect(fallback.layers[0].kind).toBe("raster");
  });

  it("falls back to a blank canvas for null / undefined hints", () => {
    expect(seedImageFromTemplate(null).layers).toHaveLength(1);
    expect(seedImageFromTemplate(undefined).layers).toHaveLength(1);
  });
});
