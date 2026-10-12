/**
 * ffmpeg.wasm engine: the facade routes ProRes / DNxHD here (and H.264 to
 * WebCodecs), the strategy encodes with the codec's MOV settings through the
 * shared frame producer, refuses over-long masters up front, frees ffmpeg on
 * every exit, and explains a missing cross-origin isolation in words.
 * ffmpeg itself is mocked — no wasm in unit tests.
 *
 * Run: vitest run lib/timeline/__tests__/ffmpeg-render.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Timeline, TimelineExportCodec } from "@shared/timeline";

const port = vi.hoisted(() => ({ terminate: vi.fn() }));
const loader = vi.hoisted(() => ({ loadFfmpeg: vi.fn(async () => port) }));
const pipeline = vi.hoisted(() => ({
  encodeFramesWithFfmpeg: vi.fn(async (input: { encoding: { mime: string }; readFrame: (f: number) => Promise<unknown>; onProgress?: (v: number) => void }) => {
    await input.readFrame(0);
    input.onProgress?.(0.5);
    return new Blob(["x"], { type: input.encoding.mime });
  }),
}));
const producer = vi.hoisted(() => ({
  paint: vi.fn(async () => ({ id: "canvas" })),
}));

vi.mock("../ffmpeg/ffmpeg-loader", () => loader);
vi.mock("../ffmpeg/encode-pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ffmpeg/encode-pipeline")>()),
  encodeFramesWithFfmpeg: pipeline.encodeFramesWithFfmpeg,
}));
vi.mock("../frame-producer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../frame-producer")>()),
  mixTimelineAudio: vi.fn(async () => null),
  readCanvasRgba: vi.fn(() => new Uint8ClampedArray(4)),
  withFrameProducer: vi.fn(async (_t: unknown, _s: unknown, _o: unknown, use: (p: unknown) => Promise<unknown>) =>
    use({ width: 1920, height: 1080, fps: 30, totalFrames: 30, paint: producer.paint }),
  ),
}));

import { ffmpegWasmStrategy } from "../ffmpeg-render";

function timeline(opts: { exportCodec?: TimelineExportCodec; seconds?: number; width?: number; height?: number } = {}): Timeline {
  const fps = 30;
  return {
    id: "t",
    fps,
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    backgroundColor: "#000",
    exportCodec: opts.exportCodec,
    tracks: [{ id: "v1", kind: "video", clips: [{ id: "c", sourceId: "s", startFrame: 0, durationFrames: Math.round((opts.seconds ?? 1) * fps) }] }],
  } as unknown as Timeline;
}

beforeEach(() => {
  vi.stubGlobal("OffscreenCanvas", class {});
  port.terminate.mockClear();
  loader.loadFfmpeg.mockClear();
  pipeline.encodeFramesWithFfmpeg.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("ffmpegWasmStrategy.render", () => {
  it("encodes ProRes into a QuickTime MOV and reports progress through to 1", async () => {
    const progress: number[] = [];
    const result = await ffmpegWasmStrategy.render(timeline({ exportCodec: "prores" }), {}, { onProgress: (v) => progress.push(v), includeBranding: true });
    expect(result).toMatchObject({ mime: "video/quicktime", engine: "ffmpeg-wasm", durationSeconds: 1 });
    const input = pipeline.encodeFramesWithFfmpeg.mock.calls[0][0] as unknown as { encoding: { videoArgs: string[] }; totalFrames: number; audioWav: Blob | null };
    expect(input.encoding.videoArgs).toContain("prores_ks");
    expect(input.totalFrames).toBe(30);
    expect(input.audioWav).toBeNull();
    expect(producer.paint).toHaveBeenCalledWith(0);
    expect(progress).toEqual([0.5, 1]);
    expect(port.terminate).toHaveBeenCalledTimes(1);
  });

  it("uses DNxHR for a vertical DNxHD export", async () => {
    await ffmpegWasmStrategy.render(timeline({ exportCodec: "dnxhd", width: 1080, height: 1920 }), {}, {});
    const input = pipeline.encodeFramesWithFfmpeg.mock.calls[0][0] as unknown as { encoding: { videoArgs: string[] } };
    expect(input.encoding.videoArgs).toContain("dnxhr_hq");
  });

  it("refuses an over-long 4K ProRes before loading ffmpeg", async () => {
    const run = ffmpegWasmStrategy.render(timeline({ exportCodec: "prores", width: 3840, height: 2160, seconds: 120 }), {}, {});
    await expect(run).rejects.toMatchObject({ name: "FfmpegRenderError", code: "TOO_LONG" });
    expect(loader.loadFfmpeg).not.toHaveBeenCalled();
  });

  it("frees ffmpeg when the encode fails", async () => {
    pipeline.encodeFramesWithFfmpeg.mockRejectedValueOnce(new DOMException("Render aborted", "AbortError"));
    await expect(ffmpegWasmStrategy.render(timeline({ exportCodec: "prores" }), {}, {})).rejects.toMatchObject({ name: "AbortError" });
    expect(port.terminate).toHaveBeenCalledTimes(1);
  });

  it("does not load ffmpeg once the render was cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(ffmpegWasmStrategy.render(timeline({ exportCodec: "prores" }), {}, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(loader.loadFfmpeg).not.toHaveBeenCalled();
  });
});

describe("ffmpeg loader core choice", () => {
  it("uses the single-thread core when the page is not cross-origin isolated", async () => {
    const real = await vi.importActual<typeof import("../ffmpeg/ffmpeg-loader")>("../ffmpeg/ffmpeg-loader");
    vi.stubGlobal("crossOriginIsolated", false);
    expect(real.canUseThreadedCore()).toBe(false);
  });

  it("uses the multithreaded core when isolated with SharedArrayBuffer", async () => {
    const real = await vi.importActual<typeof import("../ffmpeg/ffmpeg-loader")>("../ffmpeg/ffmpeg-loader");
    vi.stubGlobal("crossOriginIsolated", true);
    expect(real.canUseThreadedCore()).toBe(typeof SharedArrayBuffer !== "undefined");
  });
});
