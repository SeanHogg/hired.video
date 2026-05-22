/**
 * Predicate tests for `@shared/media-kinds` — locks the predicate split
 * that closes #936. Two distinct questions used to share one helper,
 * and the conflation surfaced when the user reported "no way to edit a
 * game" on /studio/<game-id>: the editor's Timeline-runtime chrome
 * (ScenesRail / WidgetPalette / TimelineDock / playback scrubber /
 * Preview overlay / PropertiesPanel) was mounted around `<GameStage>`,
 * which had no way to be true for the game-authoring question while
 * being false for the timeline-export question — the original
 * `mediaKindUsesTimelineRuntime` returned false for both.
 *
 * The split:
 *   - `mediaKindUsesTimelineExport(kind)`        — does the render
 *       facade emit a Timeline-shaped output? Used by save-menu /
 *       publish-destination filtering.
 *   - `mediaKindUsesCanvasStateAuthoring(kind)`  — does this kind
 *       mount CanvasStage chrome in the editor? Used by the v2 editor
 *       shell to gate its panels.
 *
 * Comic is the canary: TRUE for authoring (pages = scenes via
 * CanvasState), FALSE for export (PNG strip / PDF / CBZ pipeline, not
 * ffmpeg.wasm). The deprecated `mediaKindUsesTimelineRuntime` is kept
 * as an alias to `mediaKindUsesTimelineExport`.
 *
 * Run: vitest run lib/studio/__tests__/media-kinds-predicates.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  MEDIA_KINDS,
  mediaKindUsesTimelineExport,
  mediaKindUsesCanvasStateAuthoring,
  mediaKindUsesTimelineRuntime,
} from "@shared/media-kinds";

describe("mediaKindUsesTimelineExport", () => {
  const TIMELINE_EXPORT_KINDS = ["video", "podcast", "voice", "animation"] as const;
  const NON_TIMELINE_EXPORT_KINDS = ["game", "comic", "image"] as const;

  for (const kind of TIMELINE_EXPORT_KINDS) {
    it(`is true for ${kind} (ffmpeg.wasm / WebCodecs render path)`, () => {
      expect(mediaKindUsesTimelineExport(kind)).toBe(true);
    });
  }

  for (const kind of NON_TIMELINE_EXPORT_KINDS) {
    it(`is false for ${kind} (bundles its own export pipeline)`, () => {
      expect(mediaKindUsesTimelineExport(kind)).toBe(false);
    });
  }

  it("covers every MediaKind without throwing — exhaustiveness regression guard", () => {
    for (const k of MEDIA_KINDS) {
      expect(typeof mediaKindUsesTimelineExport(k)).toBe("boolean");
    }
  });
});

describe("mediaKindUsesCanvasStateAuthoring", () => {
  // Comic is the asymmetry that motivated #936: TRUE for authoring
  // (pages = scenes via CanvasState) even though FALSE for export.
  const CANVAS_AUTHORING_KINDS = ["video", "podcast", "voice", "animation", "comic"] as const;
  const NON_CANVAS_AUTHORING_KINDS = ["game", "image"] as const;

  for (const kind of CANVAS_AUTHORING_KINDS) {
    it(`is true for ${kind} (uses ScenesRail / WidgetPalette / Timeline editor chrome)`, () => {
      expect(mediaKindUsesCanvasStateAuthoring(kind)).toBe(true);
    });
  }

  for (const kind of NON_CANVAS_AUTHORING_KINDS) {
    it(`is false for ${kind} (mounts its own canvas runtime + inspector)`, () => {
      expect(mediaKindUsesCanvasStateAuthoring(kind)).toBe(false);
    });
  }

  it("comic is the asymmetric case — true for authoring, false for export", () => {
    // This single assertion is the entire reason #936 existed. Pinned
    // explicitly so a future "let's simplify the predicates" attempt
    // can't silently re-conflate them.
    expect(mediaKindUsesCanvasStateAuthoring("comic")).toBe(true);
    expect(mediaKindUsesTimelineExport("comic")).toBe(false);
  });

  it("covers every MediaKind without throwing — exhaustiveness regression guard", () => {
    for (const k of MEDIA_KINDS) {
      expect(typeof mediaKindUsesCanvasStateAuthoring(k)).toBe("boolean");
    }
  });
});

describe("mediaKindUsesTimelineRuntime — deprecated alias", () => {
  // Kept as a thin alias to `mediaKindUsesTimelineExport` so existing
  // call sites keep working while we migrate them off. Pinned to that
  // semantic — adding new behavior to the deprecated function instead
  // of migrating would defeat the split.
  it("returns the same value as mediaKindUsesTimelineExport for every kind", () => {
    for (const k of MEDIA_KINDS) {
      expect(mediaKindUsesTimelineRuntime(k)).toBe(mediaKindUsesTimelineExport(k));
    }
  });
});
