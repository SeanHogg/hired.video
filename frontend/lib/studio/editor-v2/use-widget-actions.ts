/**
 * The Timeline canvas's content actions surfaced to the Actions panel, the
 * palette, canvas drops and the AI bridge: add media, place a screenshot,
 * captions / voiceover / composed music, the audio-mix patches, inline text
 * edits and widget delete. Lifted out of StudioEditorV2.
 */
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { persistAudioBlob } from "@/lib/studio/media-persistence";
import type { Selection } from "./editor-types";
import {
  type AudioLayer,
  type CanvasAudioMix,
  type CanvasState,
  type Widget,
  addAudioLayer,
  defaultWidget,
  DEFAULT_AUDIO_MIX,
  makeAudioLayer,
  updateAudioLayer,
} from "./canvas-state";
import { useScreenshotCapture } from "./use-screenshot-capture";

export interface WidgetActionsInput {
  setState: Dispatch<SetStateAction<CanvasState>>;
  activeSceneId: string;
  setSelection: Dispatch<SetStateAction<Selection>>;
  placeWidget: (widget: Widget, atFraction?: { x: number; y: number }) => void;
}

export function useWidgetActions({ setState, activeSceneId, setSelection, placeWidget }: WidgetActionsInput) {
  const { toast } = useToast();
  const { t } = useTranslation();

  // ───── Mutators surfaced to the Actions panel
  const addMediaWidget = useCallback(
    (
      kind: "image" | "video",
      url: string,
      durationSeconds = 0,
      atFraction?: { x: number; y: number },
    ) => {
      const widget = defaultWidget(kind);
      // Stamp the URL into the widget's content params. defaultWidget
      // gives a URL-backed source by default so we just rewrite the URL.
      if (widget.params.kind === "image") {
        widget.params.data.source = { kind: "url", url };
      } else if (widget.params.kind === "video") {
        widget.params.data.source = { kind: "url", url };
      }
      placeWidget(widget, atFraction);
      // Extend the scene duration if the new media exceeds the scene
      // length, so the user actually sees the clip play. Scene-duration
      // extension is media-specific, so it stays here rather than in
      // the shared `placeWidget` helper.
      if (durationSeconds > 0) {
        setState((prev) => ({
          ...prev,
          scenes: prev.scenes.map((s) =>
            s.id === activeSceneId && durationSeconds > s.durationSeconds
              ? { ...s, durationSeconds }
              : s,
          ),
        }));
      }
    },
    [activeSceneId, placeWidget],
  );

  // Single Control for the Screenshot palette tile + canvas screenshot
  // drop. Both surfaces call this; capture / upload lives in exactly
  // one hook (`useScreenshotCapture`) so there's no parallel pipeline.
  const { capture: captureScreenshot } = useScreenshotCapture();
  const placeScreenshot = useCallback(
    async (atFraction?: { x: number; y: number }) => {
      const handle = toast({
        title: t("studio.editor.capturingScreenshot"),
        description: t("studio.editor.capturingScreenshotDesc"),
      });
      const url = await captureScreenshot();
      handle.dismiss();
      if (!url) return;
      addMediaWidget("image", url, 0, atFraction);
    },
    [addMediaWidget, captureScreenshot, toast, t],
  );

  const setCaptionsState = useCallback((captions: CanvasState["captions"]) => {
    setState((prev) => ({ ...prev, captions }));
  }, []);

  const addVoiceoverLayer = useCallback((layer: AudioLayer) => {
    setState((prev) => addAudioLayer(prev, layer));
  }, []);

  // Original-music composer hands us a freshly-rendered WAV. It is hosted
  // first (same audio upload as voiceovers) and only a durable URL becomes a
  // custom music layer — a blob: URL never reaches saved state (#563). On a
  // failed upload nothing is added and `false` comes back: the composer keeps
  // the track in memory and offers Retry / Download / Discard.
  const setMusicFromBlob = useCallback(
    async (blob: Blob, durationSeconds: number, label: string): Promise<boolean> => {
      const result = await persistAudioBlob(blob, label || "music");
      if (!result.ok) {
        toast({
          title: t("studio.unsavedMedia.audioUploadFailedTitle"),
          description: ("message" in result ? result.message : undefined) ?? t("studio.unsavedMedia.uploadFailedDesc"),
          variant: "destructive",
        });
        return false;
      }
      const layer = makeAudioLayer({
        kind: "music",
        source: { kind: "custom", url: result.url },
        label,
        durationSeconds,
      });
      setState((prev) => addAudioLayer(prev, layer));
      toast({ title: t("studio.editor.musicAdded") });
      return true;
    },
    [toast, t],
  );

  // V2-native audio mixer adapters (#645). Patch the canvas-level
  // audioMix slice + per-clip voiceover gain/muted. Defaults merge in
  // here so a freshly-created canvas (audioMix === null) still picks
  // up a usable shape on first touch.
  const patchAudioMix = useCallback(
    (patch: Partial<CanvasAudioMix>) => {
      setState((prev) => ({
        ...prev,
        audioMix: { ...(prev.audioMix ?? DEFAULT_AUDIO_MIX), ...patch },
      }));
    },
    [],
  );
  const patchAudioLayerMix = useCallback(
    (layerId: string, patch: { gain?: number; muted?: boolean }) => {
      setState((prev) => updateAudioLayer(prev, layerId, patch));
    },
    [],
  );

  const updateWidgetText = useCallback(
    (widgetId: string, nextText: string) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) => {
            if (w.id !== widgetId) return w;
            if (w.params.kind !== "text" && w.params.kind !== "heading") return w;
            return {
              ...w,
              params: {
                kind: w.params.kind,
                data: { ...w.params.data, text: nextText },
              },
            };
          }),
        })),
      }));
    },
    [],
  );

  const deleteWidget = useCallback((widgetId: string) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => ({
        ...scene,
        widgets: scene.widgets.filter((w) => w.id !== widgetId),
      })),
    }));
    setSelection((current) =>
      current.kind === "widget" && current.widgetId === widgetId
        ? { kind: "scene", sceneId: activeSceneId }
        : current,
    );
  }, [activeSceneId]);

  return {
    addMediaWidget,
    placeScreenshot,
    setCaptionsState,
    addVoiceoverLayer,
    setMusicFromBlob,
    patchAudioMix,
    patchAudioLayerMix,
    updateWidgetText,
    deleteWidget,
  };
}

export type WidgetActions = ReturnType<typeof useWidgetActions>;
