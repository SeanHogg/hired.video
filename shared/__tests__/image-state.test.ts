/**
 * Tests for the canonical ImageState shape backing `mediaKind: "image"`
 * studio projects (#932). The shape is persisted verbatim to JSONB —
 * a schema break here is a data-corruption risk, so these tests pin
 * the field set + the factory's defaults.
 *
 * Test framework: node:test (matches the rest of the shared/ tests +
 * the API/shared workspace runner).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_STATE_SCHEMA_VERSION,
  DEFAULT_IMAGE_WIDTH,
  DEFAULT_IMAGE_HEIGHT,
  createBlankImageState,
  findLayer,
} from "../image-state.js";

describe("createBlankImageState — defaults", () => {
  it("stamps the current schema version", () => {
    const s = createBlankImageState();
    assert.equal(s.schemaVersion, IMAGE_STATE_SCHEMA_VERSION);
  });

  it("defaults to 1024×1024 (matches the social-square preset + AI gen output)", () => {
    const s = createBlankImageState();
    assert.equal(s.width, DEFAULT_IMAGE_WIDTH);
    assert.equal(s.height, DEFAULT_IMAGE_HEIGHT);
    assert.equal(s.width, 1024);
    assert.equal(s.height, 1024);
  });

  it("seeds exactly one raster layer with empty pixels", () => {
    const s = createBlankImageState();
    assert.equal(s.layers.length, 1);
    assert.equal(s.layers[0].kind, "raster");
    assert.equal(s.layers[0].pixelsDataUrl, null);
    assert.equal(s.layers[0].visible, true);
    assert.equal(s.layers[0].locked, false);
    assert.equal(s.layers[0].opacity, 1);
    assert.equal(s.layers[0].blendMode, "normal");
  });

  it("sets activeLayerId to the seeded layer", () => {
    const s = createBlankImageState();
    assert.equal(s.activeLayerId, s.layers[0].id);
  });

  it("defaults the background to opaque white", () => {
    const s = createBlankImageState();
    assert.equal(s.background.kind, "color");
    if (s.background.kind === "color") {
      assert.equal(s.background.color, "#ffffff");
    }
  });

  it("starts with an empty AI prompt history", () => {
    const s = createBlankImageState();
    assert.deepEqual(s.aiPromptHistory, []);
  });

  it("honours overridden dimensions (template-specific canvas sizes)", () => {
    const s = createBlankImageState(1200, 630);
    assert.equal(s.width, 1200);
    assert.equal(s.height, 630);
  });

  it("honours overridden background (e.g. transparent for sprite work)", () => {
    const s = createBlankImageState(512, 512, { kind: "transparent" });
    assert.equal(s.background.kind, "transparent");
  });
});

describe("findLayer", () => {
  it("returns the layer when the id matches", () => {
    const s = createBlankImageState();
    const layer = findLayer(s, s.layers[0].id);
    assert.notEqual(layer, null);
    assert.equal(layer!.id, s.layers[0].id);
  });

  it("returns null when the id is unknown (callers fall back to the top layer)", () => {
    const s = createBlankImageState();
    assert.equal(findLayer(s, "no-such-id"), null);
  });
});
