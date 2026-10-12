/**
 * The editor's command seams: clipboard, the recorder runtime (open action
 * sheet, Alt+Shift+R, record-as-scene), the studio-editor bridge the AI
 * CHRO's studio_* tools drive, and the keyboard shortcuts. Every entry wraps
 * the SAME callback the on-screen control fires (DRY). Lifted out of
 * StudioEditorV2.
 */
import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { mediaKindUsesCanvasStateAuthoring, type MediaKind } from "@shared/media-kinds";
import type { ActionId, Selection } from "./editor-types";
import { insertableWidgetKindsFor } from "./widget-catalog";
import type { WidgetsMode } from "@/lib/studio/use-focus-left-panel";
import { type CanvasState, makeRecordingScene } from "./canvas-state";
import { useCanvasClipboard } from "./use-canvas-clipboard";
import { useStudioShortcuts } from "./use-studio-shortcuts";
import { recordingModeForAction } from "@/lib/studio/recording-modes";
import {
  registerStudioEditor,
  unregisterStudioEditor,
  type StudioEditorHandle,
  type StudioRecordingMode,
} from "./studio-editor-bridge";
import type { useSceneMutators } from "./use-scene-mutators";
import type { WidgetActions } from "./use-widget-actions";

export type SceneMutators = ReturnType<typeof useSceneMutators>;

export interface EditorCommandsInput {
  state: CanvasState;
  setState: Dispatch<SetStateAction<CanvasState>>;
  /** Live mirrors the bridge handle reads at call time. */
  stateRef: MutableRefObject<CanvasState>;
  activeSceneIdRef: MutableRefObject<string | null>;
  activeSceneId: string;
  setActiveSceneId: Dispatch<SetStateAction<string>>;
  selection: Selection;
  setSelection: Dispatch<SetStateAction<Selection>>;
  /** Make a scene active + selected. */
  selectScene: (sceneId: string) => void;
  persistedProjectId: string | null;
  currentMediaKind: MediaKind;
  mutators: SceneMutators;
  widgetActions: WidgetActions;
  showLeftWidgets: (mode: WidgetsMode) => void;
  undo: () => void;
  redo: () => void;
  /** The `?capture=` deep-link's action, armed once on mount. */
  defaultAction: ActionId | null;
}

export function useEditorCommands({
  state,
  setState,
  stateRef,
  activeSceneIdRef,
  activeSceneId,
  setActiveSceneId,
  selection,
  setSelection,
  selectScene,
  persistedProjectId,
  currentMediaKind,
  mutators,
  widgetActions,
  showLeftWidgets,
  undo,
  redo,
  defaultAction,
}: EditorCommandsInput) {
  const { t } = useTranslation();
  const { insertWidget, addScene, duplicateScene, deleteScene, reorderScenes, updateScene } = mutators;
  const { addMediaWidget, placeScreenshot, deleteWidget } = widgetActions;

  // Open action sheet (recorder / voiceover / captions / …), LIFTED here
  // from ActionsPanel so the Alt+Shift+R shortcut and the AI CHRO can
  // open the recorder at runtime — and so the sheet survives left-tab
  // switches (ActionsPanel unmounts when the user flips to Widgets).
  // Seeded once from the `?capture=` deep-link (mountTimeDefaults).
  const [openAction, setOpenAction] = useState<ActionId | null>(defaultAction);
  // Whether the NEXT finished recording becomes its own full-bleed scene
  // (Alt+Shift+R / AI path → true) or an overlay widget on the active
  // scene (ActionsPanel recorder tiles → false). Reset to false whenever
  // an action is opened through the panel's own tiles.
  const [recordAsScene, setRecordAsScene] = useState(false);

  // ───── Clipboard + keyboard shortcuts
  // Cut / copy / paste live in their own hook so the toolbar buttons
  // and the keyboard listener call the SAME action functions (DRY).
  // The clipboard targets whatever the user has selected — widget
  // when a widget is selected, the active scene otherwise — so a
  // single Ctrl+C / Ctrl+V loop covers both.
  const clipboard = useCanvasClipboard({
    state,
    selection,
    activeSceneId,
    setState,
    setActiveSceneId,
    setSelection,
  });
  // ───── Recorder runtime seams (Alt+Shift+R + AI CHRO)
  // What ActionsPanel calls from its OWN tiles + on close. Opening via a
  // tile is the legacy overlay path, so reset `recordAsScene` — except
  // for a recorder → recorder source swap (the in-panel picker), which
  // keeps the session's scene/overlay choice.
  const handleOpenActionChange = useCallback(
    (next: ActionId | null) => {
      const isSourceSwap =
        recordingModeForAction(openAction) !== null &&
        recordingModeForAction(next) !== null;
      setOpenAction(next);
      if (!isSourceSwap) setRecordAsScene(false);
    },
    [openAction],
  );
  // Runtime entry used by the Alt+Shift+R shortcut AND the studio-editor
  // bridge: surface the Actions tab with the recorder armed to `mode`.
  // The finished clip becomes its own full-bleed scene by default
  // (slide → recording → slide); pass `asScene: false` for overlay.
  const openRecorder = useCallback(
    (mode: StudioRecordingMode, opts?: { asScene?: boolean }) => {
      showLeftWidgets("actions");
      setRecordAsScene(opts?.asScene ?? true);
      setOpenAction(mode);
    },
    [showLeftWidgets],
  );
  // A finished recording becomes its OWN full-bleed scene, inserted right
  // after the active scene, duration matched to the clip. The renderer
  // already concatenates scenes sequentially, so save/publish stitches
  // slide → recording → slide with no special stitch path.
  const addRecordingScene = useCallback(
    (url: string, durationSeconds: number) => {
      const label =
        openAction === "webcam"
          ? t("studio.editorV2.recordingWebcam")
          : openAction === "screen-pip"
            ? t("studio.editorV2.recordingScreenPip")
            : t("studio.editorV2.recordingScreen");
      const scene = makeRecordingScene(label, url, durationSeconds);
      setState((prev) => {
        const idx = prev.scenes.findIndex(
          (s) => s.id === activeSceneIdRef.current,
        );
        const scenes = [...prev.scenes];
        scenes.splice(idx < 0 ? scenes.length : idx + 1, 0, scene);
        return { ...prev, scenes };
      });
      selectScene(scene.id);
    },
    [openAction, t, selectScene],
  );

  // Register this editor with the studio-editor bridge so the AI CHRO's
  // studio_* tools can drive it. Every method wraps the SAME callback the
  // on-screen control fires (DRY); the handle reads live scene state via
  // `stateRef`, so it never goes stale and never needs re-registering on
  // edits. Self-unregisters on unmount → tools fail loudly elsewhere.
  useEffect(() => {
    const canvasAuthoring = mediaKindUsesCanvasStateAuthoring(currentMediaKind);
    const handle: StudioEditorHandle = {
      projectId: persistedProjectId,
      mediaKind: currentMediaKind,
      supportsScenes: canvasAuthoring,
      supportsRecording: canvasAuthoring,
      getActiveSceneId: () => activeSceneIdRef.current,
      listScenes: () =>
        stateRef.current.scenes.map((s) => ({
          id: s.id,
          label: s.label,
          durationSeconds: s.durationSeconds,
          widgetCount: s.widgets.length,
          active: s.id === activeSceneIdRef.current,
        })),
      insertableWidgetKinds: () => insertableWidgetKindsFor(currentMediaKind),
      insertWidget: (kind) => insertWidget(kind),
      addScene: () => addScene(),
      duplicateScene: (sceneId) => duplicateScene(sceneId),
      deleteScene: (sceneId) => deleteScene(sceneId),
      reorderScenes: (orderedIds) => reorderScenes(orderedIds),
      setActiveScene: (sceneId) => selectScene(sceneId),
      setSceneBackground: (sceneId, color) =>
        updateScene(sceneId, { backgroundColor: color, backgroundEffect: null }),
      addImageWidget: (url) => addMediaWidget("image", url),
      addVideoWidget: (url, durationSeconds) =>
        addMediaWidget("video", url, durationSeconds),
      captureScreenshot: () => placeScreenshot(),
      openRecorder: (mode, opts) => {
        if (!canvasAuthoring) {
          throw new Error(
            "Recording isn't available for this project type. Open a video, podcast, voice, or comic in Studio.",
          );
        }
        openRecorder(mode, opts);
      },
    };
    registerStudioEditor(handle);
    return () => unregisterStudioEditor(handle);
  }, [
    persistedProjectId,
    currentMediaKind,
    insertWidget,
    addScene,
    duplicateScene,
    deleteScene,
    reorderScenes,
    updateScene,
    addMediaWidget,
    placeScreenshot,
    openRecorder,
    selectScene,
  ]);

  // Delete handler — uses the SAME mutators that the on-screen Delete
  // buttons fire (DRY) so keyboard + mouse paths can never diverge. We
  // refuse to drop the last remaining scene because the editor invariant
  // is "always one scene to draw on" (deleteScene already enforces this).
  const onDeleteSelection = useCallback(() => {
    if (selection.kind === "widget") {
      deleteWidget(selection.widgetId);
      return;
    }
    if (state.scenes.length > 1) deleteScene(selection.sceneId);
  }, [selection, deleteWidget, deleteScene, state.scenes.length]);
  useStudioShortcuts({
    onUndo: undo,
    onRedo: redo,
    onCopy: clipboard.copy,
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onDelete: onDeleteSelection,
    // Alt+Shift+R → screen recorder as a new scene. "Screen record" is
    // the literal ask users keep typing into the AI chat; the recording
    // lands as its own full-bleed scene (slide → recording → slide).
    onOpenRecorder: () => openRecorder("screen", { asScene: true }),
  });

  return { clipboard, openAction, recordAsScene, handleOpenActionChange, addRecordingScene };
}

export type EditorCommands = ReturnType<typeof useEditorCommands>;
