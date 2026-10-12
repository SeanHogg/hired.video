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
 *   • Right slot → `<DrawingAiPromptPanel/>` (the workspace inspector —
 *     the same slot Timeline kinds use for PropertiesPanel).
 *   • Rail › Layers → `<DrawingLayersPanel/>`.
 *   • Header → Undo / Redo; ⋯ → save / export / library.
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
  getLayerContentBbox,
  hydrateLayerCanvas,
  hydrateTextLayer,
  hydrateVectorLayer,
  magicWandMask,
  pickColorAt,
  quickSelectAccumulate,
  serializeLayer,
  strokeBetween,
  stampBrushDab,
  type MarqueeSelection,
} from "@/lib/studio/drawing/drawing-engine";
import TransformHandles, {
  type TransformRect,
} from "@/components/studio/v2/TransformHandles";

/** Selection rectangle (rect-form only) in CANVAS coordinates.
 *  Retained as the host's external prop name + back-compat shape for
 *  rect-only consumers; the full union (rect | path | mask) is
 *  `MarqueeSelection` re-exported from the engine. */
export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Re-export so the host can type its state once instead of importing
 *  from both DrawingStage AND the engine. Three selection shapes:
 *    - rect:  marquee tool (free-form drag).
 *    - path:  lasso tool (closed polygon).
 *    - mask:  magic-wand + quick-select tools (rasterised flood-fill).
 */
export type { MarqueeSelection };

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
  /** Active selection (rect / path / mask) in canvas coords. Null
   *  when no selection is active or when no selection tool is the
   *  current tool. Bidirectionally controlled — DrawingStage emits
   *  selections from the marquee / lasso / magic-wand / quick-select
   *  tools, the host clears it after Delete / Fill / AI inpaint. */
  marquee: MarqueeSelection | null;
  onMarqueeChange: (next: MarqueeSelection | null) => void;
  /** Selection action handlers — invoked by the floating Delete /
   *  Fill / AI-inpaint chips overlayed on the active selection. Host
   *  owns the imperative work (engine ops + commit); DrawingStage
   *  renders the buttons because they're positioned ON the selection's
   *  bounding box (tight visual coupling). */
  onMarqueeDelete?: () => void;
  onMarqueeFill?: () => void;
  onMarqueeInpaint?: () => void;
  /** Hand-tool layer transform — bidirectionally controlled. The
   *  active layer's combined offset / scale / rotation is surfaced
   *  via the <TransformHandles/> primitive around the layer's content
   *  bbox. The host owns the commits + the per-axis defaults so
   *  DrawingStage doesn't have to know how the layer-mutation
   *  handlers are structured. */
  onLayerTransform?: (next: {
    offset: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
  }) => void;
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
  onMarqueeInpaint,
  onLayerTransform,
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
        // Per layer kind, compute a hydration key so we re-render only
        // when the kind-specific content changes (#940 Phase 2 — vector
        // + text layers don't carry pixelsDataUrl but DO carry shapes /
        // text content that need re-rasterisation when edited; raster
        // layers may resolve their pixels from R2 instead of the inline
        // dataURL via `pixelsR2Key` — #940 dataURL bloat mitigation).
        const rasterSource = layer.pixelsR2Key ?? layer.pixelsDataUrl;
        const hydrationKey =
          layer.kind === "vector"
            ? `v:${JSON.stringify(layer.vectorShapes ?? [])}`
            : layer.kind === "text"
              ? `t:${JSON.stringify(layer.textContent ?? null)}`
              : rasterSource;
        let canvas = cache.get(layer.id);
        const rebuild =
          !canvas || canvas.width !== state.width || canvas.height !== state.height;
        if (rebuild) {
          canvas = createOffscreenCanvas(state.width, state.height);
          cache.set(layer.id, canvas);
        }
        if (rebuild || prevHydrated !== hydrationKey) {
          if (!rebuild && canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          if (layer.kind === "vector") {
            hydrateVectorLayer(canvas!, layer.vectorShapes ?? []);
          } else if (layer.kind === "text" && layer.textContent) {
            hydrateTextLayer(canvas!, layer.textContent);
          } else {
            await hydrateLayerCanvas(canvas!, rasterSource);
          }
          snap.set(layer.id, hydrationKey);
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
  // union covers every pointer-driven interaction a tool can initiate.
  type DragState =
    | { kind: "none" }
    | { kind: "paint"; lastPoint: CanvasPoint }
    | { kind: "translate"; startX: number; startY: number; startOffset: { x: number; y: number } }
    | { kind: "marquee"; startX: number; startY: number }
    | { kind: "lasso"; points: Array<{ x: number; y: number }> }
    | { kind: "quick-select"; mask: ImageData | null };
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
        onMarqueeChange({ kind: "rect", x: point.x, y: point.y, width: 0, height: 0 });
        strokeRef.current = { kind: "marquee", startX: point.x, startY: point.y };
        return;
      }

      // Lasso tool — drag traces a free-form polygon perimeter.
      // pointerup closes the polygon. Reported to the host as
      // `{ kind: "path", points }` so the engine's clip-based
      // clear/fill operate inside the polygon.
      if (tool === "lasso") {
        const points = [{ x: point.x, y: point.y }];
        onMarqueeChange({ kind: "path", points });
        strokeRef.current = { kind: "lasso", points };
        return;
      }

      // Magic wand — single click. Flood-fills the COMPOSITE visible
      // canvas at the click point (not the active layer's hidden
      // pixels), so the wand selects what the user actually sees.
      // Emits a mask-form selection.
      if (tool === "magic-wand") {
        const visible = visibleCanvasRef.current;
        if (!visible) return;
        const visibleCtx = visible.getContext("2d");
        if (!visibleCtx) return;
        const mask = magicWandMask(visibleCtx, state.width, state.height, point.x, point.y);
        onMarqueeChange({ kind: "mask", mask });
        // No drag — pointerup is a no-op for this tool.
        strokeRef.current = { kind: "none" };
        return;
      }

      // Quick-select — drag accumulates flood-fill dabs into the
      // running mask. Each pointermove samples + grows the mask;
      // pointerup finalises whatever's been accumulated.
      if (tool === "quick-select") {
        const visible = visibleCanvasRef.current;
        if (!visible) return;
        const visibleCtx = visible.getContext("2d");
        if (!visibleCtx) return;
        const seed = quickSelectAccumulate(
          visibleCtx,
          state.width,
          state.height,
          point.x,
          point.y,
          24,
          null,
        );
        onMarqueeChange({ kind: "mask", mask: seed });
        strokeRef.current = { kind: "quick-select", mask: seed };
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
        onMarqueeChange({ kind: "rect", x, y, width, height });
        return;
      }

      if (drag.kind === "lasso") {
        // Append point + emit updated path. Cheap because the engine
        // op consumes the array directly (no rasterisation per frame).
        drag.points.push({ x: point.x, y: point.y });
        onMarqueeChange({ kind: "path", points: drag.points.slice() });
        return;
      }

      if (drag.kind === "quick-select") {
        const visible = visibleCanvasRef.current;
        if (!visible) return;
        const visibleCtx = visible.getContext("2d");
        if (!visibleCtx) return;
        const next = quickSelectAccumulate(
          visibleCtx,
          state.width,
          state.height,
          point.x,
          point.y,
          24,
          drag.mask,
        );
        drag.mask = next;
        onMarqueeChange({ kind: "mask", mask: next });
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
      // Marquee finalise: tiny rects (drag distance < ~3px) probably
      // mean a click rather than a drag — clear them so an accidental
      // click doesn't leave a phantom selection.
      if (drag.kind === "marquee" && marquee?.kind === "rect" && (marquee.width < 3 || marquee.height < 3)) {
        onMarqueeChange(null);
        return;
      }
      // Lasso finalise: require >= 3 points for a meaningful polygon;
      // anything less is a misclick.
      if (drag.kind === "lasso" && marquee?.kind === "path" && marquee.points.length < 3) {
        onMarqueeChange(null);
        return;
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
      : tool === "marquee" || tool === "lasso" || tool === "magic-wand" || tool === "quick-select"
        ? "cursor-crosshair"
        : tool === "fill"
          ? "cursor-cell"
          : "cursor-crosshair";

  // ─── Selection overlay helpers — bbox + render path ──────────────────
  // Compute the bbox of any selection shape so the floating action
  // chips can position themselves consistently regardless of which
  // tool produced the selection (DRY: one chip layout, three shapes).
  const selectionBbox = useMemo(() => {
    if (!marquee) return null;
    if (marquee.kind === "rect") {
      return { x: marquee.x, y: marquee.y, width: marquee.width, height: marquee.height };
    }
    if (marquee.kind === "path") {
      if (marquee.points.length === 0) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of marquee.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    // Mask form — scan for non-zero alpha bounds. Cached per-mask via
    // useMemo since the mask reference changes only on tool action.
    const m = marquee.mask;
    let minX = m.width;
    let minY = m.height;
    let maxX = -1;
    let maxY = -1;
    const data = m.data;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (data[(y * m.width + x) * 4 + 3] !== 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }, [marquee]);

  // Render the mask form as a translucent canvas overlay via dataURL.
  // Computed only when the mask changes; not on every render.
  const maskOverlayDataUrl = useMemo(() => {
    if (!marquee || marquee.kind !== "mask") return null;
    const c = createOffscreenCanvas(marquee.mask.width, marquee.mask.height);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    // Tint the mask brand-primary at low alpha so the user sees what's
    // selected without obscuring the canvas underneath.
    ctx.putImageData(marquee.mask, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "rgba(124, 58, 237, 0.35)";
    ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }, [marquee]);

  // ─── Hand-tool selection chrome (#1101 + #1104) ──────────────────────
  // When the Hand tool is active, surround the active layer's content
  // bbox with the shared <TransformHandles/> primitive so the user
  // can move / resize / rotate. The bbox derives from the layer's
  // pixel content (#1104) so empty layers don't show a phantom chrome
  // around an empty canvas.
  const activeLayerBbox = useMemo(() => {
    if (tool !== "hand") return null;
    if (!activeLayer || !activeLayer.pixelsDataUrl) return null;
    const canvas = activeLayerCanvas();
    if (!canvas) return null;
    return getLayerContentBbox(canvas);
  }, [tool, activeLayer, activeLayerCanvas]);

  // Combined transform applied to the bbox so TransformHandles surrounds
  // the layer in its rendered position (offset + scale + rotation
  // applied at composite time means the on-screen bbox shifts too).
  const handleRect: TransformRect | null = useMemo(() => {
    if (!activeLayerBbox || !activeLayer) return null;
    const offset = activeLayer.transformOffset ?? { x: 0, y: 0 };
    const scale = activeLayer.transformScale ?? { x: 1, y: 1 };
    const rotation = activeLayer.transformRotation ?? 0;
    // Centre-pivot scaling: each axis grows/shrinks from the canvas
    // centre, matching `compositeLayers`. The visible bbox in
    // composite coordinates is the source bbox shifted toward/away
    // from the centre by the scale factor.
    const cx = state.width / 2;
    const cy = state.height / 2;
    const x = cx + (activeLayerBbox.x - cx) * scale.x + offset.x;
    const y = cy + (activeLayerBbox.y - cy) * scale.y + offset.y;
    const width = activeLayerBbox.width * scale.x;
    const height = activeLayerBbox.height * scale.y;
    return { x, y, width, height, rotation };
  }, [activeLayerBbox, activeLayer, state.width, state.height]);

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
        {/* Selection overlay — single render path that handles all
            three shapes (rect / path / mask) so adding a future
            selection tool (elliptical marquee, polygonal lasso) means
            zero changes to the overlay or the chip layout. Visual
            language is brand-primary dashed outline for rect + path,
            translucent purple tint for mask. */}
        {marquee && selectionBbox && (
          <>
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${state.width} ${state.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {marquee.kind === "rect" && (
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
              )}
              {marquee.kind === "path" && marquee.points.length >= 2 && (
                <polygon
                  points={marquee.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(124, 58, 237, 0.12)"
                  stroke="#7c3aed"
                  strokeWidth={Math.max(1, state.width / 400)}
                  strokeDasharray={`${Math.max(4, state.width / 100)} ${Math.max(4, state.width / 100)}`}
                />
              )}
            </svg>
            {marquee.kind === "mask" && maskOverlayDataUrl && (
              <img
                src={maskOverlayDataUrl}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full"
                draggable={false}
                aria-hidden="true"
              />
            )}
            {/* Action chips — anchored to selection bbox; same layout
                regardless of selection shape (per DRY). */}
            <div
              className="pointer-events-auto absolute flex gap-1"
              style={{
                left: `${(selectionBbox.x / state.width) * 100}%`,
                top:
                  selectionBbox.y > state.height * 0.08
                    ? `${(selectionBbox.y / state.height) * 100}%`
                    : `${((selectionBbox.y + selectionBbox.height) / state.height) * 100}%`,
                transform:
                  selectionBbox.y > state.height * 0.08
                    ? "translateY(-110%)"
                    : "translateY(8%)",
              }}
            >
              {onMarqueeDelete && (
                <button
                  type="button"
                  onClick={onMarqueeDelete}
                  className="rounded-md bg-ink px-2 py-1 text-[11px] font-semibold text-white shadow-md hover:bg-slate-700"
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
              {onMarqueeInpaint && (
                <button
                  type="button"
                  onClick={onMarqueeInpaint}
                  className="rounded-md bg-teal-600 px-2 py-1 text-[11px] font-semibold text-white shadow-md hover:bg-teal-500"
                  title="AI: fill the selected region from a prompt"
                >
                  AI fill
                </button>
              )}
              <button
                type="button"
                onClick={() => onMarqueeChange(null)}
                className="rounded-md bg-card px-2 py-1 text-[11px] font-semibold text-foreground shadow-md ring-1 ring-border hover:bg-muted"
                aria-label="Cancel selection"
              >
                ✕
              </button>
            </div>
          </>
        )}
        {/* Hand-tool transform chrome — surrounds the active layer's
            content bbox with the shared <TransformHandles/> primitive
            so the user can move / resize / rotate. Visual mirrors
            V2-Video's widget selection (halo + bottom-right resize +
            rotation ball). Only renders when (a) the Hand tool is the
            active tool AND (b) the active layer has pixels AND (c)
            the host wired an `onLayerTransform` callback. */}
        {/* #1104 — Hand-tool selection chrome: thin dashed bounding box
            around the active layer's pixel content. Sits BEHIND the
            TransformHandles so the halo + resize ball remain the
            interactive surface. Brand-purple matches the marquee + V2
            widget selection ring. Renders only when handleRect resolves
            (layer has pixels), so empty layers don't show phantom chrome. */}
        {tool === "hand" && handleRect && (
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: handleRect.x * zoom,
              top: handleRect.y * zoom,
              width: handleRect.width * zoom,
              height: handleRect.height * zoom,
              transform: handleRect.rotation
                ? `rotate(${handleRect.rotation}deg)`
                : undefined,
              transformOrigin: "center",
              border: "1px dashed rgb(139 92 246)", // brand blue-500
              boxSizing: "border-box",
              zIndex: 1,
            }}
          />
        )}
        {tool === "hand" && handleRect && onLayerTransform && (
          <TransformHandles
            rect={handleRect}
            stageWidth={state.width}
            stageHeight={state.height}
            selected
            onChange={(next) => {
              // Translate the bbox-frame rect back into layer-frame
              // transforms. Width / height in `handleRect` are the
              // bbox scaled; deriving scale = next.size / bboxNatural
              // assumes the bbox dimensions stay fixed across the
              // drag (true — handleRect is memoised on the bbox).
              if (!activeLayerBbox) return;
              const scaleX = activeLayerBbox.width > 0 ? next.width / activeLayerBbox.width : 1;
              const scaleY = activeLayerBbox.height > 0 ? next.height / activeLayerBbox.height : 1;
              const cx = state.width / 2;
              const cy = state.height / 2;
              const offsetX = next.x - (cx + (activeLayerBbox.x - cx) * scaleX);
              const offsetY = next.y - (cy + (activeLayerBbox.y - cy) * scaleY);
              onLayerTransform({
                offset: { x: offsetX, y: offsetY },
                scale: { x: scaleX, y: scaleY },
                rotation: next.rotation,
              });
            }}
            onCommit={commit}
          />
        )}
      </div>
    </div>
  );
}
