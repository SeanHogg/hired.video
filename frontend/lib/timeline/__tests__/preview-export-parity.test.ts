/**
 * Preview ↔ export pixel parity (#742, #570, #583 — plan WP-E acceptance).
 *
 * Renders the same CanvasState through BOTH frame paths and compares real
 * pixels:
 *   - export:  `withFrameProducer(...).paint(frame)` — the producer every
 *              encoder (WebCodecs, ffmpeg.wasm) pulls frames from;
 *   - preview: `TimelineFramePlayer.renderFrame(frame)` — the fullscreen
 *              preview overlay's painter (backbuffer → on-screen blit).
 *
 * jsdom has no canvas backend, so both paint into `PixelCanvas`, a small
 * software 2D context that exposes no `ctx.filter` (as older Safari), which
 * means the scene filter runs through the pixel-math path and every value
 * is checkable. The `ctx.filter` path is covered in scene-grade.test.ts.
 *
 * Run: vitest run lib/timeline/__tests__/preview-export-parity.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCanvasState, emptyScene, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { DEFAULT_FILTERS } from "@/lib/studio/video-filters";
import type { TransitionKind } from "@/lib/studio/motion-presets";
import { withFrameProducer } from "@/lib/timeline/frame-producer";
import { TimelineFramePlayer } from "@/lib/timeline/frame-player";
import type { Timeline } from "@shared/timeline";
import { PixelCanvas } from "./pixel-canvas";

const W = 64;
const H = 36;
const FPS = 10;

/** Two 2 s scenes: a red one darkened by a brightness filter, then a blue
 *  one entering with `transition`. Shaped like an editor-authored project. */
function twoSceneState(transition: TransitionKind | null): CanvasState {
  const base = emptyCanvasState({ width: W, height: H, fps: FPS });
  const intro = {
    ...emptyScene("Intro"),
    durationSeconds: 2,
    backgroundColor: "#ff0000",
    filters: { ...DEFAULT_FILTERS, brightness: 0.5 },
  };
  const outro = {
    ...emptyScene("Outro"),
    durationSeconds: 2,
    backgroundColor: "#0000ff",
    transitionIn: transition,
  };
  return { ...base, scenes: [intro, outro] };
}

async function exportFrames(timeline: Timeline, frames: number[]): Promise<Uint8ClampedArray[]> {
  return withFrameProducer(timeline, {}, {}, async (producer) => {
    const out: Uint8ClampedArray[] = [];
    for (const f of frames) {
      const canvas = (await producer.paint(f)) as unknown as PixelCanvas;
      out.push(canvas.data.slice());
    }
    return out;
  });
}

async function previewFrames(timeline: Timeline, frames: number[]): Promise<PixelCanvas[]> {
  const out: PixelCanvas[] = [];
  const display = new PixelCanvas(1, 1);
  const player = new TimelineFramePlayer(display as unknown as HTMLCanvasElement);
  await player.load(timeline, {});
  for (const f of frames) {
    await player.renderFrame(f);
    const snap = new PixelCanvas(display.width, display.height);
    snap.data.set(display.data);
    out.push(snap);
  }
  player.dispose();
  return out;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

beforeEach(() => {
  vi.stubGlobal("OffscreenCanvas", PixelCanvas);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("preview renders exactly what export renders", () => {
  it("emits the scene's fade as a cross-dissolve at the boundary", () => {
    const timeline = canvasStateToTimeline(twoSceneState("fade"));
    // 0.5 s at 10 fps = 5 frames, boundary at 2 s = frame 20.
    expect(timeline.sceneTransitions).toEqual([{ atFrame: 20, kind: "cross-dissolve", durationFrames: 5 }]);
  });

  it("is pixel-identical on every frame (filter + cross-dissolve)", async () => {
    const timeline = canvasStateToTimeline(twoSceneState("fade"));
    const frames = range(40);
    const exported = await exportFrames(timeline, frames);
    const previewed = await previewFrames(timeline, frames);
    for (const f of frames) {
      expect(previewed[f].width).toBe(W);
      expect(previewed[f].height).toBe(H);
      expect(Array.from(previewed[f].data)).toEqual(Array.from(exported[f]));
    }
  });

  it("paints the filter and the mid-transition blend into those pixels", async () => {
    const timeline = canvasStateToTimeline(twoSceneState("fade"));
    const [plain, mid, incoming] = await previewFrames(timeline, [10, 17, 20]);
    // brightness(0.5) on pure red: 255 → 127.5 → 128.
    expect(plain.pixel(5, 5)).toEqual([128, 0, 0, 255]);
    // Frame 17 is 2/5 through the dissolve: 60 % graded red + 40 % blue.
    expect(mid.pixel(5, 5)).toEqual([77, 0, 102, 255]);
    expect(mid.pixel(W - 1, H - 1)).toEqual([77, 0, 102, 255]);
    // The incoming scene has no filter.
    expect(incoming.pixel(5, 5)).toEqual([0, 0, 255, 255]);
  });

  it("matches through a fade-to-black (cinematic fade)", async () => {
    const timeline = canvasStateToTimeline(twoSceneState("cinematic-fade"));
    expect(timeline.sceneTransitions?.[0]).toMatchObject({ kind: "fade-to-black", atFrame: 20 });
    const frames = [17, 18, 20, 22];
    const exported = await exportFrames(timeline, frames);
    const previewed = await previewFrames(timeline, frames);
    frames.forEach((_, i) => expect(Array.from(previewed[i].data)).toEqual(Array.from(exported[i])));
    // Fully black on the boundary frame.
    expect(previewed[2].pixel(0, 0)).toEqual([0, 0, 0, 255]);
  });

  it("matches through a slide (push)", async () => {
    const timeline = canvasStateToTimeline(twoSceneState("slide"));
    const frames = [15, 17, 19];
    const exported = await exportFrames(timeline, frames);
    const previewed = await previewFrames(timeline, frames);
    frames.forEach((_, i) => expect(Array.from(previewed[i].data)).toEqual(Array.from(exported[i])));
    // Mid-push: left edge still the graded outgoing scene, right edge blue.
    expect(previewed[1].pixel(0, 0)).toEqual([128, 0, 0, 255]);
    expect(previewed[1].pixel(W - 1, 0)).toEqual([0, 0, 255, 255]);
  });

  it("hard-cuts when the scene asks for a cut", async () => {
    const timeline = canvasStateToTimeline(twoSceneState("cut"));
    expect(timeline.sceneTransitions).toBeUndefined();
    const [before, after] = await previewFrames(timeline, [19, 20]);
    expect(before.pixel(5, 5)).toEqual([128, 0, 0, 255]);
    expect(after.pixel(5, 5)).toEqual([0, 0, 255, 255]);
  });
});
