/**
 * AnimationStage — frame-by-frame raster animation canvas runtime
 * (`mediaKind: "animation"`, per Consolidated Gap Register #1003).
 * Mounted by `<CanvasRouter mediaKind/>` in StudioEditorV2 when the
 * project is animation-kind.
 *
 * Mirrors `<DrawingStage>` for the painting mechanics — same brush /
 * eraser / fill engine in `lib/studio/drawing/drawing-engine.ts` — but
 * authors a STRIP of frames instead of a single canvas. Each frame
 * carries its own raster pixels as a dataURL (`AnimationFrame.pixelsDataUrl`);
 * the stage paints the active frame on top of an onion-skin
 * composite of the previous N frames at reduced opacity.
 *
 * SURFACE-ONLY: this component is a PURE paint surface. The frame
 * navigator (add / duplicate / delete / reorder / select) lives in the
 * left-rail `<FramesRail>` and the Play/Pause control lives in the
 * studio header — exactly where Scenes/Levels live for the video/game
 * kinds. Playback is driven by the `isPlaying` PROP (the header toggles
 * it); the rAF loop stays here because the frame pixels + setState live
 * here, but the canvas no longer carries any navigator/playback chrome.
 *
 * Composition order (back → front):
 *   1. Project background (transparent checker / solid color)
 *   2. Onion-skin layer — previous `onionSkinDepth` frames, opacity
 *      falling off linearly back through the strip (closest = 0.5,
 *      furthest = 0.5 / depth).
 *   3. Active frame canvas — the user's brush strokes land here.
 *
 * On stroke end the active canvas is serialised to a dataURL and
 * written to `state.frames[activeIdx].pixelsDataUrl` so the project
 * round-trips through JSONB. Mirrors DrawingStage's commit pattern.
 *
 * Per the DRY rule the brush engine is shared with DrawingStage —
 * stampBrushDab / strokeBetween / floodFillAt come straight from
 * `drawing-engine.ts`. The runtime owns ZERO duplicated paint logic.
 */
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import {
  type AnimationState,
  type AnimationFrame,
  findFrame,
  frameIndex,
  updateFramePixels,
} from "@shared/animation-state";
import {
  stampBrushDab,
  strokeBetween,
  floodFillAt,
} from "@/lib/studio/drawing/drawing-engine";
import {
  type BrushSettings,
  type CanvasPoint,
  type DrawingTool,
} from "@/lib/studio/drawing/drawing-types";
import { cn } from "@/lib/utils";

interface AnimationStageProps {
  state: AnimationState;
  setState: Dispatch<SetStateAction<AnimationState>>;
  /** Commit handler — call AFTER a stroke / fill / structural edit so
   *  the host's history wrapper records the change. Mirrors
   *  DrawingStage's contract. */
  commit: (next: AnimationState) => void;
  zoom: number;
  tool: DrawingTool;
  brush: BrushSettings;
  onBrushChange?: (next: BrushSettings) => void;
  onRecentColor?: (color: string) => void;
  /** Playback flag — driven by the header Play/Pause control. When true
   *  the rAF loop cycles frames at the project fps and the paint canvas
   *  ignores pointer events. */
  isPlaying: boolean;
}

/** Render the project background onto a 2D context. Transparent uses a
 *  checker pattern (Photoshop convention); color fills solid. */
function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: AnimationState["background"],
): void {
  ctx.clearRect(0, 0, width, height);
  if (background.kind === "color") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const tile = 16;
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const isDark = ((x / tile) ^ (y / tile)) & 1;
      ctx.fillStyle = isDark ? "#cbd5e1" : "#f1f5f9";
      ctx.fillRect(x, y, tile, tile);
    }
  }
}

/** Load a frame's dataURL into an Image and draw it onto the ctx
 *  once decoded. Returns a promise so the caller can sequence draws. */
function drawFrameDataUrl(
  ctx: CanvasRenderingContext2D,
  dataUrl: string | null,
  width: number,
  height: number,
  alpha: number,
): Promise<void> {
  if (!dataUrl) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const priorAlpha = ctx.globalAlpha;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(img, 0, 0, width, height);
      ctx.globalAlpha = priorAlpha;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

export default function AnimationStage({
  state,
  setState,
  commit,
  zoom,
  tool,
  brush,
  onBrushChange,
  onRecentColor,
  isPlaying,
}: AnimationStageProps) {
  // Three canvases stacked:
  //   - bg: background fill (transparent checker / color)
  //   - onion: onion-skin previous frames at reduced opacity
  //   - paint: active frame pixels — where pointer events land
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Stroke state — last point captured + whether we're mid-stroke
  const lastPointRef = useRef<CanvasPoint | null>(null);
  const isStrokingRef = useRef(false);

  const { width, height, frames, activeFrameId, onionSkinDepth, background, fps } = state;
  const activeIdx = useMemo(() => frameIndex(state, activeFrameId), [state, activeFrameId]);
  const activeFrame: AnimationFrame | null = useMemo(() => findFrame(state, activeFrameId), [state, activeFrameId]);

  // Playback is driven by the `isPlaying` prop (the header Play/Pause
  // control). The rAF loop below reads it; the paint canvas suppresses
  // pointer events while it's true.
  const playbackFrameRef = useRef<number>(0);

  // ─── Paint canvas → load active frame's pixels on selection change ───
  useEffect(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (activeFrame?.pixelsDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = activeFrame.pixelsDataUrl;
    }
  }, [activeFrame?.pixelsDataUrl, activeFrame?.id, width, height]);

  // ─── Background canvas — re-paints whenever bg / dims change ─────────
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintBackground(ctx, width, height, background);
  }, [background, width, height]);

  // ─── Onion-skin canvas — composite the previous N frames ─────────────
  useEffect(() => {
    const canvas = onionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (onionSkinDepth <= 0 || activeIdx <= 0) return;
    const startIdx = Math.max(0, activeIdx - onionSkinDepth);
    const draws: Promise<void>[] = [];
    for (let i = startIdx; i < activeIdx; i++) {
      const distance = activeIdx - i;
      // Closest prior frame = 0.5 opacity; falls off linearly.
      const alpha = Math.max(0.08, 0.5 / distance);
      draws.push(drawFrameDataUrl(ctx, frames[i].pixelsDataUrl, width, height, alpha));
    }
    // Fire-and-forget; the onion canvas is read-only chrome.
    void Promise.all(draws);
  }, [frames, activeIdx, onionSkinDepth, width, height]);

  // ─── Commit the active canvas's pixels back into state ───────────────
  const commitActiveFramePixels = useCallback(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const next = updateFramePixels(state, activeFrameId, dataUrl);
    setState(next);
    commit(next);
  }, [state, activeFrameId, setState, commit]);

  // ─── Pointer event → CanvasPoint converter ───────────────────────────
  const eventToPoint = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): CanvasPoint | null => {
      const canvas = paintCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
        pressure: event.pressure > 0 ? event.pressure : 0.5,
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (isPlaying) return;
      const canvas = paintCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const point = eventToPoint(event);
      if (!point) return;
      canvas.setPointerCapture(event.pointerId);
      isStrokingRef.current = true;
      lastPointRef.current = point;

      if (tool === "brush") {
        ctx.globalCompositeOperation = "source-over";
        stampBrushDab(ctx, brush, point);
      } else if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        stampBrushDab(ctx, brush, point);
      } else if (tool === "fill") {
        floodFillAt(ctx, width, height, point.x, point.y, brush.color);
        // One-shot tool — commit immediately.
        commitActiveFramePixels();
        onRecentColor?.(brush.color);
        isStrokingRef.current = false;
      } else if (tool === "eyedropper") {
        const px = ctx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
        const hex = `#${[px[0], px[1], px[2]].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
        onBrushChange?.({ ...brush, color: hex });
        isStrokingRef.current = false;
      }
    },
    [tool, brush, width, height, eventToPoint, isPlaying, commitActiveFramePixels, onBrushChange, onRecentColor],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isStrokingRef.current) return;
      const ctx = paintCanvasRef.current?.getContext("2d");
      if (!ctx) return;
      const point = eventToPoint(event);
      if (!point) return;
      const last = lastPointRef.current;
      if (last) strokeBetween(ctx, brush, last, point);
      lastPointRef.current = point;
    },
    [brush, eventToPoint],
  );

  const onPointerUp = useCallback(() => {
    if (!isStrokingRef.current) return;
    isStrokingRef.current = false;
    lastPointRef.current = null;
    commitActiveFramePixels();
    onRecentColor?.(brush.color);
  }, [brush.color, commitActiveFramePixels, onRecentColor]);

  // ─── Playback rAF loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    if (fps <= 0) return;
    const frameIntervalMs = 1000 / fps;
    let lastTick = performance.now();
    let rafHandle = 0;
    let tickAccumulator = 0;
    const advance = (now: number) => {
      const delta = now - lastTick;
      lastTick = now;
      tickAccumulator += delta;
      // Use the current active frame's hold count to advance.
      const currentFrame = state.frames[playbackFrameRef.current] ?? state.frames[0];
      const holdTicks = Math.max(1, currentFrame.hold ?? 1);
      const holdMs = holdTicks * frameIntervalMs;
      if (tickAccumulator >= holdMs) {
        tickAccumulator -= holdMs;
        playbackFrameRef.current = (playbackFrameRef.current + 1) % state.frames.length;
        setState((prev) => ({ ...prev, activeFrameId: state.frames[playbackFrameRef.current].id }));
      }
      rafHandle = requestAnimationFrame(advance);
    };
    playbackFrameRef.current = Math.max(0, activeIdx);
    rafHandle = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(rafHandle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, fps]);

  // CSS pixel size — `zoom` scales the on-screen render of the
  // canvas-pixel raster. Matches DrawingStage's contract.
  const displayWidth = width * zoom;
  const displayHeight = height * zoom;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-100 p-6">
        <div
          className="relative shadow-lg"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <canvas
            ref={bgCanvasRef}
            width={width}
            height={height}
            className="absolute inset-0 h-full w-full"
            aria-hidden
          />
          <canvas
            ref={onionCanvasRef}
            width={width}
            height={height}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          />
          <canvas
            ref={paintCanvasRef}
            width={width}
            height={height}
            className={cn(
              "absolute inset-0 h-full w-full",
              tool === "eyedropper" ? "cursor-crosshair" : "cursor-crosshair",
              isPlaying && "pointer-events-none",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
      </div>
    </div>
  );
}
