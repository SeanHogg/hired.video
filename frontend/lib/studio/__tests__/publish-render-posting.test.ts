/**
 * POSTING RULE: a ProRes / DNxHD (or HEVC / VP9) render is a DOWNLOAD — the
 * upload / posting pipeline always receives H.264 MP4. A cached download
 * render in a mastering codec is re-rendered for posting (same branding);
 * an H.264 render uploads as-is with no second render.
 *
 * Run: vitest run lib/studio/__tests__/publish-render-posting.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Timeline, TimelineExportCodec } from "@shared/timeline";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";

const h = vi.hoisted(() => ({
  exportCodec: undefined as TimelineExportCodec | undefined,
  rendered: [] as Array<{ exportCodec?: TimelineExportCodec; includeBranding?: boolean }>,
  uploaded: [] as Array<{ type: string; branded?: boolean }>,
}));

vi.mock("@/lib/studio/editor-v2/timeline-emit", () => ({
  canvasStateToTimeline: () => ({ id: "t", tracks: [], ...(h.exportCodec ? { exportCodec: h.exportCodec } : {}) }) as unknown as Timeline,
  resolveTimelineAudioSources: async () => ({}),
}));
vi.mock("@/lib/timeline/render", () => ({
  renderTimeline: async (timeline: Timeline, _sources: unknown, opts: { includeBranding?: boolean }) => {
    h.rendered.push({ exportCodec: timeline.exportCodec, includeBranding: opts.includeBranding });
    const mov = timeline.exportCodec === "prores" || timeline.exportCodec === "dnxhd";
    const mime = mov ? "video/quicktime" : "video/mp4";
    return { blob: new Blob(["v"], { type: mime }), mime, durationSeconds: 1, engine: mov ? "ffmpeg-wasm" : "webcodecs" };
  },
}));
vi.mock("@/lib/services/studio-service", () => ({
  studioService: {
    uploadVideo: async (blob: Blob, _t: string, _p?: string, _r?: string, _res?: string, branded?: boolean) => {
      h.uploaded.push({ type: blob.type, branded });
      return { data: { id: "row" } };
    },
    saveDraft: async () => ({ data: { id: "row" } }),
  },
}));
vi.mock("@/lib/studio/baked-freshness", () => ({
  computeTimelineSpecHash: () => "hash",
  withBakedTimelineHash: (t: Timeline) => t,
}));
vi.mock("../moderation-frames", () => ({ scanRenderedFrames: vi.fn() }));

import { hostRenderedVideo, renderCanvasToBlob } from "../publish-render";

const state = { scenes: [{ id: "s", durationSeconds: 1 }] } as unknown as CanvasState;
const host = (blob: Blob) => hostRenderedVideo({ blob, title: "T", state, projectId: undefined, uploadFailedMessage: "fail" });

beforeEach(() => {
  h.rendered = [];
  h.uploaded = [];
});

describe("posting always uploads H.264 MP4", () => {
  it.each(["prores", "dnxhd"] as const)("re-renders a %s download as H.264 for the upload, keeping the branding", async (codec) => {
    h.exportCodec = codec;
    const download = await renderCanvasToBlob(state, { includeBranding: true, isPro: true });
    expect(download?.type).toBe("video/quicktime");
    await host(download!);
    expect(h.rendered).toEqual([
      { exportCodec: codec, includeBranding: true },
      { exportCodec: undefined, includeBranding: true },
    ]);
    expect(h.uploaded).toEqual([{ type: "video/mp4", branded: true }]);
  });

  it("uploads an H.264 render as-is without rendering twice", async () => {
    h.exportCodec = undefined;
    const blob = await renderCanvasToBlob(state, { includeBranding: false, isPro: false });
    await host(blob!);
    expect(h.rendered).toHaveLength(1);
    expect(h.uploaded).toEqual([{ type: "video/mp4", branded: false }]);
  });

  it("renders H.264 straight away for purpose: post", async () => {
    h.exportCodec = "prores";
    const blob = await renderCanvasToBlob(state, { includeBranding: false, isPro: true, purpose: "post" });
    expect(blob?.type).toBe("video/mp4");
    expect(h.rendered).toEqual([{ exportCodec: undefined, includeBranding: false }]);
  });
});
