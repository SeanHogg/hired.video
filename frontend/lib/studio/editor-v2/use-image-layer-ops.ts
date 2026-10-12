/**
 * Image layer mutations (#940): add (raster / vector / text), delete,
 * select, show/hide, rename, opacity, blend mode, filters, reorder and the
 * hand-tool transform. Each structural edit pushes a history checkpoint via
 * `commit`. Used by useImageRuntime; pure state transitions over ImageState.
 */
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  type ImageLayer,
  type ImageState,
  type LayerBlendMode,
  type LayerFilters,
  type LayerKind,
  findLayer as findImageLayer,
  makeTextLayer,
  makeVectorLayer,
} from "@shared/image-state";

export interface ImageLayerOpsInput {
  setState: Dispatch<SetStateAction<ImageState>>;
  commit: () => void;
  activeLayerId: string;
}

export function useImageLayerOps({ setState, commit, activeLayerId }: ImageLayerOpsInput) {
  const { t } = useTranslation();
  // ─── Image-runtime layer-mutation handlers (lifted from DrawingStage) ──
  // These live outside DrawingStage so the layers panel and the canvas
  // drive the same handlers. Per the DRY
  // rule the rules ("can't delete the last layer", "active layer
  // selection follows deletion") live ONCE here.
  const handleImageAddLayer = useCallback(() => {
    handleImageAddLayerOfKind("raster");
  }, []);
  const handleImageAddLayerOfKind = useCallback(
    (kind: LayerKind) => {
      setState((prev) => {
        let layer: ImageLayer;
        const baseLabel = t("studio.editorV2.layerLabel", { number: prev.layers.length + 1 });
        if (kind === "vector") {
          layer = makeVectorLayer(baseLabel);
        } else if (kind === "text") {
          layer = makeTextLayer(baseLabel);
        } else {
          layer = {
            id: `layer-${Math.random().toString(36).slice(2, 10)}`,
            label: baseLabel,
            kind: "raster",
            opacity: 1,
            visible: true,
            locked: false,
            blendMode: "normal",
            pixelsDataUrl: null,
          };
        }
        return {
          ...prev,
          layers: [...prev.layers, layer],
          activeLayerId: layer.id,
        };
      });
      commit();
    },
    [setState, commit, t],
  );
  const handleImageDeleteLayer = useCallback(
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
  const handleImageSelectLayer = useCallback(
    (layerId: string) => {
      setState((prev) =>
        findImageLayer(prev, layerId) ? { ...prev, activeLayerId: layerId } : prev,
      );
      commit();
    },
    [setState, commit],
  );
  const handleImageToggleVisible = useCallback(
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
  const handleImageRenameLayer = useCallback(
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
  const handleImageSetOpacity = useCallback(
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
  /** Set a layer's blend mode (#940 Image Phase 2). Routes through the
   *  same history-aware setter as the opacity handler — undo/redo
   *  participates by reading from the canvas-history wrapper. */
  const handleImageSetBlendMode = useCallback(
    (layerId: string, blendMode: LayerBlendMode) => {
      setState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, blendMode } : l,
        ),
      }));
      commit();
    },
    [setState, commit],
  );
  /** Patch a layer's filter chain (#940 Image Phase 2). Non-destructive
   *  — the layer's `pixelsDataUrl` is untouched; toggling filters off
   *  restores the original pixels. */
  const handleImageSetFilters = useCallback(
    (layerId: string, filters: LayerFilters | undefined) => {
      setState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, filters } : l,
        ),
      }));
      commit();
    },
    [setState, commit],
  );
  const handleImageMoveLayer = useCallback(
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

  // Hand-tool transform commit — DrawingStage's TransformHandles emit
  // the combined offset / scale / rotation; the host writes it back to
  // the active layer's transform fields. Per DRY the host owns the
  // layer-mutation handler; DrawingStage just renders the chrome.
  const handleImageLayerTransform = useCallback(
    (next: { offset: { x: number; y: number }; scale: { x: number; y: number }; rotation: number }) => {
      const layerId = activeLayerId;
      setState((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                transformOffset: next.offset,
                transformScale: next.scale,
                transformRotation: next.rotation,
              }
            : l,
        ),
      }));
    },
    [activeLayerId, setState],
  );

  return {
    handleImageAddLayer,
    handleImageAddLayerOfKind,
    handleImageDeleteLayer,
    handleImageSelectLayer,
    handleImageToggleVisible,
    handleImageRenameLayer,
    handleImageSetOpacity,
    handleImageSetBlendMode,
    handleImageSetFilters,
    handleImageMoveLayer,
    handleImageLayerTransform,
  };
}
