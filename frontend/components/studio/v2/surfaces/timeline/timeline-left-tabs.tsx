/**
 * A time-based format's left tabs: Scenes, Widgets (Widgets | Actions) and
 * Media, all authoring the Timeline runtime's CanvasState.
 */
import { Clapperboard, Image as ImageIcon, Shapes } from "lucide-react";
import ScenesRail from "@/components/studio/v2/ScenesRail";
import WidgetPalette from "@/components/studio/v2/WidgetPalette";
import ActionsPanel from "@/components/studio/v2/ActionsPanel";
import SegmentToggle from "@/components/studio/v2/focus/SegmentToggle";
import type { WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import type { LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";
import type { FocusLeftTab, WidgetsMode } from "@/lib/studio/use-focus-left-panel";
import type { TimelineSurfaceCtx } from "../types";
import { dropBackgroundPreset } from "./background-preset-drop";

export function timelineLeftTabs(ctx: TimelineSurfaceCtx): FocusLeftTab[] {
  const { t, leftPanel, mediaKind: currentMediaKind } = ctx;
  const {
    state,
    selectScene,
    loadCanvas,
    activeSceneId,
    selection,
    playback,
    mutators,
    widgetActions,
    commands,
    persistedProject,
    persistedProjectId,
  } = ctx.timeline;
  const {
    activeScene,
    addScene,
    deleteScene,
    duplicateScene,
    reorderScenes,
    insertWidget,
    insertLinkedContent,
    insertEngagementAsset,
  } = mutators;
  const {
    addMediaWidget,
    placeScreenshot,
    addVoiceoverLayer,
    setCaptionsState,
    setMusicFromBlob,
    updateWidgetText,
    patchAudioMix,
    patchAudioLayerMix,
  } = widgetActions;
  const { openAction, handleOpenActionChange, recordAsScene, addRecordingScene } = commands;

  const paletteProps = {
    onInsert: (kind: WidgetKind) => insertWidget(kind),
    onInsertLinkedContent: (entityKind: LinkedContentKind, entityId: string) =>
      insertLinkedContent(entityKind, entityId),
    onCaptureScreenshot: () => placeScreenshot(),
    onAddImageWidget: (url: string) => addMediaWidget("image", url),
    onAddVideoWidget: (url: string, durationSeconds: number) => addMediaWidget("video", url, durationSeconds),
    onAddVoiceover: addVoiceoverLayer,
    activeSceneId,
    mediaKind: currentMediaKind,
  };
  return [
    {
      id: "scenes",
      label: t("studio.editor.panelScenes"),
      icon: Clapperboard,
      content: (
        <ScenesRail
          scenes={state.scenes}
          activeSceneId={activeSceneId}
          onSelect={selectScene}
          onAdd={addScene}
          onDelete={deleteScene}
          onDuplicate={duplicateScene}
          onReorder={reorderScenes}
          // #589 — drop a background preset onto a scene tile to re-skin
          // THAT scene (same BG_PRESETS → scenePatchFromBgPreset seam).
          onBackgroundDrop={
            playback.isPlaying
              ? undefined
              : (sceneId, bgValue) => dropBackgroundPreset(ctx, sceneId, bgValue)
          }
        />
      ),
    },
    {
      id: "widgets",
      label: t("studio.editorV2.tabWidgets"),
      icon: Shapes,
      content: (
        <>
          <div className="shrink-0 border-b border-border p-2">
            <SegmentToggle<WidgetsMode>
              ariaLabel={t("studio.focus.widgetsMode")}
              value={leftPanel.widgetsMode}
              onChange={leftPanel.setWidgetsMode}
              options={[
                { id: "widgets", label: t("studio.editorV2.tabWidgets") },
                { id: "actions", label: t("studio.editorV2.tabActions") },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {leftPanel.widgetsMode === "widgets" ? (
              <WidgetPalette {...paletteProps} section="widgets" />
            ) : (
              <ActionsPanel
                mediaKind={currentMediaKind}
                openAction={openAction}
                onOpenActionChange={handleOpenActionChange}
                recordAsScene={recordAsScene}
                onAddRecordingScene={addRecordingScene}
                currentTimeSec={playback.playhead}
                state={state}
                activeScene={activeScene}
                selectedWidget={
                  selection.kind === "widget"
                    ? activeScene.widgets.find((w) => w.id === selection.widgetId) ?? null
                    : null
                }
                persistedProjectId={persistedProjectId}
                videoId={persistedProject?.youtubeVideoId ?? persistedProject?.id ?? null}
                onInsertWidget={insertWidget}
                onCaptureScreenshot={() => placeScreenshot()}
                onAddVideoWidget={paletteProps.onAddVideoWidget}
                onAddImageWidget={paletteProps.onAddImageWidget}
                onAddVoiceover={addVoiceoverLayer}
                onSetCaptions={setCaptionsState}
                onSetMusicFromBlob={setMusicFromBlob}
                onUpdateWidgetText={updateWidgetText}
                // Reset history so undo can't go below the restored version;
                // land on its first scene, keeping the selection.
                onRestoreCanvas={(next) => loadCanvas(next, { keepSelection: true })}
                onPatchAudioMix={patchAudioMix}
                onPatchVoiceover={patchAudioLayerMix}
                onInsertEngagementAsset={insertEngagementAsset}
              />
            )}
          </div>
        </>
      ),
    },
    {
      id: "media",
      label: t("studio.focus.media"),
      icon: ImageIcon,
      content: (
        <div className="min-h-0 flex-1 overflow-hidden">
          <WidgetPalette {...paletteProps} section="media" />
        </div>
      ),
    },
  ];
}
