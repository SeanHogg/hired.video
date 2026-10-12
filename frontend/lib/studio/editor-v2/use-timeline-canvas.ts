/**
 * The Timeline runtime's canvas: CanvasState behind the undo/redo history
 * (seeded from the local draft or the template), the active scene + the
 * selection restored alongside content on undo/redo (#592), and the live
 * mirrors the studio-editor bridge reads, plus the two ways the canvas moves
 * as a whole: `selectScene` (make a scene active + selected) and `loadCanvas`
 * (replace the canvas and clear undo — a load / seed / restore; `loadScript`
 * seeds it from a VideoScript). Lifted out of StudioEditorV2.
 */
import { useCallback, useRef, useState } from "react";
import type { Selection } from "./editor-types";
import type { VideoScript } from "@/types/video-script";
import type { CanvasState } from "./canvas-state";
import { scriptToCanvasState } from "./script-to-canvas";
import { useCanvasHistory } from "./use-canvas-history";
import { hydrateInitialState } from "./use-local-draft";

export function useTimelineCanvas(projectId: string, templateHint: string | null) {
  // Canvas state lives behind the history wrapper so every mutator
  // call participates in undo/redo. The (state, setState) pair is the
  // same shape useState would give us, so the rest of the editor
  // doesn't need to know history is in play.
  //
  // Selection + activeSceneId sidecar (#592): pro NLEs restore selection
  // alongside content on undo/redo so the user doesn't have to re-click
  // the widget they were editing. The refs below are populated by the
  // useState declarations further down — capture/restore close over the
  // refs (not the values) so the wiring stays valid through the
  // top-down render order.
  const selectionRef = useRef<Selection | null>(null);
  const activeSceneIdRef = useRef<string | null>(null);
  const setSelectionRef = useRef<((s: Selection) => void) | null>(null);
  const setActiveSceneIdRef = useRef<((id: string) => void) | null>(null);
  const history = useCanvasHistory<
    CanvasState,
    { selection: Selection | null; activeSceneId: string | null }
  >(() => hydrateInitialState(projectId, templateHint), {
    sidecar: {
      capture: () => ({
        selection: selectionRef.current,
        activeSceneId: activeSceneIdRef.current,
      }),
      restore: (s) => {
        if (s.selection !== null) setSelectionRef.current?.(s.selection);
        if (s.activeSceneId !== null) setActiveSceneIdRef.current?.(s.activeSceneId);
      },
    },
  });
  const { state } = history;

  const [activeSceneId, setActiveSceneId] = useState<string>(state.scenes[0].id);
  const [selection, setSelection] = useState<Selection>({
    kind: "scene",
    sceneId: state.scenes[0].id,
  });
  // Mirror the latest selection state into the history hook's sidecar
  // refs (#592). Done at render time, not in an effect, so the refs are
  // current before the next commit timer fires.
  selectionRef.current = selection;
  activeSceneIdRef.current = activeSceneId;
  setSelectionRef.current = setSelection;
  setActiveSceneIdRef.current = setActiveSceneId;
  // Live state mirror — lets the studio-editor bridge handle read the
  // current scene list at AI-tool-call time without re-registering on
  // every keystroke (the handle closes over this ref, not `state`).
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Make a scene the active one and select it. */
  const selectScene = useCallback((sceneId: string) => {
    setActiveSceneId(sceneId);
    setSelection({ kind: "scene", sceneId });
  }, []);

  /** Replace the canvas and clear undo (so undo can't go below what was just
   *  loaded), landing on its first scene — selected too, unless
   *  `keepSelection` (a version restore keeps the selection it had). */
  const { reset } = history;
  const loadCanvas = useCallback(
    (next: CanvasState, opts?: { keepSelection?: boolean }) => {
      reset(next);
      const firstSceneId = next.scenes[0]?.id;
      if (!firstSceneId) return;
      setActiveSceneId(firstSceneId);
      if (!opts?.keepSelection) setSelection({ kind: "scene", sceneId: firstSceneId });
    },
    [reset],
  );
  /** Seed the canvas from a script (e.g. the subject deep-link's AI pre-fill). */
  const loadScript = useCallback((script: VideoScript) => loadCanvas(scriptToCanvasState(script)), [loadCanvas]);

  return {
    history,
    activeSceneId,
    setActiveSceneId,
    selection,
    setSelection,
    selectScene,
    loadCanvas,
    loadScript,
    stateRef,
    activeSceneIdRef,
  };
}

export type TimelineCanvas = ReturnType<typeof useTimelineCanvas>;
