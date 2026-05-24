/**
 * DrawingStage — Photoshop-shaped raster canvas runtime
 * (`mediaKind: "image"` per Consolidated Gap Register #932). Mounted
 * by `<CanvasRouter mediaKind/>` in StudioEditorV2 when the project
 * is image-kind.
 *
 * **Canvas-only by design** — mirrors `<CanvasStage/>`'s role for
 * Timeline kinds. The surrounding chrome lives on the host:
 *
 *   • LEFT rail → `<DrawingToolPalette/>` mounted by `StudioEditorV2`
 *     inside the standard left `<CollapsiblePanel/>` slot (the same
 *     slot Timeline kinds use for ScenesRail / WidgetPalette).
 *   • RIGHT rail → `<DrawingAiPromptPanel/>` mounted by the host
 *     inside the standard right `<CollapsiblePanel/>` slot (the same
 *     slot Timeline kinds use for PropertiesPanel).
 *   • Bottom-left → host's `<CanvasEditToolbar/>` (undo / redo).
 *   • Bottom-centre → host's `<FloatingImageLayersPanel/>` (layers).
 *   • Header → host's `<StudioSaveMenuV2/>` (save / export / library).
 *
 * Per the DRY rule, DrawingStage owns ZERO chrome — every affordance
 * lives in the same shared slot the V2 Video editor uses, just with
 * image-kind-specific contents.
 *
 * State model: `ImageState` (shared/image-state.ts) is the source of
 * truth, owned by the host's `useCanvasHistory<ImageState>`. Per-layer
 * offscreen canvases are CACHE — rebuilt from each layer's
 * `pixelsDataUrl` on hydrate / undo / redo / AI gen. On every stroke
 * commit the active layer's offscreen is serialized back to a dataURL
 * and the host's state is updated.
 *
 * Per the SOLID open/closed principle the brush engine, fill engine,
 * and composite pipeline are pure functions in
 * `frontend/lib/studio/drawing/drawing-engine.ts`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  type ImageState,
  findLayer,
} from "@shared/image-state";
import {
  type BrushSettings,
  type CanvasPoint,
  type DrawingTool,
} from "@/lib/studio/drawing/drawing-types";
import {
  clearRectOnLayer,
  compositeLayers,
  createOffscreenCanvas,
  fillRectOnLayer,
  floodFillAt,
  hydrateLayerCanvas,
  pickColorAt,
  serializeLayer,
  strokeBetween,
  stampBrushDab,
} from "@/lib/studio/drawing/drawing-engine";

/** Selection rectangle in CANVAS coordinates (not screen). Set by the
 *  marquee tool's drag; consumed by the host's marquee-action buttons
 *  (Delete / Fill) which translate into engine ops on the active
 *  layer. The host owns the rect so its toolbar buttons can read +
 *  clear it after acting. */
export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DrawingStageProps {
  /** Controlled image state — owned by the host. */
  state: ImageState;
  setState: Dispatch<SetStateAction<ImageState>>;
  /** Host's history commit — fired on stroke end. */
  commit: () => void;
  zoom: number;
  /** Active tool + brush settings — owned by the host so the left-rail
   *  `<DrawingToolPalette/>` (also mounted by the host) can drive the
   *  canvas's stroke behavior. */
  tool: DrawingTool;
  brush: BrushSettings;
  /** Host updaters — used by the eyedropper to push a sampled color
   *  back into the brush state, and by the canvas (indirectly) when a
   *  paint action pushes a color into the recent-colors swatch row. */
  onBrushChange: (next: BrushSettings) => void;
  onRecentColor: (color: string) => void;
  /** Marquee selection rect (canvas coords). Null when no selection
   *  is active or when the marquee tool is not the current tool.
   *  Bidirectionally controlled — DrawingStage emits it on drag, the
   *  host clears it after Delete / Fill. */
  marquee: MarqueeRect | null;
  onMarqueeChange: (next: MarqueeRect | null) => void;
  /** Marquee action handlers — invoked by the floating Delete / Fill
   *  chips overlayed on the active selection rect. Host owns the
   *  imperative work (clearRectOnLayer / fillRectOnLayer + commit);
   *  DrawingStage just renders the buttons because they're positioned
   *  ON the marquee rect (tight visual coupling). */
  onMarqueeDelete?: () => void;
  onMarqueeFill?: () => void;
  /** Captured by the host on first paint so its SaveMenu (Export /
   *  Save-to-library) can flatten the composite on demand. */
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

export default function DrawingStage({
  state,
  setState,
  commit,
  zoom,
  tool,
  brush,
  onBrushChange,
  onRecentColor,
  marquee,
  onMarqueeChange,
  onMarqueeDelete,
  onMarqueeFill,
  onCanvasReady,
}: DrawingStageProps) {
  // Per-layer offscreen canvases — cached from state.layers[].pixelsDataUrl.
  // Keyed by layer id; rebuilt whenever a layer's pixelsDataUrl changes.
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  // Snapshot of the layer dataUrls last hydrated into the cache so we
  // can detect which layers actually need a re-hydrate (avoid blowing
  // away the in-progress stroke on every state change).
  const hydratedSnapshotRef = useRef<Map<string, string | null>>(new Map());
  const visibleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Recomposite the visible canvas from the current layer cache.
  const recomposite = useCallback(() => {
    const visible = visibleCanvasRef.current;
    if (!visible) return;
    const ctx = visible.getContext("2d");
    if (!ctx) return;
    compositeLayers(
      ctx,
      state.width,
      state.height,
      state.background,
      state.layers,
      layerCanvasesRef.current,
    );
  }, [state.width, state.height, state.background, state.layers]);

  // Hydrate / rebuild offscreen canvases whenever the layer list or
  // dimensions change. Each layer is hydrated once per pixelsDataUrl
  // change — re-using the existing offscreen canvas when the pixels
  // haven't changed (avoids wiping an in-progress stroke).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = layerCanvasesRef.current;
      const snap = hydratedSnapshotRef.current;
      const aliveIds = new Set(state.layers.map((l) => l.id));
      for (const id of Array.from(cache.keys())) {
        if (!aliveIds.has(id)) {
          cache.delete(id);
          snap.delete(id);
        }
      }
      for (const layer of state.layers) {
        const prevHydrated = snap.get(layer.id);
        let canvas = cache.get(layer.id);
        if (!canvas || canvas.width !== state.width || canvas.height !== state.height) {
          canvas = createOffscreenCanvas(state.width, state.height);
          cache.set(layer.id, canvas);
          await hydrateLayerCanvas(canvas, layer.pixelsDataUrl);
          snap.set(layer.id, layer.pixelsDataUrl);
        } else if (prevHydrated !== layer.pixelsDataUrl) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          await hydrateLayerCanvas(canvas, layer.pixelsDataUrl);
          snap.set(layer.id, layer.pixelsDataUrl);
        }
      }
      if (!cancelled) recomposite();
    })();
    return () => {
      cancelled = true;
    };
  }, [state.layers, state.width, state.height, recomposite]);

  // Active-layer helpers ────────────────────────────────────────────────
  const activeLayer = useMemo(
    () => findLayer(state, state.activeLayerId),
    [state],
  );

  const activeLayerCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!activeLayer) return null;
    return layerCanvasesRef.current.get(activeLayer.id) ?? null;
  }, [activeLayer]);

  // Stroke state — tracked outside React so the 60fps pointermove loop
  // doesn't allocate or re-render on every frame. The discriminated
  // union covers all four pointer-driven interactions a tool can
  // initiate: paint (brush/eraser), translate (hand), select (marquee),
  // or nothing (fill / eyedropper fire on pointerdown only).
  type DragState =
    | { kind: "none" }
    | { kind: "paint"; lastPoint: CanvasPoint }
    | { kind: "translate"; startX: number; startY: number; startOffset: { x: number; y: number } }
    | { kind: "marquee"; startX: number; startY: number };
  const strokeRef = useRef<DragState>({ kind: "none" });

  const localPointFromEvent = useCallback(
    (e: React.PointerEvent): CanvasPoint | null => {
      const visible = visibleCanvasRef.current;
      if (!visible) return null;
      const rect = visible.getBoundingClientRect();
      const scaleX = state.width / rect.width;
      const scaleY = state.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        pressure: e.pressure > 0 ? e.pressure : 0.5,
      };
    },
    [state.width, state.height],
  );

  const commitActiveLayerToState = useCallback(() => {
    const layer = activeLayer;
    const canvas = activeLayerCanvas();
    if (!layer || !canvas) return;
    const pixels = serializeLayer(canvas);
    if (pixels === layer.pixelsDataUrl) return;
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === layer.id ? { ...l, pixelsDataUrl: pixels } : l,
      ),
    }));
    commit();
  }, [activeLayer, activeLayerCanvas, setState, commit]);

  // Commit a pending layer-translation (hand-tool drag end). The
  // transformOffset is live during the drag (already in state, driving
  // recomposite); commit just flushes a history checkpoint.
  const commitLayerTranslation = useCallback(() => {
    commit();
  }, [commit]);

  // ─── Pointer handlers ────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const layer = activeLayer;
      if (!layer) return;
      const point = localPointFromEvent(e);
      if (!point) return;

      e.currentTarget.setPointerCapture(e.pointerId);

      // Hand tool — drag = translate the active layer's transformOffset.
      // Locked layers ignore (you can still click to see selection
      // chrome but not move).
      if (tool === "hand") {
        if (layer.locked) return;
        strokeRef.current = {
          kind: "translate",
          startX: point.x,
          startY: point.y,
          startOffset: layer.transformOffset ?? { x: 0, y: 0 },
        };
        return;
      }

      // Marquee tool — drag = define a selection rectangle in canvas
      // coords. Resets any prior selection. The rect is reported to
      // the host on every pointermove + finalised on pointerup.
      if (tool === "marquee") {
        onMarqueeChange({ x: point.x, y: point.y, width: 0, height: 0 });
        strokeRef.current = { kind: "marquee", startX: point.x, startY: point.y };
        return;
      }

      // Pixel-mutating tools below need the active-layer canvas.
      if (layer.locked) return;
      const canvas = activeLayerCanvas();
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (tool === "eyedropper") {
        const visible = visibleCanvasRef.current;
        if (!visible) return;
        const visibleCtx = visible.getContext("2d");
        if (!visibleCtx) return;
        const color = pickColorAt(visibleCtx, point.x, point.y);
        onBrushChange({ ...brush, color });
        onRecentColor(color);
        return;
      }

      if (tool === "fill") {
        floodFillAt(ctx, state.width, state.height, point.x, point.y, brush.color);
        onRecentColor(brush.color);
        recomposite();
        commitActiveLayerToState();
        return;
      }

      // brush / eraser — start the stroke.
      strokeRef.current = { kind: "paint", lastPoint: point };
      ctx.save();
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      stampBrushDab(ctx, brush, point);
      ctx.restore();
      if (tool === "brush") onRecentColor(brush.color);
      recomposite();
    },
    [
      activeLayer,
      activeLayerCanvas,
      brush,
      commitActiveLayerToState,
      localPointFromEvent,
      onBrushChange,
      onMarqueeChange,
      onRecentColor,
      recomposite,
      state.height,
      state.width,
      tool,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = strokeRef.current;
      if (drag.kind === "none") return;
      const point = localPointFromEvent(e);
      if (!point) return;

      if (drag.kind === "translate") {
        const layer = activeLayer;
        if (!layer) return;
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        setState((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === layer.id
              ? { ...l, transformOffset: { x: drag.startOffset.x + dx, y: drag.startOffset.y + dy } }
              : l,
          ),
        }));
        return;
      }

      if (drag.kind === "marquee") {
        const x = Math.min(drag.startX, point.x);
        const y = Math.min(drag.startY, point.y);
        const width = Math.abs(point.x - drag.startX);
        const height = Math.abs(point.y - drag.startY);
        onMarqueeChange({ x, y, width, height });
        return;
      }

      // Paint stroke.
      const layer = activeLayer;
      if (!layer || layer.locked) return;
      const canvas = activeLayerCanvas();
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      strokeBetween(ctx, brush, drag.lastPoint, point);
      ctx.restore();
      strokeRef.current = { kind: "paint", lastPoint: point };
      recomposite();
    },
    [
      activeLayer,
      activeLayerCanvas,
      brush,
      localPointFromEvent,
      onMarqueeChange,
      recomposite,
      setState,
      tool,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = strokeRef.current;
      if (drag.kind === "none") return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      strokeRef.current = { kind: "none" };
      if (drag.kind === "paint") {
        commitActiveLayerToState();
      } else if (drag.kind === "translate") {
        commitLayerTranslation();
      }
      // Marquee finalise: the rect is already in host state from
      // handlePointerMove; nothing else to do here. Tiny rects (drag
      // distance < ~3px) probably mean a click rather than a drag —
      // clear them so an accidental click doesn't leave a phantom
      // selection.
      if (drag.kind === "marquee" && marquee && (marquee.width < 3 || marquee.height < 3)) {
        onMarqueeChange(null);
      }
    },
    [commitActiveLayerToState, commitLayerTranslation, marquee, onMarqueeChange],
  );

  // Expose the visible canvas to the host so its SaveMenu (Export /
  // Save to library) can flatten on demand.
  useEffect(() => {
    onCanvasReady?.(visibleCanvasRef.current);
    return () => onCanvasReady?.(null);
  }, [onCanvasReady]);

  const cursorClass =
    tool === "hand"
      ? "cursor-grab"
      : tool === "marquee"
        ? "cursor-crosshair"
        : tool === "fill"
          ? "cursor-cell"
          : "cursor-crosshair";

  // ─── Render — canvas only, mirroring CanvasStage's shape. The host
  //     provides the surrounding chrome via the SAME `<CollapsiblePanel/>`
  //     slots Timeline kinds use, so the layout shell stays uniform
  //     across kinds (per DRY: one shell, kind-aware contents).
  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-auto bg-muted/40 p-6"
    >
      <div
        className="relative shadow-xl ring-1 ring-border"
        style={{
          width: state.width * zoom,
          height: state.height * zoom,
          backgroundImage:
            state.background.kind === "transparent"
              ? "linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)"
              : undefined,
          backgroundSize: state.background.kind === "transparent" ? "16px 16px" : undefined,
          backgroundPosition:
            state.background.kind === "transparent"
              ? "0 0, 0 8px, 8px -8px, -8px 0px"
              : undefined,
        }}
      >
        <canvas
          ref={visibleCanvasRef}
          width={state.width}
          height={state.height}
          className={`block h-full w-full touch-none ${cursorClass}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {/* Marquee selection overlay — purely visual; the rect lives in
            host state (`marquee` prop) so the toolbar's Delete / Fill
            actions can consume it without DrawingStage being in the
            path. Rendered as an SVG sibling above the canvas so pointer
            events still hit the canvas underneath. Floating Delete /
            Fill chips render on TOP of the SVG, positioned just above
            the rect — the actions are tightly coupled to the
            selection's screen position so they live with the overlay
            (not in the host chrome). */}
        {marquee && marquee.width > 0 && marquee.height > 0 && (
          <>
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${state.width} ${state.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.width}
                height={marquee.height}
                fill="rgba(124, 58, 237, 0.12)"
                stroke="#7c3aed"
                strokeWidth={Math.max(1, state.width / 400)}
                strokeDasharray={`${Math.max(4, state.width / 100)} ${Math.max(4, state.width / 100)}`}
              />
            </svg>
            {/* Action chips — positioned just above the rect (or below
                if the rect starts near the top edge). Pixel-perfect
                placement via percentage so they stay glued to the
                rect across zoom. */}
            <div
              className="pointer-events-auto absolute flex gap-1"
              style={{
                left: `${(marquee.x / state.width) * 100}%`,
                top:
                  marquee.y > state.height * 0.08
                    ? `${(marquee.y / state.height) * 100}%`
                    : `${((marquee.y + marquee.height) / state.height) * 100}%`,
                transform:
                  marquee.y > state.height * 0.08
                    ? "translateY(-110%)"
                    : "translateY(8%)",
              }}
            >
              {onMarqueeDelete && (
                <button
                  type="button"
                  onClick={onMarqueeDelete}
                  className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-md hover:bg-slate-700"
                >
                  Delete
                </button>
              )}
              {onMarqueeFill && (
                <button
                  type="button"
                  onClick={onMarqueeFill}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-md hover:opacity-90"
                  style={{ backgroundColor: brush.color }}
                >
                  Fill
                </button>
              )}
              <button
                type="button"
                onClick={() => onMarqueeChange(null)}
                className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-md ring-1 ring-slate-300 hover:bg-slate-50"
                aria-label="Cancel selection"
              >
                ✕
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
