/**
 * The animation format's runtime: AnimationState + undo history, the
 * hydrated flag, header-driven playback, frame commit / select and the AI
 * "regenerate this frame" insert. Lifted out of StudioEditorV2 so the editor
 * composes runtimes; mounted unconditionally (harmless for other formats).
 */
import { useCallback, useState } from "react";
import {
  type AnimationState,
  createBlankAnimationState,
  updateFramePixels,
} from "@shared/animation-state";
import { drawBlobToCanvasFit } from "@/lib/studio/drawing/drawing-engine";
import type { ImageGenResult } from "@/lib/services/image-gen-engine";
import { useCanvasHistory } from "./use-canvas-history";

export function useAnimationRuntime() {
  // Same parallel-history pattern as the image runtime. The history wrapper is mounted unconditionally
  // (DRY: same `useCanvasHistory<T>` the Timeline + image runtimes use)
  // so the editor's undo/redo chrome doesn't fork by kind.
  const animationHistory = useCanvasHistory<AnimationState>(() => createBlankAnimationState());
  const {
    state: animationState,
    setState: setAnimationState,
    commit: animationCommit,
    reset: resetAnimationHistory,
    undo: animationUndo,
    redo: animationRedo,
    canUndo: animationCanUndo,
    canRedo: animationCanRedo,
  } = animationHistory;
  const [animationStateHydrated, setAnimationStateHydrated] = useState(false);
  // Animation playback — lifted out of `<AnimationStage>` so the
  // Play/Pause control lives in the studio HEADER (where video's Play and
  // game's Playtest live), not embedded in the canvas. The stage's rAF
  // loop reads this flag via its `isPlaying` prop.
  const [animationPlaying, setAnimationPlaying] = useState(false);
  // Structural frame edit (add / duplicate / delete / reorder) — applies
  // the new state AND pushes a history checkpoint so undo works. Selection
  // changes go through `setAnimationState` directly (ephemeral, no
  // checkpoint), matching how scene / level selection behaves.
  const commitAnimationState = useCallback(
    (next: AnimationState) => {
      setAnimationState(next);
      animationCommit();
    },
    [setAnimationState, animationCommit],
  );
  const selectAnimationFrame = useCallback(
    (frameId: string) => {
      setAnimationState((prev) => ({ ...prev, activeFrameId: frameId }));
    },
    [setAnimationState],
  );

  // AI-result animation-frame insert — overwrites the active frame's
  // pixels (default UX is "regenerate this frame"). Mirrors the
  // image-kind handler shape so the right-rail panel can call it
  // without AnimationStage being in the path. Cross-studio first-class
  // AI rollout: animation kind now has the same prompt UX as drawing.
  const handleAnimationAiGenerated = useCallback(
    async (result: ImageGenResult) => {
      const dataUrl = await drawBlobToCanvasFit(
        result.blob,
        animationState.width,
        animationState.height,
      );
      setAnimationState((prev) =>
        updateFramePixels(prev, prev.activeFrameId, dataUrl),
      );
      animationCommit();
    },
    [animationState.width, animationState.height, setAnimationState, animationCommit],
  );


  return {
    animationState,
    setAnimationState,
    animationCommit,
    resetAnimationHistory,
    animationUndo,
    animationRedo,
    animationCanUndo,
    animationCanRedo,
    animationStateHydrated,
    setAnimationStateHydrated,
    animationPlaying,
    setAnimationPlaying,
    commitAnimationState,
    selectAnimationFrame,
    handleAnimationAiGenerated,
  };
}
