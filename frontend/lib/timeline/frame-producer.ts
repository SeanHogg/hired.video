/**
 * The ONE per-render frame producer both encoding engines share. WebCodecs
 * (`webcodecs-render.ts`) ships each painted canvas to its worker as an
 * ImageBitmap; ffmpeg.wasm (`ffmpeg-render.ts`) reads the canvas back as
 * raw RGBA. Everything before that hand-off — renderer state, source
 * preload, the abort checkpoint, the branding pill, the audio mix — lives
 * here so the two engines can't drift on what a frame looks like.
 */
import { timelineDurationFrames, type MediaSource, type Timeline } from "@shared/timeline";
import {
  createRendererState,
  disposeRendererState,
  preloadSources,
  renderTimelineFrame,
  type NestedTimelineResolver,
} from "./frame-renderer";
import { renderTimelineAudio } from "./audio-mixer";

export interface FrameProducerOptions {
  resolveNestedTimeline?: NestedTimelineResolver;
  /** Paint the hired.video corner watermark (caller resolves the policy). */
  includeBranding?: boolean;
  /** Checked before every frame; an aborted signal throws AbortError. */
  signal?: AbortSignal;
}

export interface TimelineFrameProducer {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly totalFrames: number;
  /** Paint `frame` onto the shared canvas and return it. */
  paint(frame: number): Promise<OffscreenCanvas>;
}

/** The abort checkpoint every engine uses — same error shape everywhere. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Render aborted", "AbortError");
}

/**
 * Build a producer, warm its sources, run `run`, and always dispose the
 * cached media elements afterwards (success, failure or abort).
 */
export async function withFrameProducer<T>(
  timeline: Timeline,
  sources: Record<string, MediaSource>,
  opts: FrameProducerOptions,
  run: (producer: TimelineFrameProducer) => Promise<T>,
): Promise<T> {
  const { width, height, fps } = timeline;
  const totalFrames = timelineDurationFrames(timeline);
  if (totalFrames <= 0) throw new Error("Timeline has no content to render");

  const canvas = new OffscreenCanvas(width, height);
  const state = createRendererState(sources, { resolveNestedTimeline: opts.resolveNestedTimeline });
  try {
    await preloadSources(timeline, state);
    return await run({
      width,
      height,
      fps,
      totalFrames,
      async paint(frame) {
        throwIfAborted(opts.signal);
        await renderTimelineFrame(canvas, timeline, state, frame, { includeBranding: opts.includeBranding === true });
        return canvas;
      },
    });
  } finally {
    disposeRendererState(state);
  }
}

/** Raw RGBA bytes of a painted canvas (what ffmpeg's rawvideo input reads). */
export function readCanvasRgba(canvas: OffscreenCanvas): Uint8ClampedArray {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/**
 * The timeline's audio mix, or null (render silent) when there is none or
 * the mix fails — a broken audio source never sinks the whole export.
 * Nested (compound) clips mix recursively through the resolver (#356).
 */
export async function mixTimelineAudio(
  timeline: Timeline,
  sources: Record<string, MediaSource>,
  resolveNestedTimeline?: NestedTimelineResolver,
): Promise<AudioBuffer | null> {
  try {
    return await renderTimelineAudio(timeline, sources, { resolveNestedTimeline });
  } catch (err) {
    console.warn("[nle] audio mix failed; rendering silent video", err);
    return null;
  }
}
