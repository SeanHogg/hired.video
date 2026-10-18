/**
 * The floating AI selection chip's source: resolves the selected element's
 * image (per format) into what `<AiSelectionChip/>` consumes, or null when
 * nothing usable is selected (the chip hides). Every format goes through the
 * same chip + the same `useMediaAiPrompt` hook:
 *   • image      → active layer's pixelsDataUrl (img→img via dataUrl)
 *   • animation  → active frame's pixelsDataUrl (img→img via dataUrl)
 *   • game       → selected sprite's asset URL  (img→img via CDN url)
 *   • timeline   → selected image widget's URL  (img→img via CDN url)
 */
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { MediaKind } from "@shared/media-kinds";
import { type ImageState, findLayer as findImageLayer } from "@shared/image-state";
import type { AnimationState } from "@shared/animation-state";
import type { GameState } from "@shared/game-state";
import type { ImageGenResult } from "@/lib/services/image-gen-engine";
import type { Selection } from "./editor-types";
import { addCustomSpriteAsset as gameAddCustomSpriteAsset } from "@/lib/studio/game/game-state-edit";
import { persistGeneratedImage } from "@/lib/studio/media-persistence";
import type { Scene, WidgetParams } from "./canvas-state";

export interface AiChipSource {
  kindNoun: string;
  label?: string;
  url?: string;
  dataUrl?: string;
  placeholder?: string;
  /** Selection bbox in viewport pixels (design pixels × current zoom),
   *  relative to the per-surface `<div className="relative">` wrapper
   *  in which the chip mounts. Game sprites + timeline widgets supply
   *  one (chip anchors above the element); drawing layers + animation
   *  frames omit it (chip falls back to top-right of canvas — correct
   *  because the canvas IS the selection). */
  bbox?: { x: number; y: number; width: number; height: number };
  onGenerated: (result: ImageGenResult, prompt: string) => void | Promise<void>;
}

export interface AiChipSourceInput {
  mediaKind: MediaKind;
  usesTimelineChrome: boolean;
  zoom: number;
  imageState: ImageState;
  animationState: AnimationState;
  gameState: GameState | null;
  setGameState: Dispatch<SetStateAction<GameState | null>>;
  activeLevelId: string | null;
  selectedSpriteId: string | null;
  selection: Selection;
  activeScene: Scene;
  canvasSize: { width: number; height: number };
  handleImageAiGenerated: (
    result: ImageGenResult,
    prompt: string,
    options: { replaceActiveLayer: boolean; hadTransparentIntent: boolean },
  ) => Promise<void>;
  handleAnimationAiGenerated: (result: ImageGenResult) => Promise<void>;
  updateWidgetParams: (widgetId: string, params: WidgetParams) => void;
}

/** Resolver context: the hook input plus the translator. */
type ChipSourceCtx = AiChipSourceInput & { t: TFunction };

/** Per-kind resolver. Returns the source, `null` (kind matched but nothing
 *  usable is selected → chip hides) or `undefined` (fall through to the
 *  Timeline-widget resolver). */
type KindChipSourceResolver = (ctx: ChipSourceCtx) => AiChipSource | null | undefined;

const KIND_CHIP_SOURCES: Partial<Record<MediaKind, KindChipSourceResolver>> = {
  image: ({ imageState, handleImageAiGenerated, t }) => {
    const layer = findImageLayer(imageState, imageState.activeLayerId);
    if (!layer?.pixelsDataUrl) return null;
    return {
      kindNoun: "layer",
      label: layer.label,
      dataUrl: layer.pixelsDataUrl,
      placeholder: t("studio.editor.aiChipPlaceholderLayer"),
      onGenerated: (result, prompt) =>
        void handleImageAiGenerated(result, prompt, {
          replaceActiveLayer: true,
          hadTransparentIntent: false,
        }),
    };
  },
  animation: ({ animationState, handleAnimationAiGenerated, t }) => {
    const frame = animationState.frames.find(
      (f) => f.id === animationState.activeFrameId,
    );
    if (!frame?.pixelsDataUrl) return null;
    return {
      kindNoun: "frame",
      label: t("studio.editor.frameLabel", {
        number: animationState.frames.indexOf(frame) + 1,
      }),
      dataUrl: frame.pixelsDataUrl,
      placeholder: t("studio.editor.aiChipPlaceholderFrame"),
      onGenerated: (result) => void handleAnimationAiGenerated(result),
    };
  },
  game: ({ gameState, selectedSpriteId, activeLevelId, setGameState, zoom, t }) => {
    if (!gameState || !selectedSpriteId) return undefined;
    const level = gameState.levels.find((l) => l.id === activeLevelId);
    const sprite = level?.sprites.find((s) => s.id === selectedSpriteId);
    const asset = sprite
      ? gameState.assets.find((a) => a.id === sprite.assetId)
      : null;
    if (!asset?.url || !sprite) return null;
    return {
      kindNoun: "sprite",
      label: t("studio.editor.spriteLabel", { id: sprite.id }),
      url: asset.url,
      placeholder: t("studio.editor.aiChipPlaceholderSprite"),
      bbox: {
        x: sprite.x * zoom,
        y: sprite.y * zoom,
        width: sprite.width * zoom,
        height: sprite.height * zoom,
      },
      // In-place asset URL update — keeps the sprite's id, position,
      // size, behavior, scripts; only the bitmap changes. The chip
      // came from a selected sprite (img→img mode), so "update this
      // sprite" is the intuitive UX vs the right-rail panel's
      // "create a new sprite" path. `addCustomSpriteAsset` is
      // idempotent — re-adding the same id rewrites the URL.
      onGenerated: async (result) => {
        const newUrl = await persistGeneratedImage(result);
        setGameState((prev) =>
          prev ? gameAddCustomSpriteAsset(prev, { id: asset.id, url: newUrl }) : prev,
        );
      },
    };
  },
};

/** Timeline-chrome kinds: the selected image widget's URL. */
function timelineWidgetChipSource({
  usesTimelineChrome,
  selection,
  activeScene,
  canvasSize,
  zoom,
  updateWidgetParams,
  t,
}: ChipSourceCtx): AiChipSource | null {
  if (!usesTimelineChrome || selection.kind !== "widget") return null;
  const { width, height } = canvasSize;
  const widget = activeScene.widgets.find((w) => w.id === selection.widgetId);
  if (!widget || widget.params.kind !== "image") return null;
  const imageParams = widget.params;
  if (imageParams.data.source.kind !== "url") return null;
  const url = imageParams.data.source.url;
  if (!url) return null;
  return {
    kindNoun: "image",
    label: t("studio.editor.selectedImageLabel"),
    url,
    placeholder: t("studio.editor.aiChipPlaceholderImage"),
    // Timeline widgets store fractional position (0..1). Multiply
    // by canvas dims then by zoom to land in the canvas wrapper's
    // pixel coordinate space (the wrapper is sized `width × zoom`).
    bbox: {
      x: widget.position.x * width * zoom,
      y: widget.position.y * height * zoom,
      width: widget.position.width * width * zoom,
      height: widget.position.height * height * zoom,
    },
    onGenerated: async (result) => {
      // Replace the image widget's source URL in place — keeps
      // the widget's position / window / motion / z-index, just
      // swaps the bitmap. Same SoT mutator the inspector uses.
      const newUrl = await persistGeneratedImage(result);
      updateWidgetParams(widget.id, {
        ...imageParams,
        data: {
          ...imageParams.data,
          source: { kind: "url", url: newUrl },
        },
      });
    },
  };
}

export function useAiChipSource({
  mediaKind,
  usesTimelineChrome,
  zoom,
  imageState,
  animationState,
  gameState,
  setGameState,
  activeLevelId,
  selectedSpriteId,
  selection,
  activeScene,
  canvasSize,
  handleImageAiGenerated,
  handleAnimationAiGenerated,
  updateWidgetParams,
}: AiChipSourceInput): AiChipSource | null {
  const { t } = useTranslation();
  const { width, height } = canvasSize;
  return useMemo<AiChipSource | null>(() => {
    const ctx: ChipSourceCtx = {
      mediaKind,
      usesTimelineChrome,
      zoom,
      imageState,
      animationState,
      gameState,
      setGameState,
      activeLevelId,
      selectedSpriteId,
      selection,
      activeScene,
      canvasSize: { width, height },
      handleImageAiGenerated,
      handleAnimationAiGenerated,
      updateWidgetParams,
      t,
    };
    const kindSource = KIND_CHIP_SOURCES[mediaKind]?.(ctx);
    if (kindSource !== undefined) return kindSource;
    return timelineWidgetChipSource(ctx);
  }, [
    mediaKind,
    imageState,
    animationState,
    gameState,
    setGameState,
    selectedSpriteId,
    activeLevelId,
    usesTimelineChrome,
    selection,
    activeScene,
    width,
    height,
    zoom,
    handleImageAiGenerated,
    handleAnimationAiGenerated,
    updateWidgetParams,
    t,
  ]);
}
