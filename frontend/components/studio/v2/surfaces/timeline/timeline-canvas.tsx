/**
 * The Timeline runtime's canvas surface: ONE `<CanvasStage>` for both edit
 * and playback, with every palette / theme / media drop wired to the
 * Timeline mutators.
 */
import CanvasStage from "@/components/studio/v2/CanvasStage";
import { VISUAL_THEMES } from "@/lib/studio/visual-themes";
import { applyThemeToState } from "@/lib/studio/editor-v2/canvas-state";
import type { TimelineSurfaceCtx } from "../types";
import { dropBackgroundPreset } from "./background-preset-drop";

export function timelineCanvas(ctx: TimelineSurfaceCtx) {
  const { t, toast, zoom, aiChipNode } = ctx;
  const { state, setState, selection, setSelection, playback, mutators, widgetActions, audio, persistedProjectId } =
    ctx.timeline;
  const { activeScene, insertWidget, updateWidgetPosition, insertLinkedContent, insertEngagementAsset } = mutators;
  const { addMediaWidget, placeScreenshot } = widgetActions;
  const { handleMusicDrop } = audio;
  return (
    <div className="relative">
      {/* ONE renderer for both edit + playback: `<CanvasStage>`
          in `mode="edit"` honours selection/drag/resize chrome,
          in `mode="playback"` it filters widgets by the current
          playhead's visibility window and suppresses every edit
          affordance. Same DOM widgets, same text wrap, same
          linked-content fidelity — no DOM-vs-canvas-2D divergence
          between authoring and play. The canvas-2D
          `renderTimelineFrame` survives only as the export
          encoder for headless WebM output (#840 unification). */}
      <CanvasStage
        scene={
          playback.isPlaying
            ? state.scenes.find((s) => s.id === playback.activeSceneIdAtPlayhead) ?? activeScene
            : activeScene
        }
        canvasWidth={state.width}
        canvasHeight={state.height}
        zoom={zoom}
        mode={playback.isPlaying ? "playback" : "edit"}
        currentTimeSec={
          playback.isPlaying ? playback.activeSceneElapsed : undefined
        }
        selection={
          playback.isPlaying
            ? {
                kind: "scene",
                sceneId:
                  playback.activeSceneIdAtPlayhead ?? activeScene.id,
              }
            : selection
        }
        onSelect={playback.isPlaying ? undefined : setSelection}
        onWidgetDrop={
          playback.isPlaying
            ? undefined
            : (kind, at) => insertWidget(kind, at)
        }
        onWidgetMove={
          playback.isPlaying ? undefined : updateWidgetPosition
        }
        onThemeDrop={
          playback.isPlaying
            ? undefined
            : (themeId) => {
                const theme = VISUAL_THEMES.find((t) => t.id === themeId);
                if (!theme) return;
                setState((prev) => applyThemeToState(prev, theme));
                toast({ title: t("studio.editor.themeToast", { label: theme.label }) });
              }
        }
        onBackgroundDrop={
          playback.isPlaying
            ? undefined
            : (bgValue) => dropBackgroundPreset(ctx, activeScene.id, bgValue)
        }
        onMediaDrop={
          playback.isPlaying
            ? undefined
            : (url, mediaType, atFraction) => {
                if (mediaType === "video") {
                  addMediaWidget("video", url, 0, atFraction);
                } else {
                  addMediaWidget("image", url, 0, atFraction);
                }
              }
        }
        onLinkedContentDrop={
          playback.isPlaying
            ? undefined
            : (entityKind, entityId, atFraction) =>
                insertLinkedContent(entityKind, entityId, atFraction)
        }
        onEngagementAssetDrop={
          playback.isPlaying
            ? undefined
            : (assetKind, assetId, atFraction) =>
                insertEngagementAsset(assetKind, assetId, atFraction)
        }
        onScreenshotDrop={
          playback.isPlaying
            ? undefined
            : (atFraction) => placeScreenshot(atFraction)
        }
        onMusicDrop={playback.isPlaying ? undefined : handleMusicDrop}
        defaultFontId={state.fontFamily}
        projectId={persistedProjectId}
      />
      {aiChipNode}
    </div>
  );
}
