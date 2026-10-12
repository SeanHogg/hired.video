/**
 * TimelineFramePlayer — the editor's PLAYBACK preview, painted through the
 * export's own frame compositor (#742, #570, #583).
 *
 * The export renders each frame with `renderTimelineFrame` over the Timeline
 * `canvasStateToTimeline` emits. This player does exactly the same into a
 * reused backbuffer, then blits the finished frame onto the on-screen canvas
 * in one `drawImage` — so the viewer never sees a half-composited frame while
 * a video widget seeks, and every effect, scene filter and scene transition
 * the MP4 will carry is what the preview shows.
 *
 * Frame requests coalesce: while a frame is painting, later requests replace
 * each other and only the newest is painted next, so a slow frame drops
 * intermediate frames instead of queueing a backlog. No per-frame allocation:
 * the renderer state, backbuffer and effect scratch canvases live as long as
 * the loaded Timeline.
 *
 * Pure of React; `useTimelineFramePlayer` drives it from the playhead.
 */
import { timelineDurationFrames, type MediaSource, type Timeline } from "@shared/timeline";
import {
  createRendererState,
  disposeRendererState,
  preloadSources,
  renderTimelineFrame,
  type NestedTimelineResolver,
  type RendererState,
} from "./frame-renderer";
import { context2d, createScratchCanvas, type ScratchCanvas } from "./scratch-canvas";

export interface FramePlayerLoadOptions {
  resolveNestedTimeline?: NestedTimelineResolver;
}

/** Clamp a frame index into the timeline's range. */
export function clampFrame(timeline: Timeline, frame: number): number {
  const last = Math.max(0, timelineDurationFrames(timeline) - 1);
  return Math.max(0, Math.min(last, Math.floor(frame)));
}

/**
 * Paint one preview frame: compose into `backbuffer` with the export's frame
 * function, then copy the result onto `display`. Exported so the parity test
 * can compare it against the export path directly.
 */
export async function paintPreviewFrame(
  display: HTMLCanvasElement | OffscreenCanvas,
  backbuffer: ScratchCanvas,
  timeline: Timeline,
  state: RendererState,
  frame: number,
  includeBranding: boolean,
): Promise<void> {
  await renderTimelineFrame(backbuffer, timeline, state, frame, { includeBranding });
  const ctx = context2d(display);
  if (!ctx) return;
  ctx.drawImage(backbuffer, 0, 0, display.width, display.height);
}

export class TimelineFramePlayer {
  private timeline: Timeline | null = null;
  private state: RendererState | null = null;
  private backbuffer: ScratchCanvas | null = null;
  private includeBranding = false;
  /** Last frame asked for — repainted after a reload or branding change. */
  private current = 0;
  private wanted: number | null = null;
  private painted: number | null = null;
  private painting = false;
  private generation = 0;
  private disposed = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly display: HTMLCanvasElement | OffscreenCanvas) {}

  /** Swap in a new Timeline: preload its media, then repaint the current
   *  frame. A newer `load` supersedes an in-flight one. */
  async load(
    timeline: Timeline,
    sources: Record<string, MediaSource>,
    opts: FramePlayerLoadOptions = {},
  ): Promise<void> {
    const generation = ++this.generation;
    // Preview reads proxies when a source has one (#341) — the same switch
    // the editor's scrubbing uses; it never changes a canvas-v2 widget.
    const state = createRendererState(sources, {
      useProxies: true,
      resolveNestedTimeline: opts.resolveNestedTimeline,
    });
    await preloadSources(timeline, state);
    if (generation !== this.generation || this.disposed) {
      disposeRendererState(state);
      return;
    }
    if (this.state) disposeRendererState(this.state);
    this.state = state;
    this.timeline = timeline;
    this.sizeTo(timeline.width, timeline.height);
    this.painted = null;
    this.requestFrame(this.current);
  }

  setIncludeBranding(includeBranding: boolean): void {
    if (this.includeBranding === includeBranding) return;
    this.includeBranding = includeBranding;
    this.painted = null;
    this.requestFrame(this.current);
  }

  /** Ask for `frame`; paints asynchronously, newest request wins. */
  requestFrame(frame: number): void {
    this.current = frame;
    this.wanted = frame;
    void this.pump();
  }

  /** Paint `frame` and resolve once it is on screen. Paints are
   *  serialised — two frames never composite into the backbuffer at once. */
  renderFrame(frame: number): Promise<void> {
    const run = this.chain.then(() => this.paintNow(frame));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async paintNow(frame: number): Promise<void> {
    const { timeline, state, backbuffer } = this;
    if (!timeline || !state || !backbuffer || this.disposed) return;
    const f = clampFrame(timeline, frame);
    await paintPreviewFrame(this.display, backbuffer, timeline, state, f, this.includeBranding);
    this.painted = f;
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    if (this.state) disposeRendererState(this.state);
    this.state = null;
    this.timeline = null;
    this.backbuffer = null;
  }

  private sizeTo(width: number, height: number): void {
    if (this.display.width !== width) this.display.width = width;
    if (this.display.height !== height) this.display.height = height;
    if (!this.backbuffer) {
      this.backbuffer = createScratchCanvas(width, height);
      return;
    }
    if (this.backbuffer.width !== width) this.backbuffer.width = width;
    if (this.backbuffer.height !== height) this.backbuffer.height = height;
  }

  private async pump(): Promise<void> {
    if (this.painting) return;
    this.painting = true;
    try {
      while (this.wanted != null && this.timeline && !this.disposed) {
        const frame = clampFrame(this.timeline, this.wanted);
        this.wanted = null;
        if (frame === this.painted) continue;
        try {
          await this.renderFrame(frame);
        } catch (err) {
          console.warn("[timeline] preview frame failed", err);
        }
      }
    } finally {
      this.painting = false;
    }
  }
}
