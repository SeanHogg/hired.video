/**
 * The image format's runtime (#940): its ImageState + undo history, the
 * hydrated flag, the drawing tool / brush / recent colours, the marquee
 * selection, the layer mutations (useImageLayerOps), the AI insert /
 * inpaint and save-to-library. Lifted out of
 * StudioEditorV2 so the editor composes runtimes instead of owning them; the
 * rules ("can't delete the last layer", "active layer follows deletion")
 * live once, here. Mounted unconditionally — harmless for other formats.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { promptDialog } from "@/lib/dialogs";
import { uploadImage } from "@/lib/services/upload-service";
import { generateImage, type ImageGenResult } from "@/lib/services/image-gen-engine";
import {
  type ImageState,
  createBlankImageState,
  findLayer as findImageLayer,
} from "@shared/image-state";
import {
  clearSelectionOnLayer,
  compositeImageIntoSelection,
  createOffscreenCanvas,
  drawBlobToCanvasFit,
  fillSelectionOnLayer,
  flattenCanvasToBlob,
  hydrateLayerCanvas,
  serializeLayer,
} from "@/lib/studio/drawing/drawing-engine";
import {
  DEFAULT_BRUSH,
  MAX_RECENT_COLORS,
  type BrushSettings,
  type DrawingTool,
} from "@/lib/studio/drawing/drawing-types";
import type { MarqueeSelection } from "@/lib/studio/drawing/drawing-engine";
import { useCanvasHistory } from "./use-canvas-history";
import { useImageLayerOps } from "./use-image-layer-ops";

export function useImageRuntime() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const imageHistory = useCanvasHistory<ImageState>(() => createBlankImageState());
  const {
    state: imageState,
    setState: setImageState,
    undo: imageUndo,
    redo: imageRedo,
    canUndo: imageCanUndo,
    canRedo: imageCanRedo,
    commit: imageCommit,
    reset: resetImageHistory,
  } = imageHistory;
  // Tracks whether the image-runtime state has been hydrated for the
  // current project (or seeded for a fresh image-kind draft). Distinct
  // from the always-present `imageState` blank seed above — the host
  // mounts `<DrawingStage/>` only when this flag is true to avoid a
  // flash of the blank canvas before the persisted project loads.
  const [imageStateHydrated, setImageStateHydrated] = useState(false);

  // Captured by DrawingStage so the host can flatten the composite on
  // Export / Save-to-library without DrawingStage needing its own
  // header buttons (single chrome, kind-aware action — per DRY).
  const [imageCanvas, setImageCanvas] = useState<HTMLCanvasElement | null>(null);
  // Save-to-library is async + needs a busy state to disable the host's
  // SaveMenu while in flight.
  const [savingImageToLibrary, setSavingImageToLibrary] = useState(false);
  // Tool + brush state lifted from DrawingStage so the LEFT-rail
  // `<DrawingToolPalette/>` (mounted by the host inside the same
  // `<CollapsiblePanel/>` Timeline kinds use for ScenesRail) drives
  // them. Per DRY the canvas + the palette read from the same state —
  // there's no parallel state-mirror.
  const [imageTool, setImageTool] = useState<DrawingTool>("brush");
  const [imageBrush, setImageBrush] = useState<BrushSettings>(DEFAULT_BRUSH);
  const [imageRecentColors, setImageRecentColors] = useState<string[]>([]);
  const pushImageRecentColor = useCallback((color: string) => {
    setImageRecentColors((prev) => {
      const filtered = prev.filter((c) => c !== color);
      return [color, ...filtered].slice(0, MAX_RECENT_COLORS);
    });
  }, []);
  // Marquee selection rect for image-kind projects — lives at the host
  // level so the Delete handler + future keyboard shortcuts can read
  // it without DrawingStage being in the path. Cleared whenever the
  // active tool changes away from `marquee` so a stale rect doesn't
  // linger when the user picks the brush.
  const [imageMarquee, setImageMarquee] = useState<MarqueeSelection | null>(null);
  // Clear the selection whenever the user switches AWAY from any
  // selection-emitting tool. Selection-emitting tools today: marquee,
  // lasso, magic-wand, quick-select. Brush / eraser / fill / hand
  // don't produce selections so leaving a stale rect when switching
  // would be confusing.
  useEffect(() => {
    const isSelectionTool =
      imageTool === "marquee" ||
      imageTool === "lasso" ||
      imageTool === "magic-wand" ||
      imageTool === "quick-select";
    if (!isSelectionTool && imageMarquee !== null) setImageMarquee(null);
  }, [imageTool, imageMarquee]);

  const layerOps = useImageLayerOps({
    setState: setImageState,
    commit: imageCommit,
    activeLayerId: imageState.activeLayerId,
  });

  // Save-to-library: flatten the live composite canvas via the shared
  // helper, upload through the SAME `uploadImage()` port MediaPicker
  // uses, toast on success. Wired to the SaveMenu's `asset-library`
  // publish destination handler so the action surfaces in the same
  // dropdown as Export / Profile gallery — no duplicate "Save to
  // library" button on the DrawingStage itself.
  const handleSaveImageToLibrary = useCallback(async () => {
    if (!imageCanvas || savingImageToLibrary) return;
    setSavingImageToLibrary(true);
    try {
      const blob = await flattenCanvasToBlob(imageCanvas, "image/png");
      const url = await uploadImage(blob, `drawing-${Date.now()}.png`);
      toast({
        title: t("studio.editor.savedToLibraryTitle"),
        description: t("studio.editor.savedToLibraryDesc"),
      });
      return url;
    } catch (err) {
      toast({
        title: t("errors.saveFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
    } finally {
      setSavingImageToLibrary(false);
    }
  }, [imageCanvas, savingImageToLibrary, toast, t]);

  // Selection actions — Delete clears pixels inside the selection on
  // the active layer; Fill paints the selection with the current
  // brush color. Both dispatch through the shared kind-aware engine
  // helpers (`clearSelectionOnLayer` / `fillSelectionOnLayer`) — ONE
  // pair of functions handles rect / path (lasso) / mask (magic-wand,
  // quick-select) shapes. Per DRY adding a future selection tool
  // (elliptical, polygonal) means zero changes here.
  const applyMarqueeOp = useCallback(
    async (op: "delete" | "fill") => {
      if (!imageMarquee) return;
      const layer = findImageLayer(imageState, imageState.activeLayerId);
      if (!layer || layer.locked) return;
      const offscreen = createOffscreenCanvas(imageState.width, imageState.height);
      await hydrateLayerCanvas(offscreen, layer.pixelsDataUrl);
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;
      if (op === "delete") {
        clearSelectionOnLayer(ctx, imageState.width, imageState.height, imageMarquee);
      } else {
        fillSelectionOnLayer(
          ctx,
          imageState.width,
          imageState.height,
          imageMarquee,
          imageBrush.color,
        );
        pushImageRecentColor(imageBrush.color);
      }
      const pixels = serializeLayer(offscreen);
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layer.id ? { ...l, pixelsDataUrl: pixels } : l,
        ),
      }));
      imageCommit();
      setImageMarquee(null);
    },
    [imageMarquee, imageState, imageBrush.color, pushImageRecentColor, setImageState, imageCommit],
  );
  const handleImageMarqueeDelete = useCallback(() => void applyMarqueeOp("delete"), [applyMarqueeOp]);
  const handleImageMarqueeFill = useCallback(() => void applyMarqueeOp("fill"), [applyMarqueeOp]);

  // AI inpaint (#1103) — when a selection is active, prompts the user
  // for a description, generates an image (img→img if the active
  // layer has pixels), composites the result MASKED to the selection.
  // The rest of the active layer's pixels are preserved.
  const handleImageMarqueeInpaint = useCallback(async () => {
    if (!imageMarquee) return;
    const promptText = await promptDialog({
      title: t("studio.editor.aiFillTitle"),
      description: t("studio.editor.aiFillDesc"),
      placeholder: t("studio.editor.aiFillPlaceholder"),
      multiline: true,
      required: true,
      confirmText: t("actions.generate"),
    });
    if (!promptText || promptText.trim().length < 3) return;
    const layer = findImageLayer(imageState, imageState.activeLayerId);
    if (!layer || layer.locked) return;
    try {
      const result = await generateImage({
        prompt: promptText.trim(),
        width: imageState.width,
        height: imageState.height,
      });
      const offscreen = createOffscreenCanvas(imageState.width, imageState.height);
      await hydrateLayerCanvas(offscreen, layer.pixelsDataUrl);
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      const url = URL.createObjectURL(result.blob);
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to decode AI result"));
          img.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
      compositeImageIntoSelection(ctx, imageState.width, imageState.height, img, imageMarquee);
      const pixels = serializeLayer(offscreen);
      setImageState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layer.id ? { ...l, pixelsDataUrl: pixels } : l,
        ),
        aiPromptHistory: [
          ...prev.aiPromptHistory,
          {
            id: `prompt-${Math.random().toString(36).slice(2, 10)}`,
            prompt: `[inpaint] ${promptText.trim()}`,
            at: new Date().toISOString(),
            engineId: result.engine,
            ...(result.resultUrl ? { resultUrl: result.resultUrl } : {}),
          },
        ].slice(-50),
      }));
      imageCommit();
      setImageMarquee(null);
      URL.revokeObjectURL(result.previewUrl);
    } catch (err) {
      toast({
        title: t("studio.editor.aiFillFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
    }
  }, [imageMarquee, imageState, setImageState, imageCommit, toast, t]);

  // AI-result layer insert — appends a new layer with the generated
  // pixels + records one entry on `aiPromptHistory`. Lives in the host
  // (alongside the layer-mutation handlers) so the right-rail-mounted
  // `<DrawingAiPromptPanel/>` can call it without DrawingStage being
  // in the path.
  const handleImageAiGenerated = useCallback(
    async (
      result: ImageGenResult,
      prompt: string,
      options: { replaceActiveLayer: boolean; hadTransparentIntent: boolean },
    ) => {
      const dataUrl = await drawBlobToCanvasFit(
        result.blob,
        imageState.width,
        imageState.height,
      );
      const historyEntry = {
        id: `prompt-${Math.random().toString(36).slice(2, 10)}`,
        prompt,
        at: new Date().toISOString(),
        engineId: result.engine,
        ...(result.resultUrl ? { resultUrl: result.resultUrl } : {}),
      };
      if (options.replaceActiveLayer) {
        // Overwrite the active layer's pixels — useful for iteration
        // on a specific layer ("regenerate this one"). Preserves the
        // layer's id / label / opacity / visibility / position in the
        // stack — only pixels change. Per the user's ask, the AI can
        // update existing layers (not just append new ones).
        setImageState((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === prev.activeLayerId ? { ...l, pixelsDataUrl: dataUrl } : l,
          ),
          aiPromptHistory: [...prev.aiPromptHistory, historyEntry].slice(-50),
        }));
      } else {
        // Append as a new layer at the top of the stack — the default,
        // non-destructive path. Label includes the prompt prefix; the
        // transparent flag annotates the label so the user can tell
        // background-removed layers apart at a glance.
        const newLayerId = `layer-${Math.random().toString(36).slice(2, 10)}`;
        const labelPrefix = options.hadTransparentIntent
          ? t("studio.editorV2.layerPrefixAiCutout")
          : t("studio.editorV2.layerPrefixAi");
        setImageState((prev) => ({
          ...prev,
          layers: [
            ...prev.layers,
            {
              id: newLayerId,
              label: `${labelPrefix}: ${prompt.slice(0, 24)}${prompt.length > 24 ? "…" : ""}`,
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
      }
      imageCommit();
    },
    [imageState.width, imageState.height, setImageState, imageCommit, t],
  );

  return {
    ...layerOps,
    imageState,
    setImageState,
    imageUndo,
    imageRedo,
    imageCanUndo,
    imageCanRedo,
    imageCommit,
    resetImageHistory,
    imageStateHydrated,
    setImageStateHydrated,
    imageCanvas,
    setImageCanvas,
    savingImageToLibrary,
    imageTool,
    setImageTool,
    imageBrush,
    setImageBrush,
    imageRecentColors,
    pushImageRecentColor,
    imageMarquee,
    setImageMarquee,
    handleSaveImageToLibrary,
    handleImageMarqueeDelete,
    handleImageMarqueeFill,
    handleImageMarqueeInpaint,
    handleImageAiGenerated,
  };
}

export type ImageRuntime = ReturnType<typeof useImageRuntime>;
