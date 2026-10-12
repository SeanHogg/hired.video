/**
 * The inspector's canvas-wide setters (theme, background, music, format,
 * codec, motion, transition, font, palette) for a CanvasState — the
 * `CanvasSectionCallbacks` PropertiesPanel takes. Music picks APPEND a layer
 * (multi-track audio); "None" clears every music layer.
 */
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { scenePatchFromBgPreset, type BgPreset, type VisualTheme } from "@/lib/studio/visual-themes";
import type { MusicTrack } from "@/lib/studio/music-catalog";
import type { VideoFormat } from "@/lib/studio/video-formats";
import type { CodecPreset } from "@/lib/studio/codec-presets";
import type { MotionPreset, TransitionPreset } from "@/lib/studio/motion-presets";
import type { FontPreset } from "@/lib/studio/font-catalog";
import {
  type CanvasState,
  type ColorPalette,
  type Scene,
  addAudioLayer,
  applyThemeToState,
  makeAudioLayer,
} from "./canvas-state";

/** Mutators surfaced to the inspector's canvas-level (project-wide) section
 *  renderers. */
export interface CanvasSectionCallbacks {
  onSelectTheme: (theme: VisualTheme) => void;
  onSelectBackground: (preset: BgPreset) => void;
  onSelectMusic: (track: MusicTrack) => void;
  onSelectFormat: (format: VideoFormat) => void;
  onSelectCodec: (preset: CodecPreset) => void;
  onSelectMotion: (preset: MotionPreset) => void;
  onSelectTransition: (preset: TransitionPreset) => void;
  onSelectFont: (preset: FontPreset) => void;
  onChangePalette: (palette: ColorPalette) => void;
}

export interface CanvasSectionCallbacksInput {
  setState: Dispatch<SetStateAction<CanvasState>>;
  activeSceneId: string;
  updateScene: (sceneId: string, patch: Partial<Scene>) => void;
  /** Selects the music layer a pick just added. */
  onMusicLayerAdded: (layerId: string) => void;
}

export function useCanvasSectionCallbacks({
  setState,
  activeSceneId,
  updateScene,
  onMusicLayerAdded,
}: CanvasSectionCallbacksInput): CanvasSectionCallbacks {
  const { t } = useTranslation();
  const { toast } = useToast();
  return useMemo<CanvasSectionCallbacks>(
    () => ({
      onSelectTheme: (theme) => setState((prev) => applyThemeToState(prev, theme)),
      onSelectBackground: (preset) => updateScene(activeSceneId, scenePatchFromBgPreset(preset)),
      onSelectMusic: (track) => {
        if (track.id === "none") {
          setState((prev) => ({
            ...prev,
            audioLayers: prev.audioLayers.filter((l) => l.kind !== "music"),
          }));
          toast({ title: t("studio.editor.musicRemoved") });
          return;
        }
        const layer = makeAudioLayer({
          kind: "music",
          source: { kind: "stock", trackId: track.id },
          label: track.label,
          durationSeconds: track.durationSeconds,
        });
        setState((prev) => addAudioLayer(prev, layer));
        onMusicLayerAdded(layer.id);
        toast({ title: t("studio.editor.musicToast", { label: track.label }) });
      },
      onSelectFormat: (format) => {
        // Widgets are fractional (0..1) positions, so they survive a
        // resolution change without re-mapping.
        setState((prev) => ({ ...prev, width: format.width, height: format.height }));
        toast({
          title: t("studio.editor.formatToast", { label: format.label }),
          description: `${format.width} × ${format.height}`,
        });
      },
      onSelectCodec: (preset) => {
        setState((prev) => ({ ...prev, codec: preset.id }));
        toast({ title: t("studio.editorV2.codecToast", { label: t(preset.labelKey) }) });
      },
      onSelectMotion: (preset) => setState((prev) => ({ ...prev, motion: preset.id })),
      onSelectTransition: (preset) => setState((prev) => ({ ...prev, defaultTransition: preset.id })),
      onSelectFont: (preset) => setState((prev) => ({ ...prev, fontFamily: preset.id })),
      onChangePalette: (palette) => setState((prev) => ({ ...prev, colorPalette: palette })),
    }),
    [setState, activeSceneId, updateScene, onMusicLayerAdded, toast, t],
  );
}
