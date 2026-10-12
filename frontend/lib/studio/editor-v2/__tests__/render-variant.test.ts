/**
 * export-facade `renderVariant` (#2045): a fitted cut goes through the SAME
 * render path as the master — reframed canvas, trimmed Timeline, always
 * H.264 (the POSTING RULE), same branding — and never touches the saved state.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/render-variant.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Timeline } from "@shared/timeline";
import { emptyCanvasState, makeRecordingScene, type CanvasState } from "../canvas-state";

const h = vi.hoisted(() => ({
  rendered: [] as Array<{ timeline: Timeline; includeBranding?: boolean }>,
}));

// A 5-minute ProRes master: one recording clip, 9000 frames at 30 fps.
vi.mock("@/lib/studio/editor-v2/timeline-emit", () => ({
  canvasStateToTimeline: (s: CanvasState) =>
    ({
      schemaVersion: 1,
      fps: 30,
      width: s.width,
      height: s.height,
      backgroundColor: "#000000",
      exportCodec: "prores",
      tracks: [
        {
          id: "v1",
          kind: "video",
          label: "Scenes",
          gain: 1,
          pan: 0,
          muted: false,
          solo: false,
          locked: false,
          clips: [{ id: "c1", sourceId: "take-1", startFrame: 0, durationFrames: 9000, sourceInFrame: 0 }],
        },
      ],
    }) as Timeline,
  resolveTimelineAudioSources: async () => ({}),
}));
vi.mock("@/lib/timeline/render", () => ({
  renderTimeline: async (timeline: Timeline, _sources: unknown, opts: { includeBranding?: boolean }) => {
    h.rendered.push({ timeline, includeBranding: opts.includeBranding });
    return { blob: new Blob(["v"], { type: "video/mp4" }), mime: "video/mp4", durationSeconds: 1, engine: "webcodecs" };
  },
}));

// Upload-side collaborators publish-render pulls in — unused by a render.
vi.mock("@/lib/services/studio-service", () => ({ studioService: {} }));
vi.mock("@/lib/studio/moderation-frames", () => ({ scanRenderedFrames: vi.fn() }));

import { renderVariant } from "../export-facade";

function master(): CanvasState {
  const state = emptyCanvasState({ width: 1920, height: 1080 });
  return { ...state, scenes: [makeRecordingScene("Take", "https://cdn.hired.video/studio/u/p/take-1.webm", 300)] };
}

beforeEach(() => {
  h.rendered = [];
});

describe("renderVariant", () => {
  it("renders a 9:16, 60 s H.264 cut with the master's branding", async () => {
    const state = master();
    const blob = await renderVariant({ state, aspect: "9:16", trimToSec: 60, includeBranding: true, projectId: null });
    expect(blob?.type).toBe("video/mp4");
    expect(h.rendered).toHaveLength(1);
    const [{ timeline, includeBranding }] = h.rendered;
    expect([timeline.width, timeline.height]).toEqual([1080, 1920]);
    expect(timeline.exportCodec).toBeUndefined();
    expect(timeline.tracks[0].clips[0].durationFrames).toBe(1800);
    expect(includeBranding).toBe(true);
    expect([state.width, state.height]).toEqual([1920, 1080]);
  });

  it("keeps the full length when only the frame changes (boundary)", async () => {
    await renderVariant({ state: master(), aspect: "1:1", trimToSec: null, includeBranding: false, projectId: null });
    expect(h.rendered[0].timeline.tracks[0].clips[0].durationFrames).toBe(9000);
    expect(h.rendered[0].includeBranding).toBe(false);
  });

  it("renders nothing for an empty project (error case)", async () => {
    const empty = { ...master(), scenes: [] };
    expect(await renderVariant({ state: empty, aspect: "9:16", trimToSec: 60, includeBranding: true, projectId: null })).toBeNull();
    expect(h.rendered).toHaveLength(0);
  });
});
