/**
 * The time-based formats' surface (video, podcast, voice, comic, … — every
 * kind that authors on the Timeline runtime's CanvasState): Scenes /
 * Widgets / Media tabs, Design + Layers rail tools, the PropertiesPanel
 * inspector, the preview overlay and the timeline strip.
 */
import CanvasDesignPanel from "@/components/studio/v2/CanvasDesignPanel";
import LayersPanel from "@/components/studio/v2/LayersPanel";
import PropertiesPanel, { inspectorSelectionTitle } from "@/components/studio/v2/PropertiesPanel";
import { slotHeader } from "@/components/workspace/inspector/InspectorBody";
import StudioTimelineStrip from "@/components/workspace/studio/StudioTimelineStrip";
import type { StudioFormatSurface, TimelineSurfaceCtx } from "../types";
import { sceneImageGenerator } from "../shared";
import { timelineLeftTabs } from "./timeline-left-tabs";

export const timelineSurface: StudioFormatSurface<TimelineSurfaceCtx> = {
  leftTabs: timelineLeftTabs,
  aiGenerator: sceneImageGenerator,
  hostTools: (ctx) => {
    const { t } = ctx;
    const { state, selection, setSelection, mutators, canvasSectionCallbacks } = ctx.timeline;
    const { activeScene, reorderLayers } = mutators;
    return {
      // The canvas-wide look (format, theme, palette, fonts) is a time-based
      // format's Design tool at every depth.
      design: {
        label: t("workspace.tool.design"),
        content: <CanvasDesignPanel state={state} scene={activeScene} callbacks={canvasSectionCallbacks} />,
      },
      layers: {
        label: t("workspace.tool.layers"),
        content: (
          <LayersPanel
            scene={activeScene}
            selectedWidgetId={selection.kind === "widget" ? selection.widgetId : null}
            onSelectWidget={(widgetId) => setSelection({ kind: "widget", sceneId: activeScene.id, widgetId })}
            onReorderLayers={(widgetIds) => reorderLayers(activeScene.id, widgetIds)}
          />
        ),
      },
    };
  },
  inspector: (ctx) => {
    const { state, selection, mutators, widgetActions, canvasSectionCallbacks, inspectorDrill } = ctx.timeline;
    const { updateScene, deleteScene, duplicateScene, updateWidgetPosition, updateWidgetParams, updateWidget } = mutators;
    return {
      // An open section: ‹ back in the slot header, the selection's name
      // ("Who I am") as the kicker over the section's title ("Background").
      ...slotHeader({
        kicker: ctx.t("workspace.slot.inspector"),
        title: inspectorDrill.labelKey
          ? (inspectorSelectionTitle(state, selection, ctx.t) ?? ctx.t("studio.editorV2.panelProperties"))
          : ctx.t("studio.editorV2.panelProperties"),
        drillTitle: inspectorDrill.labelKey ? ctx.t(inspectorDrill.labelKey) : null,
        onBack: inspectorDrill.back,
      }),
      content: (
        <PropertiesPanel
          drill={inspectorDrill}
          depth={ctx.depth.depth}
          state={state}
          selection={selection}
          onUpdateScene={updateScene}
          onDeleteScene={deleteScene}
          onDuplicateScene={duplicateScene}
          onUpdateWidgetPosition={updateWidgetPosition}
          onUpdateWidgetParams={updateWidgetParams}
          onUpdateWidget={updateWidget}
          onDeleteWidget={widgetActions.deleteWidget}
          {...canvasSectionCallbacks}
        />
      ),
    };
  },
  preview: (ctx) => ({ label: ctx.t("actions.preview"), onClick: () => ctx.dialogs.setPreviewOpen(true) }),
  strip: (ctx) => {
    const { state, playback, activeSceneId, setActiveSceneId, selection, setSelection, selectScene, mutators, audio } =
      ctx.timeline;
    const { updateScene, updateWidgetWindow } = mutators;
    const {
      selectedAudioLayerId,
      setSelectedAudioLayerId,
      handleAudioLayerChange,
      handleAudioCommit,
      handleSplitAudioLayer,
      handleRemoveAudioLayer,
      handleMusicDrop,
    } = audio;
    return (
      <StudioTimelineStrip
        state={state}
        advanced={ctx.depth.advanced}
        playback={playback}
        activeSceneId={activeSceneId}
        selection={selection}
        onSelectScene={selectScene}
        onSelectWidget={(sceneId, widgetId) => {
          setActiveSceneId(sceneId);
          setSelection({ kind: "widget", sceneId, widgetId });
        }}
        onSceneDurationChange={(sceneId, durationSeconds) => updateScene(sceneId, { durationSeconds })}
        onWidgetWindowChange={updateWidgetWindow}
        selectedAudioLayerId={selectedAudioLayerId}
        onSelectAudioLayer={setSelectedAudioLayerId}
        onAudioLayerChange={handleAudioLayerChange}
        onAudioCommit={handleAudioCommit}
        onSplitAudioLayer={handleSplitAudioLayer}
        onRemoveAudioLayer={handleRemoveAudioLayer}
        onMusicDrop={handleMusicDrop}
      />
    );
  },
};
