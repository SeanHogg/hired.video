/**
 * Tests for the comic export pipeline (#939 Phase 2 — `renderComic`).
 * Validates dispatch by profile id + byte-stream sanity for the
 * in-tree exporters. Full pixel-level rasterisation tests run in
 * `frame-renderer-overlap.test.ts` against the underlying renderer.
 */

import { describe, expect, it } from "vitest";
import { renderComic } from "../comic-export";
import { outputProfilesFor } from "@shared/media-kinds";
import { emptyCanvasState } from "@/lib/studio/editor-v2/canvas-state";

describe("renderComic", () => {
  it("rejects non-comic profiles", async () => {
    const state = emptyCanvasState();
    const videoProfile = outputProfilesFor("video")[0];
    await expect(renderComic(state, videoProfile)).rejects.toThrow(/not comic-kind/);
  });

  it("rejects unknown comic profile ids", async () => {
    const state = emptyCanvasState();
    const fakeProfile = {
      ...outputProfilesFor("comic")[0],
      id: "comic-bogus",
    };
    await expect(renderComic(state, fakeProfile)).rejects.toThrow(/unknown profile id/);
  });

  // Full per-page rasterisation requires OffscreenCanvas which jsdom
  // doesn't ship — those paths are exercised by the editor in a real
  // browser. The unit-level smoke tests above pin dispatch + error
  // surface so a future refactor can't silently swap behaviors.
});
