/**
 * DrawingStage — Photoshop-shaped raster canvas runtime
 * (`mediaKind: "image"` per Consolidated Gap Register #932). Mounted
 * by `<CanvasRouter mediaKind/>` in StudioEditorV2 when the project
 * is image-kind.
 *
 * Composition: left rail (tool palette + brush settings + color
 * picker), centre (visible composite canvas), right rail (AI prompt
 * panel). The layers list / undo+redo / save / export controls all
 * live in the SHARED editor chrome the host already mounts — per the
 * DRY rule (`feedback_extract_on_duplication`) the DrawingStage does
 * NOT duplicate those affordances. Specifically:
 *
 *   • Undo / redo → host's `<CanvasEditToolbar/>` (bottom-left), wired
 *     to the host's `useCanvasHistory<ImageState>` when image kind.
 *   • Layers → host's `<FloatingImageLayersPanel/>` (bottom-centre),
 *     replacing the Timeline `<FloatingLayersPanel/>` for image kind.
 *   • Save / Export / Save-to-library → host's `<StudioSaveMenuV2/>`
 *     in the header, with the export verb auto-deriving from the
 *     mediaKind table and the asset-library publish destination
 *     routing through the same R2 upload path as MediaPicker.
 *
 * This component is CONTROLLED — the host owns `state`, `setState`,
 * `commit`, plus the layer-mutation handlers. DrawingStage just
 * renders the canvas + tool palette + AI prompt and emits state
 * updates on user input.
 *
 * State model: `ImageState` (shared/image-state.ts) is the source of
 * truth. Per-layer offscreen canvases are CACHE — rebuilt from each
 * layer's `pixelsDataUrl` on hydrate / undo / redo / AI gen. On every
 * stroke commit the active layer's offscreen is serialized back to a
 * dataURL and the state is updated.
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
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  type ImageState,
  type ImageLayer,
  type AiPromptHistoryEntry,
  findLayer,
} from "@shared/image-state";
import {
  type BrushSettings,
  type CanvasPoint,
  type DrawingTool,
  DEFAULT_BRUSH,
  MAX_RECENT_COLORS,
} from "@/lib/studio/drawing/drawing-types";
import {
  compositeLayers,
  drawBlobToCanvasFit,
  floodFillAt,
  hydrateLayerCanvas,
  pickColorAt,
  serializeLayer,
  strokeBetween,
  stampBrushDab,
  createOffscreenCanvas,
} from "@/lib/studio/drawing/drawing-engine";
import { type ImageGenResult } from "@/lib/services/image-gen-engine";
import DrawingToolPalette from "./DrawingToolPalette";
import DrawingAiPromptPanel from "./DrawingAiPromptPanel";

interface DrawingStageProps {
  /** Controlled image state — owned by the host (so the host's
   *  CanvasEditToolbar can drive undo/redo + the host's SaveMenu can
   *  flatten on Export). */
  state: ImageState;
  /** Host's setState — used directly for stroke pixel commits, AI
   *  result layer inserts, and active-layer changes. */
  setState: Dispatch<SetStateAction<ImageState>>;
  /** Host's history commit — fired on stroke end + AI gen + the
   *  layer-mutation actions handled by FloatingImageLayersPanel. */
  commit: () => void;
  zoom: number;
  /** Captured by the host on first paint so it can flatten the
   *  composite for Export / Save-to-library. Called with null on
   *  unmount so the host releases the reference. */
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

export default function DrawingStage({
  state,
  setState,
  commit,
  zoom,
  onCanvasReady,
}: DrawingStageProps) {
  const [tool, setTool] = useState<DrawingTool>("brush");
  const [brush, setBrush] = useState<BrushSettings>(DEFAULT_BRUSH);
  const [recentColors, setRecentColors] = useState<string[]>([]);

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
      // Remove canvases for layers that no longer exist.
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
          // The dataURL changed (undo/redo/AI gen replaced pixels) —
          // re-hydrate while keeping the same canvas reference.
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
  // doesn't allocate or re-render on every frame.
  const strokeRef = useRef<{
    active: boolean;
    lastPoint: CanvasPoint | null;
  }>({ active: false, lastPoint: null });

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

  const pushRecentColor = useCallback((color: string) => {
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c !== color);
      return [color, ...filtered].slice(0, MAX_RECENT_COLORS);
    });
  }, []);

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

  // ─── Pointer handlers ────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const layer = activeLayer;
      if (!layer || layer.locked) return;
      const canvas = activeLayerCanvas();
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const point = localPointFromEvent(e);
      if (!point) return;

      e.currentTarget.setPointerCapture(e.pointerId);

      if (tool === "eyedropper") {
        const visible = visibleCanvasRef.current;
        if (!visible) return;
        const visibleCtx = visible.getContext("2d");
        if (!visibleCtx) return;
        const color = pickColorAt(visibleCtx, point.x, point.y);
        setBrush((b) => ({ ...b, color }));
        pushRecentColor(color);
        return;
      }

      if (tool === "fill") {
        floodFillAt(ctx, state.width, state.height, point.x, point.y, brush.color);
        pushRecentColor(brush.color);
        recomposite();
        commitActiveLayerToState();
        return;
      }

      // brush / eraser — start the stroke.
      strokeRef.current = { active: true, lastPoint: point };
      ctx.save();
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      stampBrushDab(ctx, brush, point);
      ctx.restore();
      if (tool === "brush") pushRecentColor(brush.color);
      recomposite();
    },
    [
      activeLayer,
      activeLayerCanvas,
      brush,
      commitActiveLayerToState,
      localPointFromEvent,
      pushRecentColor,
      recomposite,
      state.height,
      state.width,
      tool,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!strokeRef.current.active) return;
      const layer = activeLayer;
      if (!layer || layer.locked) return;
      const canvas = activeLayerCanvas();
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const point = localPointFromEvent(e);
      if (!point) return;
      const last = strokeRef.current.lastPoint ?? point;
      ctx.save();
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      strokeBetween(ctx, brush, last, point);
      ctx.restore();
      strokeRef.current.lastPoint = point;
      recomposite();
    },
    [activeLayer, activeLayerCanvas, brush, localPointFromEvent, recomposite, tool],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!strokeRef.current.active) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      strokeRef.current = { active: false, lastPoint: null };
      commitActiveLayerToState();
    },
    [commitActiveLayerToState],
  );

  // ─── AI integration ──────────────────────────────────────────────────
  // The AI prompt panel inserts a new layer + appends one history entry.
  // Same setState + commit pair the host uses for its layer-mutation
  // handlers — no separate code path. Layer + history rules stay in the
  // host's reducer (via setState).
  const handleAiGenerated = useCallback(
    async (result: ImageGenResult, prompt: string) => {
      const newLayerId = `layer-${Math.random().toString(36).slice(2, 10)}`;
      // Letterbox-fit the result blob onto a layer-sized canvas + return
      // the dataURL. Shared engine helper — same flatten path used by
      // the host's Export.
      const dataUrl = await drawBlobToCanvasFit(
        result.blob,
        state.width,
        state.height,
      );
      const historyEntry: AiPromptHistoryEntry = {
        id: `prompt-${Math.random().toString(36).slice(2, 10)}`,
        prompt,
        at: new Date().toISOString(),
        engineId: result.engine,
        ...(result.resultUrl ? { resultUrl: result.resultUrl } : {}),
      };
      setState((prev) => ({
        ...prev,
        layers: [
          ...prev.layers,
          {
            id: newLayerId,
            label: `AI: ${prompt.slice(0, 24)}${prompt.length > 24 ? "…" : ""}`,
            kind: "raster",
            opacity: 1,
            visible: true,
            locked: false,
            blendMode: "normal",
            pixelsDataUrl: dataUrl,
          } satisfies ImageLayer,
        ],
        activeLayerId: newLayerId,
        aiPromptHistory: [...prev.aiPromptHistory, historyEntry].slice(-50),
      }));
      commit();
    },
    [setState, commit, state.width, state.height],
  );

  // Expose the visible canvas to the host so its SaveMenu (Export / Save
  // to library) can flatten on demand. Single ownership — the host
  // captures the live canvas element; DrawingStage doesn't itself
  // expose download / upload UI.
  useEffect(() => {
    onCanvasReady?.(visibleCanvasRef.current);
    return () => onCanvasReady?.(null);
  }, [onCanvasReady]);

  // ─── Render ──────────────────────────────────────────────────────────
  const cursorClass =
    tool === "fill"
      ? "cursor-cell"
      : tool === "eyedropper"
        ? "cursor-crosshair"
        : "cursor-crosshair";

  return (
    <div className="flex h-full w-full">
      <DrawingToolPalette
        tool={tool}
        onToolChange={setTool}
        brush={brush}
        onBrushChange={setBrush}
        recentColors={recentColors}
      />
      <div className="relative flex flex-1 flex-col">
        <div
          ref={containerRef}
          className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-6"
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
              backgroundSize:
                state.background.kind === "transparent"
                  ? "16px 16px"
                  : undefined,
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
          </div>
        </div>
      </div>
      <div className="flex w-64 flex-col border-l bg-background">
        <DrawingAiPromptPanel
          history={state.aiPromptHistory}
          onGenerated={(result, prompt) => void handleAiGenerated(result, prompt)}
        />
      </div>
    </div>
  );
}
