/**
 * The render facade picks the engine from the Timeline alone: ProRes /
 * DNxHD → ffmpeg.wasm, H.264 / HEVC / VP9 → WebCodecs, and a posting
 * timeline (timelineForPosting) always lands back on WebCodecs H.264.
 * Engines are mocked; only the dispatch is under test.
 *
 * Run: vitest run lib/timeline/__tests__/render-engine-selection.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { timelineForPosting, type Timeline, type TimelineExportCodec } from "@shared/timeline";

const calls = vi.hoisted(() => ({ engines: [] as string[] }));

vi.mock("../webcodecs-render", () => ({
  webcodecsStrategy: {
    id: "webcodecs",
    isAvailable: async () => true,
    render: async () => {
      calls.engines.push("webcodecs");
      return { blob: new Blob([], { type: "video/mp4" }), mime: "video/mp4", durationSeconds: 1, engine: "webcodecs" };
    },
  },
}));
vi.mock("../ffmpeg-render", () => ({
  ffmpegWasmStrategy: {
    id: "ffmpeg-wasm",
    isAvailable: async () => true,
    render: async () => {
      calls.engines.push("ffmpeg-wasm");
      return { blob: new Blob([], { type: "video/quicktime" }), mime: "video/quicktime", durationSeconds: 1, engine: "ffmpeg-wasm" };
    },
  },
}));

import { renderTimeline } from "../render";

function timeline(exportCodec?: TimelineExportCodec): Timeline {
  return {
    id: "t",
    fps: 30,
    width: 1920,
    height: 1080,
    backgroundColor: "#000",
    ...(exportCodec ? { exportCodec } : {}),
    tracks: [{ id: "v1", kind: "video", clips: [{ id: "c", sourceId: "s", startFrame: 0, durationFrames: 30 }] }],
  } as unknown as Timeline;
}

beforeEach(() => {
  calls.engines = [];
});

describe("renderTimeline engine selection", () => {
  it.each(["prores", "dnxhd"] as const)("routes %s to ffmpeg.wasm (MOV)", async (codec) => {
    const result = await renderTimeline(timeline(codec), {});
    expect(calls.engines).toEqual(["ffmpeg-wasm"]);
    expect(result.mime).toBe("video/quicktime");
  });

  it.each([undefined, "h264", "h265", "vp9"] as const)("keeps %s on WebCodecs (MP4)", async (codec) => {
    const result = await renderTimeline(timeline(codec), {});
    expect(calls.engines).toEqual(["webcodecs"]);
    expect(result.mime).toBe("video/mp4");
  });

  it.each(["prores", "dnxhd"] as const)("renders a %s project's posting timeline as WebCodecs H.264 MP4", async (codec) => {
    const result = await renderTimeline(timelineForPosting(timeline(codec)), {});
    expect(calls.engines).toEqual(["webcodecs"]);
    expect(result.mime).toBe("video/mp4");
  });
});
