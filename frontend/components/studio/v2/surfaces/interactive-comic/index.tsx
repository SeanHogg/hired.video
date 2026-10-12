/**
 * The interactive comic (Comic+) canvas surface (#1960): branch-graph
 * authoring. Its per-page CanvasState is authored on the Timeline surface.
 */
import InteractiveComicStage from "@/components/studio/comic/InteractiveComicStage";
import type { InteractiveComicSurfaceCtx } from "../types";

export function interactiveComicCanvas(ctx: InteractiveComicSurfaceCtx) {
  const { interactiveComicState, setInteractiveComicState, interactiveComicStateHydrated } =
    ctx.interactiveComic;
  // Comic+ branch-graph authoring (#1960). `onChange` writes
  // the whole graph through the history setState (debounced
  // auto-commit), so edits are undoable + flow into save.
  return interactiveComicStateHydrated ? (
    <div className="absolute inset-0 overflow-auto">
      <InteractiveComicStage
        state={interactiveComicState}
        onChange={(next) => setInteractiveComicState(() => next)}
      />
    </div>
  ) : null;
}
