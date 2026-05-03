/**
 * WebCodecs render strategy — the fast path.
 *
 * Handles Timelines pickRenderEngine() classifies as simple: 1080p or
 * smaller, only cut/cross-dissolve transitions, no per-clip effects.
 *
 * STATUS (2026-05-03): SKELETON. Implementation will adapt the existing
 * Timeline-agnostic encode loop in
 * [frontend/lib/renderer/video-exporter.ts](../renderer/video-exporter.ts)
 * to consume the Timeline JSON spec directly. The legacy exporter
 * operates on `CompiledVideo` (the scene-editor's output shape); the
 * port replaces that consumer with one that walks Timeline.tracks /
 * Track.clips and composes each frame via canvas.
 */

import type { RenderStrategy } from "./render";

export const webcodecsStrategy: RenderStrategy = {
  id: "webcodecs",

  async isAvailable() {
    return (
      typeof VideoEncoder !== "undefined" &&
      typeof OffscreenCanvas !== "undefined"
    );
  },

  async render(_timeline, _sources, _opts) {
    throw new Error(
      "WebCodecs Timeline render is not yet implemented. " +
      "The legacy exporter at frontend/lib/renderer/video-exporter.ts " +
      "encodes from the scene-editor's CompiledVideo shape; porting it " +
      "to consume the Timeline JSON spec is the next NLE M1 task.",
    );
  },
};
