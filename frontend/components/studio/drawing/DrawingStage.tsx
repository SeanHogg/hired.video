/**
 * DrawingStage — Photoshop-shaped raster canvas runtime
 * (`mediaKind: "image"` per Consolidated Gap Register #932). Mounted
 * by `<CanvasRouter mediaKind/>` in StudioEditorV2 when the project
 * is image-kind.
 *
 * Composition: left rail (tool palette + brush settings + color
 * picker), centre (visible composite canvas wrapped in zoom container),
 * right rail (layers panel above, AI prompt panel below). Mirrors the
 * editor shell's chrome layout without re-implementing any of it —
 * those rails live INSIDE the DrawingStage because the per-tool
 * controls are runtime-specific and shouldn't pollute the host shell.
 *
 * State model: `ImageState` (shared/image-state.ts) is the source of
 * truth. Per-layer offscreen canvases are CACHE — rebuilt from each
 * layer's `pixelsDataUrl` on hydrate / undo / redo / AI gen. On every
 * stroke commit the active layer's offscreen is serialized back to a
 * dataURL and the state is updated.
 *
 * Undo/redo: reuses the existing `useCanvasHistory<T>` hook (generic
 * over T, originally written for CanvasState). Per the DRY rule we
 * don't fork a parallel history implementation — the snapshot-based
 * past/future stack works identically for ImageState.
 *
 * Per the SOLID open/closed principle the brush engine, fill engine,
 * and composite pipeline are pure functions in
 * `frontend/lib/studio/drawing/drawing-engine.ts`. Adding a new tool
 * is one entry in `DrawingTool` + one branch in the pointer handler
 * below + (optionally) a new pure function in the engine module.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Undo2, Redo2, Download, Library, Loader2 } from "lucide-react";
import {
  type ImageState,
  type ImageLayer,
  type AiPromptHistoryEntry,
  findLayer,
} from "@shared/image-state";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanvasHistory } from "@/lib/studio/editor-v2/use-canvas-history";
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
  flattenCanvasToBlob,
  floodFillAt,
  hydrateLayerCanvas,
  pickColorAt,
  serializeLayer,
  strokeBetween,
  stampBrushDab,
  createOffscreenCanvas,
} from "@/lib/studio/drawing/drawing-engine";
import { type ImageGenResult } from "@/lib/services/image-gen-engine";
import { uploadImage } from "@/lib/services/upload-service";
import { useToast } from "@/hooks/use-toast";
import DrawingToolPalette from "./DrawingToolPalette";
import DrawingLayersPanel from "./DrawingLayersPanel";
import DrawingAiPromptPanel from "./DrawingAiPromptPanel";

interface DrawingStageProps {
  state: ImageState;
  onChange: (next: ImageState) => void;
  zoom: number;
}

export default function DrawingStage({
  state: incomingState,
  onChange,
  zoom,
}: DrawingStageProps) {
  const history = useCanvasHistory<ImageState>(incomingState);
  const { state, setState, commit, undo, redo, canUndo, canRedo, reset } = history;

  // When the server pushes a new ImageState (project switch, remote
  // save), reset the local history so undo can't take the user below
  // the just-loaded snapshot. Mirrors the editor-host pattern used for
  // CanvasState — same hook, same reset semantics.
  const lastIncomingRef = useRef(incomingState);
  useEffect(() => {
    if (incomingState !== lastIncomingRef.current) {
      lastIncomingRef.current = incomingState;
      reset(incomingState);
    }
  }, [incomingState, reset]);

  // Bubble committed changes up to the host. The host owns persistence
  // (save-draft autosave hook) so it sees every state change and
  // schedules a save.
  useEffect(() => {
    if (state !== incomingState) onChange(state);
  }, [state, incomingState, onChange]);

  const [tool, setTool] = useState<DrawingTool>("brush");
  const [brush, setBrush] = useState<BrushSettings>(DEFAULT_BRUSH);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const { toast } = useToast();

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

  // ─── Layer ops ───────────────────────────────────────────────────────
  const handleAddLayer = useCallback(() => {
    const id = `layer-${Math.random().toString(36).slice(2, 10)}`;
    setState((prev) => {
      const newLayer: ImageLayer = {
        id,
        label: `Layer ${prev.layers.length + 1}`,
        kind: "raster",
        opacity: 1,
        visible: true,
        locked: false,
        blendMode: "normal",
        pixelsDataUrl: null,
      };
      return {
        ...prev,
        layers: [...prev.layers, newLayer],
        activeLayerId: id,
      };
    });
    commit();
  }, [setState, commit]);

  const handleDeleteLayer = useCallback(
    (layerId: string) => {
      setState((prev) => {
        if (prev.layers.length <= 1) return prev;
        const next = prev.layers.filter((l) => l.id !== layerId);
        return {
          ...prev,
          layers: next,
          activeLayerId:
            prev.activeLayerId === layerId
              ? (next[next.length - 1]?.id ?? prev.activeLayerId)
              : prev.activeLayerId,
        };
      });
      commit();
    },
    [setState, commit],
  );

  const handleSelectLayer = useCallback(
    (layerId: string) => {
      setState((prev) => ({ ...prev, activeLayerId: layerId }));
      commit();
    },
    [setState, commit],
  );

  const handleToggleVisible = useCallback(
    (layerId: string) => {
      setState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, visible: !l.visible } : l,
        ),
      }));
      commit();
    },
    [setState, commit],
  );

  const handleRenameLayer = useCallback(
    (layerId: string, label: string) => {
      setState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, label } : l,
        ),
      }));
      commit();
    },
    [setState, commit],
  );

  const handleSetOpacity = useCallback(
    (layerId: string, opacity: number) => {
      setState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, opacity } : l,
        ),
      }));
    },
    [setState],
  );

  const handleMoveLayer = useCallback(
    (layerId: string, direction: "up" | "down") => {
      setState((prev) => {
        // ImageState stores bottom-first; "up" in the display (top of
        // the stack) means later in the array.
        const idx = prev.layers.findIndex((l) => l.id === layerId);
        if (idx < 0) return prev;
        const offset = direction === "up" ? 1 : -1;
        const target = idx + offset;
        if (target < 0 || target >= prev.layers.length) return prev;
        const next = [...prev.layers];
        const [moved] = next.splice(idx, 1);
        next.splice(target, 0, moved);
        return { ...prev, layers: next };
      });
      commit();
    },
    [setState, commit],
  );

  // ─── AI integration ──────────────────────────────────────────────────
  const handleAiGenerated = useCallback(
    async (result: ImageGenResult, prompt: string) => {
      const newLayerId = `layer-${Math.random().toString(36).slice(2, 10)}`;
      // Convert the result blob to a dataURL sized to the canvas. We
      // letterbox/cover-fit so the generated image fills the workspace
      // without distorting aspect.
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
          },
        ],
        activeLayerId: newLayerId,
        aiPromptHistory: [...prev.aiPromptHistory, historyEntry].slice(-50),
      }));
      commit();
    },
    [setState, commit, state.width, state.height],
  );

  // ─── Export (PNG download) ───────────────────────────────────────────
  const handleExportPng = useCallback(async () => {
    const visible = visibleCanvasRef.current;
    if (!visible) return;
    const blob = await flattenCanvasToBlob(visible, "image/png");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drawing-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ─── Save to media library ───────────────────────────────────────────
  // Flattens the current composite to a PNG and uploads it to the
  // user's R2 namespace via the SHARED `uploadImage()` port. Once
  // uploaded the result appears in MediaPicker's "Library" tab, ready
  // to drop onto Video / Game / Comic scenes — that's the closed-loop
  // interop the user articulated ("Give them all the tools in 1
  // studio"). Per Gap Register #933.
  const handleSaveToLibrary = useCallback(async () => {
    const visible = visibleCanvasRef.current;
    if (!visible || savingToLibrary) return;
    setSavingToLibrary(true);
    try {
      const blob = await flattenCanvasToBlob(visible, "image/png");
      const url = await uploadImage(blob, `drawing-${Date.now()}.png`);
      toast({
        title: "Saved to your library",
        description: "Pick it from MediaPicker → Library in any studio project.",
      });
      return url;
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingToLibrary(false);
    }
  }, [savingToLibrary, toast]);

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
        <div className="flex items-center gap-1 border-b bg-background px-3 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (⌘Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={redo}
                disabled={!canRedo}
                aria-label="Redo"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {state.width}×{state.height}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => void handleSaveToLibrary()}
              disabled={savingToLibrary}
              title="Saved drawings appear in MediaPicker → Library across every studio project."
            >
              {savingToLibrary ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Library className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save to library
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => void handleExportPng()}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export PNG
            </Button>
          </div>
        </div>
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
      <div className="flex w-64 flex-col">
        <DrawingLayersPanel
          state={state}
          onAddLayer={handleAddLayer}
          onDeleteLayer={handleDeleteLayer}
          onSelectLayer={handleSelectLayer}
          onToggleVisible={handleToggleVisible}
          onRenameLayer={handleRenameLayer}
          onSetOpacity={handleSetOpacity}
          onMoveLayer={handleMoveLayer}
        />
        <DrawingAiPromptPanel
          history={state.aiPromptHistory}
          onGenerated={(result, prompt) => void handleAiGenerated(result, prompt)}
        />
      </div>
    </div>
  );
}

