/**
 * The shared frame producer both engines (WebCodecs + ffmpeg.wasm) render
 * through: one renderer state per render, sources warmed first, branding
 * threaded to every frame, an abort checkpoint per frame, state disposed on
 * every exit, and a failing audio mix degrading to silence.
 *
 * Run: vitest run lib/timeline/__tests__/frame-producer.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Timeline } from "@shared/timeline";

const renderer = vi.hoisted(() => ({
  createRendererState: vi.fn(() => ({ id: "state" })),
  disposeRendererState: vi.fn(),
  preloadSources: vi.fn(async () => {}),
  renderTimelineFrame: vi.fn(async () => {}),
}));
const audio = vi.hoisted(() => ({ renderTimelineAudio: vi.fn() }));

vi.mock("../frame-renderer", () => renderer);
vi.mock("../audio-mixer", () => audio);

import { mixTimelineAudio, readCanvasRgba, withFrameProducer } from "../frame-producer";

class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext() {
    return { getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(9) }) };
  }
}

function timeline(durationFrames = 3): Timeline {
  return {
    id: "t",
    fps: 30,
    width: 8,
    height: 4,
    backgroundColor: "#000",
    tracks: [{ id: "v1", kind: "video", clips: [{ id: "c", sourceId: "s", startFrame: 0, durationFrames }] }],
  } as unknown as Timeline;
}

beforeEach(() => {
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  Object.values(renderer).forEach((fn) => fn.mockClear());
});
afterEach(() => vi.unstubAllGlobals());

describe("withFrameProducer", () => {
  it("warms sources, paints each frame with the branding decision, then disposes", async () => {
    const tl = timeline();
    const resolveNestedTimeline = vi.fn();
    const painted = await withFrameProducer(tl, {}, { includeBranding: true, resolveNestedTimeline }, async (producer) => {
      expect(producer).toMatchObject({ width: 8, height: 4, fps: 30, totalFrames: 3 });
      expect(renderer.preloadSources).toHaveBeenCalledTimes(1);
      const canvases = [];
      for (let f = 0; f < producer.totalFrames; f++) canvases.push(await producer.paint(f));
      return canvases;
    });
    expect(renderer.createRendererState).toHaveBeenCalledWith({}, { resolveNestedTimeline });
    expect(renderer.renderTimelineFrame).toHaveBeenCalledTimes(3);
    expect(renderer.renderTimelineFrame.mock.calls.map((c) => (c as unknown[])[3])).toEqual([0, 1, 2]);
    expect((renderer.renderTimelineFrame.mock.calls[0] as unknown[])[4]).toEqual({ includeBranding: true });
    // One shared canvas for every frame.
    expect(new Set(painted).size).toBe(1);
    expect(renderer.disposeRendererState).toHaveBeenCalledTimes(1);
  });

  it("passes includeBranding: false when the caller doesn't ask for the pill", async () => {
    await withFrameProducer(timeline(1), {}, {}, (p) => p.paint(0));
    expect((renderer.renderTimelineFrame.mock.calls[0] as unknown[])[4]).toEqual({ includeBranding: false });
  });

  it("throws AbortError at the next frame once signalled, and still disposes", async () => {
    const controller = new AbortController();
    const run = withFrameProducer(timeline(5), {}, { signal: controller.signal }, async (producer) => {
      await producer.paint(0);
      controller.abort();
      await producer.paint(1);
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(renderer.renderTimelineFrame).toHaveBeenCalledTimes(1);
    expect(renderer.disposeRendererState).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty timeline before building any state", async () => {
    await expect(withFrameProducer(timeline(0), {}, {}, async () => null)).rejects.toThrow(/no content/);
    expect(renderer.createRendererState).not.toHaveBeenCalled();
  });
});

describe("readCanvasRgba", () => {
  it("returns the canvas pixels as RGBA bytes", () => {
    const data = readCanvasRgba(new FakeOffscreenCanvas(2, 3) as unknown as OffscreenCanvas);
    expect(data.byteLength).toBe(2 * 3 * 4);
    expect(data[0]).toBe(9);
  });
});

describe("mixTimelineAudio", () => {
  it("returns the mix and threads the nested-timeline resolver", async () => {
    const buf = { length: 1 } as AudioBuffer;
    audio.renderTimelineAudio.mockResolvedValueOnce(buf);
    const resolver = vi.fn();
    await expect(mixTimelineAudio(timeline(), {}, resolver)).resolves.toBe(buf);
    expect(audio.renderTimelineAudio).toHaveBeenLastCalledWith(expect.anything(), {}, { resolveNestedTimeline: resolver });
  });

  it("degrades to a silent render when the mix fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    audio.renderTimelineAudio.mockRejectedValueOnce(new Error("decode failed"));
    await expect(mixTimelineAudio(timeline(), {})).resolves.toBeNull();
  });
});
