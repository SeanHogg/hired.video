/**
 * eslint-page-chrome: skip — full-screen editor surface; the marketing
 * chrome (AppShell / useSEO / useBreadcrumbs) the rule enforces does not
 * apply to the Studio editor. (Opt-out surfaced once #1868 un-hid the rule.)
 *
 * A studio format (video, podcast, voice, animation, comic, image, game,
 * CAD, document) at `/studio/:id`, inside THE workspace frame
 * (components/workspace — the same frame a career kit uses):
 *   ┌ header: ← · title · Saved · Undo · Redo · Preview · Simple|Advanced · ⋯ · Post ┐
 *   ├──────────────┬──────────────────────────────────────┬───────────┤
 *   │ rail (450px) │  canvas stage (zoom)                 │ right slot│
 *   │ Chat · Design│                                      │ inspector │
 *   │ · Sections · │──────────────────────────────────────│ / Post    │
 *   │ Media (+Adv.)│  strip (150px): the timeline         │ (✕)       │
 *   └──────────────┴──────────────────────────────────────┴───────────┘
 * StudioWorkspace (the route) decides kit vs format; this renders a format.
 *
 * This is the orchestrator: each concern lives in its own module —
 * runtimes + hydration + readiness, project load / save / autosave / collab,
 * anon adoption, export, commands (lib/studio/editor-v2/use-*), the per-kind
 * rules (lib/studio/editor-v2/format-runtime), and each format's rail tabs,
 * inspector, Preview, strip and canvas (components/studio/v2/surfaces, keyed
 * by the format's runtime).
 *
 * Persistence: the editor holds CanvasState in memory, autosaves to
 * localStorage on every change (scoped to the project id), and pushes
 * Timeline JSON to the server via studioService.saveDraft on a debounced
 * cadence. The server stores `timelineSpec`; the round-trip back is via
 * timelineToCanvasState() so a project saved here re-opens identically.
 *
 * Authorization: this surface is rendered inside the same auth wrapper
 * as the classic editor. Mutations route through the existing studio
 * routes — server enforces canActFor.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useRemoveBrandingFlag } from "@/lib/studio/use-remove-branding-flag";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { StudioProject } from "@/lib/services/studio-service";
import StudioLoadingShell from "../StudioLoadingShell";
import { AnonGateContext } from "@/lib/studio/anon-gate-context";
import { mediaKindUsesCanvasStateAuthoring, type MediaKind, mediaKindIsPrimaryVideo } from "@shared/media-kinds";
import { useWorkspaceDepth } from "@/lib/workspace/use-workspace-depth";
import { useIsWideWorkspace } from "@/hooks/use-media-query";
import WorkspaceFrame from "@/components/workspace/WorkspaceFrame";
import WorkspaceLeftPanel from "@/components/workspace/WorkspaceLeftPanel";
import RightSlot from "@/components/workspace/RightSlot";
import StudioHeader from "@/components/workspace/studio/StudioHeader";
import { useFollowPlayhead, usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import { usePublications } from "@/lib/studio/editor-v2/use-publications";
import { useTimelineCanvas } from "@/lib/studio/editor-v2/use-timeline-canvas";
import { useStudioRuntimes } from "@/lib/studio/editor-v2/use-studio-runtimes";
import { useGameHydration, useRuntimeHydration } from "@/lib/studio/editor-v2/use-runtime-hydration";
import { useDocumentEntity } from "@/lib/studio/editor-v2/use-document-entity";
import { useSceneMutators } from "@/lib/studio/editor-v2/use-scene-mutators";
import { useAudioLayers } from "@/lib/studio/editor-v2/use-audio-layers";
import { useAiChipSource } from "@/lib/studio/editor-v2/use-ai-chip-source";
import { useCanvasSectionCallbacks } from "@/lib/studio/editor-v2/use-canvas-section-callbacks";
import { useEditorEntry, useKindDefaultsOnLoad } from "@/lib/studio/editor-v2/use-editor-entry";
import { editorReadiness } from "@/lib/studio/editor-v2/editor-readiness";
import { useLocalDraftAutosave } from "@/lib/studio/editor-v2/use-local-draft";
import { useProjectRecord, useStudioProjectLifecycle } from "@/lib/studio/editor-v2/use-studio-project-lifecycle";
import { useAnonAdoption, useClaimOnReturn } from "@/lib/studio/editor-v2/use-anon-adoption";
import { useStudioSave } from "@/lib/studio/editor-v2/use-studio-save";
import { useStudioCollabAutosave } from "@/lib/studio/editor-v2/use-studio-collab-autosave";
import { useStageZoom } from "@/lib/studio/editor-v2/use-stage-zoom";
import { useWidgetActions } from "@/lib/studio/editor-v2/use-widget-actions";
import { useEditorCommands } from "@/lib/studio/editor-v2/use-editor-commands";
import { useStudioExport } from "@/lib/studio/editor-v2/use-studio-export";
import { useRenderOnLoad } from "@/lib/studio/editor-v2/use-render-on-load";
import { printDocument } from "@/components/studio/document/print-document";
import { useStudioDialogs } from "@/lib/studio/editor-v2/use-studio-dialogs";
import { useStudioRail } from "@/lib/studio/editor-v2/use-studio-rail";
import { useStudioRightSlot } from "@/lib/studio/editor-v2/use-studio-right-slot";
import {
  formatRuntimeFor,
  runtimeKeyFor,
  studioStateSnapshot,
  studioStateWriters,
} from "@/lib/studio/editor-v2/format-runtime";
import { studioSlotPanels } from "@/components/studio/v2/editor/studio-slot-panels";
import { composeStudioRail } from "@/components/studio/v2/editor/studio-rail-tools";
import { StudioEditorBanner, StudioSignInWall } from "@/components/studio/v2/editor/StudioEditorBanner";
import StudioCanvasStage from "@/components/studio/v2/editor/StudioCanvasStage";
import StudioEditorDialogs from "@/components/studio/v2/editor/StudioEditorDialogs";
import { studioHeaderProps } from "@/components/studio/v2/editor/studio-header-props";
import { composeStudioFormat } from "@/components/studio/v2/surfaces/registry";
import { aiSelectionChip } from "@/components/studio/v2/surfaces/shared";
import { usePublishHandlers } from "@/lib/studio/use-publish-handlers";
import { renderPublishToastAction } from "@/components/studio/share/publish-toast-action";
import { useStudioEntryParams } from "@/lib/studio/use-studio-entry-params";
import { useSectionDrill } from "@/components/workspace/inspector/use-section-drill";

export interface StudioEditorV2Props {
  /** The project the route already loaded (StudioWorkspace reads it to tell
   *  a kit from a format) — used instead of fetching it again. */
  loadedProject?: StudioProject | null;
}

export default function StudioEditorV2({ loadedProject = null }: StudioEditorV2Props = {}) {
  const { id: routeId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  // Branding-policy inputs — `shouldShowBranding()` is the single seam every
  // surface reads; the export passes the resolved flag into `renderTimeline()`
  // so the MP4 carries the SAME pill the editor + /m/<id> show.
  const subscription = useSubscription();
  const { removeBranding } = useRemoveBrandingFlag();

  const projectId = routeId ?? "new";
  // URL entry signals (template seed, creator template, subject, capture)
  // and the mount-time kind defaults they imply — read once on mount.
  const { templateHint, studioTemplateSlug, urlSubject, urlCapture, mountTimeTemplateKind, mountTimeDefaults } =
    useEditorEntry(searchParams);

  // The Timeline runtime's canvas (CanvasState history + the active scene /
  // selection restored with it on undo/redo, #592).
  const timelineCanvas = useTimelineCanvas(projectId, templateHint);
  const { history, activeSceneId, setActiveSceneId, selection, setSelection, selectScene, loadCanvas } = timelineCanvas;
  const { state, setState, undo, redo, canUndo, canRedo, commit: commitHistory } = history;
  const record = useProjectRecord(projectId, t("studio.editor.untitledVideo"));
  const { title, setTitle, persistedProjectId, persistedProject, missingProject } = record;
  // Live kind — the server's `mediaKind` once loaded, else the mount-time one.
  const currentMediaKind: MediaKind = persistedProject?.mediaKind ?? mountTimeTemplateKind;
  // Single gate for every Timeline-runtime chrome surface (#936): game /
  // image / animation / CAD / document self-host their canvases and UIs.
  const usesTimelineChrome = mediaKindUsesCanvasStateAuthoring(currentMediaKind);
  const runtimes = useStudioRuntimes();
  const { image, document: documentRuntime, game } = runtimes;

  const [saving, setSaving] = useState(false);
  // Simple | Advanced — the workspace depth (one frame; Advanced appends).
  // Formats open in Advanced until the viewer picks.
  const depth = useWorkspaceDepth("advanced");
  const wide = useIsWideWorkspace();
  // Game Playtest toggle — `<GameStage mode>` "edit" ↔ "play".
  const [gamePlaying, setGamePlaying] = useState(false);
  const dialogs = useStudioDialogs();
  // Entry deep link (?share=1) — read once on mount.
  const entry = useStudioEntryParams();
  // `?capture=` deep-links + audio-only template seeds land on the Actions
  // tab (`deriveKindDefaults`, #651 + #894).
  const rail = useStudioRail(
    depth,
    mountTimeDefaults.leftTab,
    !!(mountTimeDefaults.advancedTimelineOpen || mountTimeDefaults.defaultAction),
  );
  const { leftPanel, showLeftWidgets } = rail;
  const playback = usePreviewPlayback(state);
  // "Where has this project been published" (#1920) — refreshed after each publish.
  const { publications, refresh: refreshPublications } = usePublications(persistedProjectId);
  // Post panel (SharePanel) — `?share=1` opens it on load.
  const [shareOpen, setShareOpen] = useState(entry.shareOnLoad);

  // Kind-aware defaults once the server's `mediaKind` is known.
  useKindDefaultsOnLoad({
    persistedProject, mountTimeTemplateKind, urlCapture, setWidgetsMode: leftPanel.setWidgetsMode, showLeftWidgets,
    raiseDepth: depth.raise,
  });
  useRuntimeHydration({ currentMediaKind, persistedProject, templateHint, projectId, runtimes });
  useDocumentEntity(currentMediaKind, documentRuntime);
  useGameHydration(currentMediaKind, persistedProject, game);

  // Server load (incl. the kit redirect), `?studioTemplate=`, URL follow on save.
  const { followSavedProject } = useStudioProjectLifecycle({
    projectId, loadedProject, studioTemplateSlug, record, loadCanvas, loadScript: timelineCanvas.loadScript,
  });

  // Anonymous adoption (#2212): the action gate + claim-on-return.
  const { isAnonVisitor, gateAction, anonGateValue, gateSheet } = useAnonAdoption({
    user, authLoading, projectId, currentMediaKind, persistedProjectId, searchParams,
  });
  // The live state of every runtime — the plain-data slice save / export /
  // collab / header read (format-runtime).
  const snapshot = studioStateSnapshot(state, runtimes);
  const formatRuntime = formatRuntimeFor(currentMediaKind);
  const handleSave = useStudioSave({
    projectId, currentMediaKind, snapshot, record, urlSubject, gateAction, followSavedProject, setSaving,
    writeBack: { setImageState: image.setImageState, setDocumentState: documentRuntime.setDocumentState },
  });
  useClaimOnReturn({
    user, searchParams, projectId, persistedProjectId, currentMediaKind,
    documentStateHydrated: documentRuntime.documentStateHydrated, handleSave,
  });
  useLocalDraftAutosave({
    projectId, title, state, imageState: image.imageState, documentState: documentRuntime.documentState,
    currentMediaKind, isAnonVisitor,
  });

  // Readiness gates (format-runtime): server autosave + the project-ready render gate.
  const { serverAutosaveReady, projectReady } = editorReadiness({
    formatRuntime, runtimes, projectId, persistedProject, missingProject,
  });
  const { studioRoom, autosaveStatus } = useStudioCollabAutosave({
    user, authLoading, projectId, persistedProjectId, currentMediaKind, title, setTitle, snapshot, serverAutosaveReady,
    saving, writers: studioStateWriters(setState, runtimes), saveSilently: (opts) => handleSave({ ...opts, silent: true }),
  });

  useFollowPlayhead(playback, activeSceneId, setActiveSceneId);
  const { zoom, setZoom, stageContainerRef, fitZoom } = useStageZoom(state.width, state.height);

  // ───── Mutators (single source of truth — every consumer goes through here)
  const mutators = useSceneMutators({ state, setState, activeSceneId, setActiveSceneId, setSelection });
  const { activeScene, updateScene } = mutators;
  // Audio timeline — the multi-track model.
  const audio = useAudioLayers(setState, commitHistory);
  // The inspector's canvas-wide setters (theme, music, format, …).
  const canvasSectionCallbacks = useCanvasSectionCallbacks({
    setState,
    activeSceneId: activeScene.id,
    updateScene,
    onMusicLayerAdded: audio.setSelectedAudioLayerId,
  });
  const widgetActions = useWidgetActions({ setState, activeSceneId, setSelection, placeWidget: mutators.placeWidget });
  // The inspector section open in place (its ‹ back is in the slot header).
  const inspectorDrill = useSectionDrill(selection.kind === "widget" ? selection.widgetId : selection.sceneId, depth.advanced);

  // The floating AI selection chip's source (null hides the chip).
  const { animation } = runtimes;
  const aiChipSource = useAiChipSource({
    mediaKind: currentMediaKind, usesTimelineChrome, zoom, selection, activeScene,
    imageState: image.imageState, handleImageAiGenerated: image.handleImageAiGenerated,
    animationState: animation.animationState, handleAnimationAiGenerated: animation.handleAnimationAiGenerated,
    gameState: game.gameState, setGameState: game.setGameState, activeLevelId: game.activeLevelId,
    selectedSpriteId: game.selectedSpriteId, canvasSize: { width: state.width, height: state.height },
    updateWidgetParams: mutators.updateWidgetParams,
  });

  // Clipboard, recorder seams, the AI CHRO bridge and keyboard shortcuts.
  const commands = useEditorCommands({
    state, setState, stateRef: timelineCanvas.stateRef, activeSceneIdRef: timelineCanvas.activeSceneIdRef,
    activeSceneId, setActiveSceneId, selection, setSelection, selectScene, persistedProjectId, currentMediaKind,
    mutators, widgetActions, showLeftWidgets, undo, redo, defaultAction: mountTimeDefaults.defaultAction ?? null,
  });

  const { exporting, handleExport, ensureRendered, variantSource } = useStudioExport({
    projectId, currentMediaKind, snapshot, imageCanvas: image.imageCanvas, record, isPro: subscription.isPro,
    removeBranding, gateAction, handleSave, followSavedProject, printDocument,
  });
  // `?render=1` (Chrome extension "Render & post"): render the loaded video once.
  useRenderOnLoad({
    enabled: entry.renderOnLoad && mediaKindIsPrimaryVideo(currentMediaKind),
    ready: projectReady && !!persistedProjectId && state.scenes.length > 0,
    ensureRendered,
  });

  // Publish handlers (YouTube / Profile / social networks) — ONE implementation
  // shared by the Save menu and the Post panel (lib/studio/use-publish-handlers).
  const publisher = usePublishHandlers({
    title, persistedProject, setPersistedProject: record.setPersistedProject, ensureRendered,
    handleSave: () => handleSave(), gateAction, refreshPublications, openPostPanel: () => setShareOpen(true),
    renderToastAction: renderPublishToastAction, variantSource,
  });

  const { slot, toolSheetOpen, setToolSheetOpen } = useStudioRightSlot({
    currentMediaKind, hasInspector: formatRuntime.hasInspector(runtimes), wide, shareOpen, setShareOpen,
  });

  if (authLoading) return <StudioLoadingShell />;
  // Anon adoption (#2212): a signed-out visitor may BUILD on a fresh `"new"`
  // draft (Save / Publish / Export are gated); an existing project needs sign-in.
  if (!user && projectId !== "new") return <StudioSignInWall />;
  if (!projectReady) return <StudioLoadingShell />;

  // ───── The format's surface (registry keyed by its runtime) and the rail:
  // each format's tabs land in a registry slot; Advanced's tools are appended.
  const format = composeStudioFormat(
    runtimeKeyFor(currentMediaKind),
    {
      t, toast, navigate, mediaKind: currentMediaKind, routeProjectId: projectId, zoom, depth, leftPanel, dialogs,
      aiChipNode: aiSelectionChip(aiChipSource),
      canvasHistory: { undo, redo, canUndo, canRedo },
      addMediaWidget: widgetActions.addMediaWidget,
    },
    {
      runtimes, gamePlaying, setGamePlaying,
      // Plain data, assembled only for the Timeline family.
      timeline: () => ({
        state, setState, selectScene, loadCanvas, history: { undo, redo, canUndo, canRedo }, activeSceneId,
        setActiveSceneId, selection, setSelection, playback, mutators, audio, widgetActions, commands,
        canvasSectionCallbacks, persistedProject, persistedProjectId, inspectorDrill,
      }),
    },
  );
  const { studioTools, activeTool, selectTool } = composeStudioRail(
    t, rail, depth.depth, formatRuntime.family, format.leftTabs, format.hostTools,
  );

  return (
    <AnonGateContext.Provider value={anonGateValue}>
      <WorkspaceFrame
        label={t("workspace.studio.label")}
        header={
          <StudioHeader
            {...studioHeaderProps({
              t,
              currentMediaKind,
              record,
              autosaveStatus,
              collab: { connected: studioRoom.connected, peers: studioRoom.peers },
              history: format.history,
              preview: format.preview,
              depth,
              publications,
              refreshPublications,
              snapshot,
              imageLibrary: image,
              saving,
              handleSave,
              exporting,
              handleExport,
              publisher,
              dialogs,
              shareOpen,
              setShareOpen,
            })}
          />
        }
        banner={
          <StudioEditorBanner
            gateSheet={gateSheet}
            missingProject={missingProject}
            subject={urlSubject}
            canvasEmpty={state.scenes.every((s) => s.widgets.length === 0)}
            onSeed={timelineCanvas.loadScript}
          />
        }
        rail={
          <WorkspaceLeftPanel
            tools={studioTools}
            active={activeTool}
            onChange={selectTool}
            sheetOpen={toolSheetOpen}
            onSheetOpenChange={setToolSheetOpen}
            idPrefix="studio"
          />
        }
        canvas={
          <StudioCanvasStage
            containerRef={stageContainerRef}
            onStageClick={slot.openInspector}
            mediaKind={currentMediaKind}
            state={state}
            onRecordVoiceover={() => showLeftWidgets("actions")}
            surfaces={format.canvas}
            clipboard={depth.advanced && usesTimelineChrome ? commands.clipboard : null}
            zoom={zoom}
            onZoomChange={setZoom}
            onFit={fitZoom}
          />
        }
        strip={format.strip}
        slot={
          <RightSlot
            slot={slot}
            panels={studioSlotPanels({
              t, slot, currentMediaKind, inspector: format.inspector, setShareOpen, title, publisher, persistedProjectId,
              state,
            })}
          />
        }
        slotWidthPx={slot.widthPx}
      >
        <StudioEditorDialogs
          dialogs={dialogs}
          currentMediaKind={currentMediaKind}
          projectId={projectId}
          title={title}
          persistedProjectId={persistedProjectId}
          persistedProject={persistedProject}
          state={state}
          playback={playback}
          documentRuntime={documentRuntime}
          gameState={game.gameState}
          embedPath={searchParams.get("embedPath")}
          ensureRendered={ensureRendered}
        />
      </WorkspaceFrame>
    </AnonGateContext.Provider>
  );
}
